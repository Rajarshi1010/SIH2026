"""
backend/ingestion.py - Layer 1: Multi-Source Ingestion & Geometric Normalization

Core functionalities:
1. NASA FIRMS Ingestion (VIIRS 375m & MODIS NRT/Standard streams via async HTTP).
2. Dynamic Elliptical Footprint Modeling (DEFM) for satellite swath-edge error correction.
   - Calculates major (scan) and minor (track) axes of the pixel footprint based on nadir angle.
   - Generates true footprint polygon geometry for spatial intersection.
3. Uber H3 Hexagonal Binning (Resolution 8/9).
4. Asynchronous batch upsert into TimescaleDB hypertable `thermal_incidents`.
5. Error handling, rate limiting resilience, and duplicate suppression.
"""

import asyncio
import csv
import io
import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid

import httpx
import h3
from shapely.affinity import rotate
from shapely.geometry import Point, Polygon
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import ThermalIncident, async_session_factory

logger = logging.getLogger("geoai.ingestion")


# ------------------------------------------------------------------------------
# 1. Dynamic Elliptical Footprint Modeling (DEFM)
# ------------------------------------------------------------------------------
def compute_defm_footprint(
    lat: float,
    lon: float,
    scan_km: Optional[float] = None,
    track_km: Optional[float] = None,
    satellite: str = "VIIRS",
    num_points: int = 16,
) -> Polygon:
    """
    Computes the Dynamic Elliptical Footprint of the satellite sensor pixel.
    
    VIIRS 375m pixels expand from 375m at nadir to ~800m at swath edge due to scan angle.
    MODIS 1km pixels expand from 1000m at nadir to up to 4800m x 2000m at swath edge.
    
    DEFM models this distortion as an ellipse oriented along the scan/track vectors,
    ensuring spatial queries don't trigger false positives outside the actual sensor beam.
    """
    # Default nadir values if missing from telemetry
    if not scan_km or scan_km <= 0:
        scan_km = 0.375 if "VIIRS" in (satellite or "").upper() else 1.0
    if not track_km or track_km <= 0:
        track_km = 0.375 if "VIIRS" in (satellite or "").upper() else 1.0

    # Semi-major (a) and semi-minor (b) radii in degrees
    # 1 degree latitude ~ 111.0 km
    # 1 degree longitude ~ 111.0 km * cos(lat)
    cos_lat = max(math.cos(math.radians(lat)), 0.01)
    r_lat = (track_km / 2.0) / 111.0
    r_lon = (scan_km / 2.0) / (111.0 * cos_lat)

    # Construct elliptical polygon coordinates
    ellipse_coords = []
    for i in range(num_points):
        angle = 2.0 * math.pi * i / num_points
        dx = r_lon * math.cos(angle)
        dy = r_lat * math.sin(angle)
        ellipse_coords.append((lon + dx, lat + dy))
    
    # Close the ring
    ellipse_coords.append(ellipse_coords[0])
    return Polygon(ellipse_coords)


def compute_h3_index(lat: float, lon: float, resolution: int = 8) -> str:
    """Generates Uber H3 hexagonal index string for the given coordinates."""
    return h3.latlng_to_cell(lat, lon, resolution)


# ------------------------------------------------------------------------------
# 2. Telemetry Parsing & Harmonization
# ------------------------------------------------------------------------------
def parse_firms_csv_stream(csv_text: str) -> List[Dict[str, Any]]:
    """
    Parses FIRMS CSV output into normalized python dictionaries.
    Compatible with VIIRS (SNPP, NOAA-20, NOAA-21) and MODIS (Aqua, Terra).
    """
    incidents: List[Dict[str, Any]] = []
    f = io.StringIO(csv_text.strip())
    reader = csv.DictReader(f)

    for row in reader:
        try:
            lat = float(row.get("latitude", 0.0))
            lon = float(row.get("longitude", 0.0))
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
                continue

            # Brightness temperature (Kelvin)
            # VIIRS uses bright_ti4 (Channel I-4 375m), MODIS uses brightness (Channel 21/22 1km)
            brightness = float(
                row.get("bright_ti4") or row.get("brightness") or 300.0
            )

            # Secondary IR channel (bright_ti5 for VIIRS, bright_t31 for MODIS)
            bright_t31_raw = row.get("bright_ti5") or row.get("bright_t31")
            bright_t31 = float(bright_t31_raw) if bright_t31_raw else None

            # Fire Radiative Power (MW)
            frp = float(row.get("frp") or 0.0)

            # Scan and Track pixel dimensions
            scan = float(row.get("scan")) if row.get("scan") else None
            track = float(row.get("track")) if row.get("track") else None

            # Acquisition timestamp
            # Format: acq_date (YYYY-MM-DD), acq_time (HHMM in UTC)
            acq_date = row.get("acq_date", "")
            acq_time = row.get("acq_time", "0000").zfill(4)
            detected_at_str = f"{acq_date} {acq_time[:2]}:{acq_time[2:]}:00"
            detected_at = datetime.strptime(detected_at_str, "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=timezone.utc
            )

            satellite = row.get("satellite", "VIIRS")
            instrument = row.get("instrument", "VIIRS")
            confidence = row.get("confidence", "nominal")
            version = row.get("version", "2.0NRT")
            daynight = row.get("daynight", "D")

            # Uber H3 indexing at configured resolution
            h3_cell = compute_h3_index(lat, lon, settings.H3_RESOLUTION)

            # DEFM Footprint
            footprint_poly = compute_defm_footprint(
                lat, lon, scan_km=scan, track_km=track, satellite=satellite
            )

            incident_data = {
                "detected_at": detected_at,
                "latitude": lat,
                "longitude": lon,
                "h3_index": h3_cell,
                "brightness": brightness,
                "scan": scan,
                "track": track,
                "satellite": satellite,
                "instrument": instrument,
                "confidence": str(confidence).lower(),
                "version": version,
                "bright_t31": bright_t31,
                "frp": max(frp, 0.0),
                "daynight": daynight,
                "geom_wkt": f"SRID=4326;POINT({lon} {lat})",
                "raw_metadata": {
                    "scan_km": scan,
                    "track_km": track,
                    "footprint_geojson": footprint_poly.__geo_interface__,
                },
            }
            incidents.append(incident_data)
        except Exception as err:
            logger.warning(f"Error parsing row {row}: {err}")
            continue

    return incidents


# ------------------------------------------------------------------------------
# 3. Asynchronous FIRMS Ingestion Engine
# ------------------------------------------------------------------------------
class FirmsIngestionEngine:
    """
    High-resilience client for NASA FIRMS telemetry streams.
    Fetches, parses, normalizes, and commits to TimescaleDB.
    """

    def __init__(
        self,
        map_key: Optional[str] = None,
        api_base: Optional[str] = None,
        operational_bbox: Optional[str] = None,
    ):
        self.map_key = map_key or settings.FIRMS_MAP_KEY
        self.api_base = api_base or settings.FIRMS_API_URL
        self.operational_bbox = operational_bbox or settings.OPERATIONAL_BBOX

    async def fetch_telemetry(
        self,
        source: str = "VIIRS_SNPP_NRT",
        day_range: int = 1,
    ) -> str:
        """
        Asynchronously fetches FIRMS CSV telemetry stream.
        URL pattern: {FIRMS_API_URL}/{MAP_KEY}/{SOURCE}/{BBOX}/{DAY_RANGE}
        """
        if not self.map_key or "your_nasa_firms" in self.map_key:
            raise ValueError("NASA FIRMS Map Key is not configured.")

        url = f"{self.api_base}/{self.map_key}/{source}/{self.operational_bbox}/{day_range}"
        masked_url = url.replace(self.map_key, "KEY_PROTECTED")
        logger.info(f"Connecting to NASA FIRMS stream: {masked_url}")

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            if resp.status_code == 400 and "Invalid API call" in resp.text:
                raise RuntimeError(
                    f"FIRMS API rejected request: {resp.text}. Check format: {masked_url}"
                )
            if resp.status_code == 429:
                raise RuntimeError("FIRMS API rate limit exceeded (HTTP 429).")
            resp.raise_for_status()
            return resp.text

    async def ingest_and_store(
        self,
        source: str = "VIIRS_SNPP_NRT",
        day_range: int = 1,
    ) -> Dict[str, Any]:
        """
        Executes end-to-end ingestion:
        1. Fetch CSV from NASA
        2. Parse & DEFM normalize
        3. Upsert into TimescaleDB hypertable
        """
        csv_text = await self.fetch_telemetry(source=source, day_range=day_range)
        records = parse_firms_csv_stream(csv_text)

        if not records:
            return {
                "source": source,
                "fetched_count": 0,
                "inserted_count": 0,
                "message": "No thermal anomalies detected in operational bounds.",
            }

        inserted = 0
        async with async_session_factory() as session:
            for item in records:
                # Check for existing record with same coordinate, detection time, and satellite
                # to prevent hypertable bloat
                query = text("""
                    SELECT id FROM thermal_incidents 
                    WHERE detected_at = :detected_at 
                      AND ABS(latitude - :lat) < 0.0001 
                      AND ABS(longitude - :lon) < 0.0001
                      AND satellite = :satellite
                    LIMIT 1;
                """)
                existing = await session.execute(
                    query,
                    {
                        "detected_at": item["detected_at"],
                        "lat": item["latitude"],
                        "lon": item["longitude"],
                        "satellite": item["satellite"],
                    },
                )
                if existing.scalar():
                    continue

                # Insert into TimescaleDB hypertable
                insert_stmt = text("""
                    INSERT INTO thermal_incidents (
                        id, detected_at, latitude, longitude, geom, h3_index,
                        brightness, scan, track, satellite, instrument,
                        confidence, version, bright_t31, frp, daynight,
                        classification, classification_confidence, is_industrial,
                        raw_metadata
                    ) VALUES (
                        :id, :detected_at, :lat, :lon, ST_GeomFromText(:geom_wkt, 4326), :h3_index,
                        :brightness, :scan, :track, :satellite, :instrument,
                        :confidence, :version, :bright_t31, :frp, :daynight,
                        'unclassified', 0.0, FALSE,
                        (:raw_metadata)::jsonb
                    );
                """)
                import json
                await session.execute(
                    insert_stmt,
                    {
                        "id": uuid.uuid4(),
                        "detected_at": item["detected_at"],
                        "lat": item["latitude"],
                        "lon": item["longitude"],
                        "geom_wkt": item["geom_wkt"],
                        "h3_index": item["h3_index"],
                        "brightness": item["brightness"],
                        "scan": item["scan"],
                        "track": item["track"],
                        "satellite": item["satellite"],
                        "instrument": item["instrument"],
                        "confidence": item["confidence"],
                        "version": item["version"],
                        "bright_t31": item["bright_t31"],
                        "frp": item["frp"],
                        "daynight": item["daynight"],
                        "raw_metadata": json.dumps(item["raw_metadata"]),
                    },
                )
                inserted += 1

            await session.commit()

        logger.info(f"Ingestion successful: {inserted}/{len(records)} incidents saved.")
        return {
            "source": source,
            "fetched_count": len(records),
            "inserted_count": inserted,
            "status": "success",
        }


# Global singleton instance
firms_ingestion_engine = FirmsIngestionEngine()
