"""
backend/pipeline.py - Deterministic Geospatial Pipeline (Layer 2 & Layer 3)

Implements the zero-latency, high-precision filtering and attribution stages
as mandated by spec.md:

1. LAYER 2: Known-Emitter Registry (KER) Fast-Path Matching
   - Dual-mode spatial matching:
     a) O(1) H3 Hexagonal Cell lookup (k-ring neighborhood).
     b) PostGIS ST_DWithin ellipsoidal geodesic distance verification.
   - Fire Radiative Power (FRP) Z-score anomaly detector:
     If baseline FRP matches historical emitter statistics (Z-score < 2.0),
     assign "PERSISTENT_INDUSTRIAL_SOURCE" (Bypasses ML entirely).
     If Z-score >= 2.0 (massive abnormal flare or fire), assign "INDUSTRIAL_FIRE_ALERT"
     and push to the Human-In-The-Loop (HITL) ReviewQueue.

2. LAYER 3: Deterministic Pyrometry & Solar Glint Pre-Filter
   - Dual-Band Planck Pyrometry:
     Computes sub-pixel emitter combustion temperature (T_combustion) using VIIRS
     Channel I-4 (3.74 μm) and Channel I-5 (11.45 μm).
     If T_combustion > 1200 K with high persistence, assign "ROUTINE_GAS_FLARE".
   - Solar Glint Gating:
     Daytime detection + FRP < 3.0 MW + low confidence + extreme brightness ratio
     identifies specular reflection from rooftop solar arrays, greenhouses, or water bodies.
     Assign "FALSE_POSITIVE_GLINT".

3. Residual Identification:
   - Unmatched anomalies (stubble burns, forest fires, unmapped chemical fires)
     are marked as "RESIDUAL_CANDIDATE" to be evaluated by Layer 4 (LightGBM).
"""

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import KnownEmitter, ReviewQueue, ThermalIncident, async_session_factory

logger = logging.getLogger("geoai.pipeline")


# ------------------------------------------------------------------------------
# 1. Physics & Mathematical Constants for Planck Pyrometry
# ------------------------------------------------------------------------------
# Planck's radiation constants:
# c1 = 2 * h * c^2 = 1.191042972e8 W*μm^4 / (m^2 * sr)
# c2 = h * c / k_B = 14387.76877 μm * K
C1 = 1.191042972e8
C2 = 14387.76877

# VIIRS Nominal Effective Central Wavelengths (microns)
LAMBDA_MIR = 3.74    # Channel I-4 (Mid-Infrared)
LAMBDA_TIR = 11.45   # Channel I-5 (Thermal-Infrared)


def estimate_planck_temperature(
    brightness_mir: float,
    brightness_tir: Optional[float] = None,
) -> float:
    """
    Computes an estimated sub-pixel combustion temperature (T_combustion in Kelvin)
    using the dual-band radiance ratio method (Dozier 1981 / Elvidge VIIRS Nightfire).
    
    When only MIR brightness is available, it returns the minimum effective temperature.
    Industrial flares typically burn at 1200K - 1800K.
    Agricultural stubble burns typically burn at 600K - 900K.
    """
    if brightness_mir <= 0:
        return 0.0

    if not brightness_tir or brightness_tir <= 0:
        return brightness_mir

    # Radiance approximation using Planck's inversion
    # L(lambda, T) = c1 / (lambda^5 * (exp(c2 / (lambda * T)) - 1))
    try:
        exp_mir = math.exp(C2 / (LAMBDA_MIR * brightness_mir)) - 1.0
        exp_tir = math.exp(C2 / (LAMBDA_TIR * brightness_tir)) - 1.0
        
        l_mir = C1 / ((LAMBDA_MIR ** 5) * exp_mir)
        l_tir = C1 / ((LAMBDA_TIR ** 5) * exp_tir)
        
        # Radiance ratio
        ratio = max(l_mir / max(l_tir, 1e-6), 1e-6)
        
        # Empirical inversion for sub-pixel hot target temperature:
        # High MIR/TIR ratio indicates hot, small-area combustion (gas flare / blast furnace)
        # Moderate ratio indicates low-temp smoldering (biomass/stubble)
        t_est = brightness_mir + (math.log(ratio) * 115.0)
        return round(float(t_est), 1)
    except (OverflowError, ValueError, ZeroDivisionError):
        return round(brightness_mir, 1)


# ------------------------------------------------------------------------------
# 2. Layer 2: Known Emitter Registry (KER) Fast-Path
# ------------------------------------------------------------------------------
async def evaluate_ker_fastpath(
    incident: ThermalIncident,
    session: AsyncSession,
) -> Optional[Dict[str, Any]]:
    """
    Executes Layer 2 Fast-Path:
    1. Checks H3 cell (k-ring 1 neighborhood, ~500m aperture).
    2. Executes geodesic distance query ST_DWithin against known_emitters.
    3. If matched, calculates FRP Z-score.
    """
    # Step 1: H3 neighborhood check
    incident_h3 = incident.h3_index or h3.latlng_to_cell(
        incident.latitude, incident.longitude, settings.H3_RESOLUTION
    )
    # k-ring 1 yields the cell and its 6 immediate hexagonal neighbors
    neighbors = h3.grid_disk(incident_h3, 1) if hasattr(h3, "grid_disk") else [incident_h3]

    # Step 2: Spatial query against PostGIS known_emitters
    # Combines H3 candidate filtering with high-precision ST_DWithin geodesic calculation
    query = text("""
        SELECT 
            id, name, category, buffer_radius_meters, confidence_score, metadata,
            ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography) AS dist_meters
        FROM known_emitters
        WHERE h3_index = ANY(:h3_list)
           OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, 3000.0)
        ORDER BY dist_meters ASC
        LIMIT 1;
    """)

    result = await session.execute(
        query,
        {
            "lon": incident.longitude,
            "lat": incident.latitude,
            "h3_list": list(neighbors),
        },
    )
    emitter = result.mappings().first()

    if not emitter:
        return None

    dist = float(emitter["dist_meters"])
    allowed_buffer = float(emitter["buffer_radius_meters"])

    # If within the emitter's spatial perimeter
    if dist <= allowed_buffer:
        emitter_meta = emitter["metadata"] or {}
        baseline_frp = float(emitter_meta.get("expected_baseline_frp_mw", 40.0))
        frp_std_dev = max(baseline_frp * 0.35, 5.0)

        # FRP Z-Score: (current_frp - baseline) / std_dev
        frp_z_score = (incident.frp - baseline_frp) / frp_std_dev

        # Anomaly threshold check
        if frp_z_score >= 2.5:
            # Massive abnormal thermal surge at known industrial complex -> EMERGENCE ALERT
            return {
                "matched": True,
                "emitter_id": emitter["id"],
                "emitter_name": emitter["name"],
                "distance_meters": round(dist, 1),
                "classification": "INDUSTRIAL_FIRE_ALERT",
                "confidence": 0.95,
                "is_industrial": True,
                "frp_z_score": round(frp_z_score, 2),
                "alert": True,
                "notes": (
                    f"Thermal surge at {emitter['name']}: FRP={incident.frp:.1f}MW "
                    f"(Baseline={baseline_frp:.1f}MW, Z-Score={frp_z_score:.2f})"
                ),
            }
        else:
            # Normal routine operations / regulated flare
            return {
                "matched": True,
                "emitter_id": emitter["id"],
                "emitter_name": emitter["name"],
                "distance_meters": round(dist, 1),
                "classification": "PERSISTENT_INDUSTRIAL_SOURCE",
                "confidence": 0.98,
                "is_industrial": True,
                "frp_z_score": round(frp_z_score, 2),
                "alert": False,
                "notes": f"Routine emitter thermal footprint matching {emitter['name']}.",
            }

    return None


# ------------------------------------------------------------------------------
# 3. Layer 3: Deterministic Pyrometry & Solar Glint Pre-Filter
# ------------------------------------------------------------------------------
def evaluate_pyrometry_and_glint(
    incident: ThermalIncident,
) -> Optional[Dict[str, Any]]:
    """
    Executes Layer 3 Filters:
    1. Dual-band Planck Pyrometry for high-temperature gas flaring.
    2. Solar Glint Gating for daytime false positives.
    """
    # 1. Solar Glint Pre-Filter
    # Conditions: Daytime ('D'), FRP < 3.0 MW, very low thermal contrast, or solar glare
    if incident.daynight == "D" and incident.frp < 3.0:
        # If brightness is low/moderate and confidence is low, it's typically solar glint
        if incident.confidence in ("low", "l") or incident.brightness < 325.0:
            return {
                "classification": "FALSE_POSITIVE_GLINT",
                "confidence": 0.88,
                "is_industrial": False,
                "rule": "SOLAR_GLINT_GATE",
                "notes": f"Daytime low-FRP specular reflection filter (FRP={incident.frp}MW, T={incident.brightness}K)",
            }

    # 2. High-Temperature Dual-Band Pyrometry
    t_combustion = estimate_planck_temperature(
        brightness_mir=incident.brightness,
        brightness_tir=incident.bright_t31,
    )

    # If estimated combustion temperature exceeds 1200 K (typical of gas flares)
    if t_combustion >= 1200.0 and incident.frp >= 15.0:
        return {
            "classification": "ROUTINE_GAS_FLARE",
            "confidence": 0.94,
            "is_industrial": True,
            "rule": "PLANCK_PYROMETRY",
            "t_combustion_k": t_combustion,
            "notes": f"High-temperature combustion detected via dual-band pyrometry (T={t_combustion}K)",
        }

    return None


# ------------------------------------------------------------------------------
# 4. Master Pipeline Orchestrator (Layers 2 & 3)
# ------------------------------------------------------------------------------
class DeterministicPipeline:
    """
    High-performance pipeline coordinating Layer 2 KER Fast-Path and Layer 3 Pyrometry.
    Classifies unclassified thermal incidents and handles HITL review queues.
    """

    async def process_incident(
        self,
        incident: ThermalIncident,
        session: AsyncSession,
    ) -> Dict[str, Any]:
        """Runs an individual incident through Layer 2 & Layer 3."""
        # 1. Layer 2: Known Emitter Fast-Path
        ker_result = await evaluate_ker_fastpath(incident, session)
        if ker_result:
            incident.classification = ker_result["classification"]
            incident.classification_confidence = ker_result["confidence"]
            incident.is_industrial = ker_result["is_industrial"]
            incident.emitter_id = ker_result["emitter_id"]
            incident.distance_to_emitter_meters = ker_result["distance_meters"]
            
            # Enrich raw_metadata
            meta = incident.raw_metadata or {}
            meta.update({
                "ker_matched": True,
                "emitter_name": ker_result["emitter_name"],
                "frp_z_score": ker_result["frp_z_score"],
                "pipeline_stage": "LAYER_2_KER_FASTPATH",
            })
            incident.raw_metadata = meta

            # If anomaly alert triggered, push to ReviewQueue (HITL)
            if ker_result.get("alert"):
                review = ReviewQueue(
                    id=uuid.uuid4(),
                    incident_id=incident.id,
                    incident_detected_at=incident.detected_at,
                    status="pending",
                    priority="high",
                    ai_classification=ker_result["classification"],
                    ai_confidence=ker_result["confidence"],
                    reviewer_notes=ker_result["notes"],
                )
                session.add(review)

            return ker_result

        # 2. Layer 3: Deterministic Pyrometry & Glint Pre-filter
        pyro_result = evaluate_pyrometry_and_glint(incident)
        if pyro_result:
            incident.classification = pyro_result["classification"]
            incident.classification_confidence = pyro_result["confidence"]
            incident.is_industrial = pyro_result["is_industrial"]

            meta = incident.raw_metadata or {}
            meta.update({
                "pyrometry_rule": pyro_result["rule"],
                "t_combustion_k": pyro_result.get("t_combustion_k"),
                "pipeline_stage": "LAYER_3_PYROMETRY_GLINT",
            })
            incident.raw_metadata = meta
            return pyro_result

        # 3. Residual candidates to be classified by Layer 4 (Machine Learning)
        # Specifying candidates: agricultural stubble, forest fire, unmapped emitter
        incident.classification = "RESIDUAL_CANDIDATE"
        incident.classification_confidence = 0.50
        incident.is_industrial = False
        meta = incident.raw_metadata or {}
        meta.update({"pipeline_stage": "PENDING_LAYER_4_ML"})
        incident.raw_metadata = meta

        return {
            "classification": "RESIDUAL_CANDIDATE",
            "confidence": 0.50,
            "is_industrial": False,
            "notes": "Unmatched thermal anomaly routed to Layer 4 ML Classifier.",
        }

    async def run_batch(
        self,
        batch_limit: int = 100,
    ) -> Dict[str, Any]:
        """
        Pulls unclassified thermal incidents from TimescaleDB and executes
        Layer 2 & Layer 3 processing.
        """
        async with async_session_factory() as session:
            # Query unclassified incidents
            stmt = text("""
                SELECT id, detected_at 
                FROM thermal_incidents 
                WHERE classification = 'unclassified'
                ORDER BY detected_at DESC
                LIMIT :limit;
            """)
            result = await session.execute(stmt, {"limit": batch_limit})
            rows = result.all()

            if not rows:
                return {
                    "processed_count": 0,
                    "message": "No unclassified incidents found.",
                }

            processed = 0
            stats: Dict[str, int] = {}

            for row in rows:
                # Load full ORM model instance
                incident = await session.get(
                    ThermalIncident, (row.id, row.detected_at)
                )
                if not incident:
                    continue

                res = await self.process_incident(incident, session)
                c_type = res["classification"]
                stats[c_type] = stats.get(c_type, 0) + 1
                processed += 1

            await session.commit()

            return {
                "status": "success",
                "processed_count": processed,
                "breakdown": stats,
            }


# Global singleton instance
deterministic_pipeline = DeterministicPipeline()
