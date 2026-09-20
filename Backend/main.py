"""
backend/main.py - GeoAI Industrial Fire Classifier API Entrypoint

Configures FastAPI lifespan management, asynchronous health probes for PostgreSQL/PostGIS
and Redis, CORS middleware, and production-grade monitoring endpoints.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from fastapi import APIRouter, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis.asyncio as aioredis
from sqlalchemy import text

from config import settings
from database import engine
from schemas import SystemHealthResponse

# Configure structured application logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] [%(name)s]: %(message)s",
)
logger = logging.getLogger("geoai_api")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    Validates PostgreSQL + PostGIS extension and Redis connectivity on boot.
    Gracefully disposes connections on shutdown.
    """
    logger.info("Initializing %s (Env: %s)...", settings.APP_NAME, settings.APP_ENV)

    # 1. Initialize and probe Redis connection
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_connect_timeout=3,
    )
    app.state.redis = redis_client

    try:
        await redis_client.ping()
        logger.info("Redis cache connection established successfully.")
    except Exception as exc:
        logger.warning("Redis initial ping check warning: %s", exc)

    # 2. Probe PostgreSQL and verify PostGIS extension
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1;"))
            result = await conn.execute(text("SELECT PostGIS_Version();"))
            postgis_ver = result.scalar()
            logger.info("PostgreSQL connected successfully. PostGIS Version: %s", postgis_ver)
    except Exception as exc:
        logger.warning("PostgreSQL/PostGIS initial ping check warning: %s", exc)

    logger.info("System startup sequence completed.")

    # 3. Start automated telemetry polling worker
    from tasks import polling_worker
    polling_worker.start()
    logger.info("Automated background polling worker active.")

    yield

    # Shutdown sequence
    logger.info("Executing graceful shutdown...")
    polling_worker.stop()
    logger.info("Automated polling worker stopped.")

    if hasattr(app.state, "redis") and app.state.redis:
        await app.state.redis.aclose()
        logger.info("Redis connection pool closed.")

    await engine.dispose()
    logger.info("SQLAlchemy database connection engine disposed.")


app = FastAPI(
    title=settings.APP_NAME,
    description="GeoAI Industrial Fire Classifier - Remote Sensing Anomaly Detection & Facility Attribution",
    version="1.0.0",
    debug=settings.DEBUG,
    lifespan=lifespan,
)

# ------------------------------------------------------------------------------
# CORS Middleware
# ------------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# API V1 Router
# ------------------------------------------------------------------------------
api_v1_router = APIRouter(prefix=settings.API_V1_STR)


@api_v1_router.get(
    "/health",
    response_model=SystemHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="System Health & Infrastructure Diagnostics",
    description="Probes PostgreSQL, PostGIS extension, and Redis cache with active latency measurement.",
)
async def health_check() -> JSONResponse:
    """Active diagnostic probe evaluating infrastructure components."""
    now_utc = datetime.now(timezone.utc)
    db_status: Dict[str, Any] = {"status": "unhealthy", "latency_ms": None}
    redis_status: Dict[str, Any] = {"status": "unhealthy", "latency_ms": None}

    # 1. Probe Database & PostGIS
    db_start = time.perf_counter()
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1;"))
            postgis_result = await conn.execute(text("SELECT PostGIS_Version();"))
            postgis_version = postgis_result.scalar()
            db_latency = round((time.perf_counter() - db_start) * 1000, 2)
            db_status = {
                "status": "connected",
                "latency_ms": db_latency,
                "postgis_version": postgis_version,
            }
    except Exception as exc:
        db_status = {
            "status": "error",
            "error": str(exc),
            "latency_ms": round((time.perf_counter() - db_start) * 1000, 2),
        }

    # 2. Probe Redis
    redis_start = time.perf_counter()
    try:
        redis_conn = getattr(app.state, "redis", None)
        if redis_conn:
            await redis_conn.ping()
            redis_latency = round((time.perf_counter() - redis_start) * 1000, 2)
            redis_status = {
                "status": "connected",
                "latency_ms": redis_latency,
            }
        else:
            redis_status = {"status": "not_initialized"}
    except Exception as exc:
        redis_status = {
            "status": "error",
            "error": str(exc),
            "latency_ms": round((time.perf_counter() - redis_start) * 1000, 2),
        }

    # Determine overall system health state
    is_db_ok = db_status.get("status") == "connected"
    is_redis_ok = redis_status.get("status") == "connected"

    if is_db_ok and is_redis_ok:
        overall_status = "healthy"
        http_status = status.HTTP_200_OK
    elif is_db_ok or is_redis_ok:
        overall_status = "degraded"
        http_status = status.HTTP_200_OK
    else:
        overall_status = "unhealthy"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    payload = {
        "status": overall_status,
        "timestamp": now_utc.isoformat(),
        "app_name": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database": db_status,
        "redis": redis_status,
    }
    return JSONResponse(content=payload, status_code=http_status)


@api_v1_router.post(
    "/telemetry/ingest",
    status_code=status.HTTP_200_OK,
    summary="Trigger Satellite Telemetry Ingestion (Layer 1)",
    description="Fetches live FIRMS thermal telemetry, executes DEFM footprint modeling, calculates H3 indexes, and upserts to TimescaleDB.",
)
async def trigger_ingest(
    source: str = "VIIRS_SNPP_NRT",
    day_range: int = 1,
) -> Dict[str, Any]:
    """Manually or worker-triggered satellite telemetry ingestion."""
    from ingestion import firms_ingestion_engine
    try:
        result = await firms_ingestion_engine.ingest_and_store(
            source=source, day_range=day_range
        )
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Telemetry ingestion failed: {str(exc)}",
        )


@api_v1_router.post(
    "/pipeline/run-deterministic",
    status_code=status.HTTP_200_OK,
    summary="Trigger Layer 2 & Layer 3 Deterministic Pipeline",
    description="Processes unclassified incidents through Known-Emitter Registry Fast-Path and Dual-Band Planck Pyrometry.",
)
async def trigger_pipeline(
    batch_limit: int = 100,
) -> Dict[str, Any]:
    """Manually or worker-triggered Layer 2/3 classification run."""
    from pipeline import deterministic_pipeline
    try:
        result = await deterministic_pipeline.run_batch(batch_limit=batch_limit)
        return result
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline processing failed: {str(exc)}",
        )


@api_v1_router.get(
    "/incidents",
    summary="List Thermal Incidents",
    description="Queries ingested satellite thermal incidents with pagination.",
)
async def list_incidents(
    limit: int = 50,
    classification: Optional[str] = None,
) -> Dict[str, Any]:
    """Retrieve recent satellite thermal incidents from TimescaleDB."""
    from database import ThermalIncident, async_session_factory
    from sqlalchemy import select, desc

    async with async_session_factory() as session:
        query = select(ThermalIncident).order_by(desc(ThermalIncident.detected_at)).limit(limit)
        if classification:
            query = query.filter(ThermalIncident.classification == classification)
        result = await session.execute(query)
        incidents = result.scalars().all()
        return {
            "total": len(incidents),
            "items": [
                {
                    "id": str(inc.id),
                    "detected_at": inc.detected_at.isoformat(),
                    "latitude": inc.latitude,
                    "longitude": inc.longitude,
                    "h3_index": inc.h3_index,
                    "brightness": inc.brightness,
                    "frp": inc.frp,
                    "satellite": inc.satellite,
                    "confidence": inc.confidence,
                    "classification": inc.classification,
                    "classification_confidence": inc.classification_confidence,
                    "is_industrial": inc.is_industrial,
                    "pipeline_stage": (inc.raw_metadata or {}).get("pipeline_stage"),
                    "shap_attribution": (inc.raw_metadata or {}).get("shap_attribution"),
                }
                for inc in incidents
            ],
        }


@api_v1_router.get(
    "/reviews",
    summary="List Human-in-the-Loop Review Queue",
    description="Retrieves flagged incidents requiring analyst verification (low confidence or unmapped accidents).",
)
async def list_reviews(
    status_filter: str = "pending",
    limit: int = 50,
) -> Dict[str, Any]:
    """Retrieves items from the HITL review queue."""
    from database import ReviewQueue, async_session_factory
    from sqlalchemy import select, desc

    async with async_session_factory() as session:
        query = (
            select(ReviewQueue)
            .filter(ReviewQueue.status == status_filter)
            .order_by(desc(ReviewQueue.created_at))
            .limit(limit)
        )
        result = await session.execute(query)
        reviews = result.scalars().all()
        return {
            "total": len(reviews),
            "items": [
                {
                    "id": str(rev.id),
                    "incident_id": str(rev.incident_id),
                    "incident_detected_at": rev.incident_detected_at.isoformat(),
                    "status": rev.status,
                    "priority": rev.priority,
                    "ai_classification": rev.ai_classification,
                    "ai_confidence": rev.ai_confidence,
                    "reviewer_notes": rev.reviewer_notes,
                    "created_at": rev.created_at.isoformat(),
                }
                for rev in reviews
            ],
        }


# ------------------------------------------------------------------------------
# Layer 6: GIS Delivery (RFC 7946 GeoJSON) & Real-Time WebSocket Streaming
# ------------------------------------------------------------------------------
class ConnectionManager:
    """Manages active WebSocket connections for real-time fire alerting."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.active_connections.discard(connection)


ws_manager = ConnectionManager()


@api_v1_router.websocket("/ws/alerts")
async def websocket_alerts_feed(websocket: WebSocket):
    """Real-time streaming WebSocket endpoint for GIS clients (React / MapLibre)."""
    await ws_manager.connect(websocket)
    try:
        # Send initial connection handshake
        await websocket.send_json({
            "event": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": "Connected to GeoAI real-time fire telemetry stream."
        })
        while True:
            # Keep socket alive and accept client pings/subscriptions
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


# NTRO Specification Color Palette Mapping
COLOR_MAP = {
    "INDUSTRIAL_FIRE_ALERT": "#E63946",         # Crimson Red (Emergency Alert)
    "UNMAPPED_INDUSTRIAL_ACCIDENT": "#D62828",  # Deep Red (Unmapped Hazard)
    "PERSISTENT_INDUSTRIAL_SOURCE": "#7209B7",  # Purple (Routine Industrial Facility)
    "ROUTINE_GAS_FLARE": "#F77F00",             # Orange (Regulated Hydrocarbon Flare)
    "AGRICULTURAL_STUBBLE_FIRE": "#FCBF49",     # Yellow (Crop Biomass Burn)
    "WILDFIRE_FOREST_FIRE": "#2A9D8F",          # Teal/Green (Vegetation/Forest)
    "FALSE_POSITIVE_GLINT": "#A8DADC",          # Pale Blue (Solar Reflection)
    "unclassified": "#6C757D",                  # Neutral Gray
}


@api_v1_router.get(
    "/gis/features",
    summary="RFC 7946 Standard GeoJSON FeatureCollection",
    description="Delivers map-ready GeoJSON features styled per NTRO color mandate for MapLibre / OpenLayers / QGIS.",
)
async def get_gis_feature_collection(
    limit: int = 100,
    is_industrial: Optional[bool] = None,
    classification: Optional[str] = None,
) -> Dict[str, Any]:
    """Generates standard RFC 7946 GeoJSON FeatureCollection."""
    from database import ThermalIncident, async_session_factory
    from sqlalchemy import select, desc

    async with async_session_factory() as session:
        query = select(ThermalIncident).order_by(desc(ThermalIncident.detected_at)).limit(limit)
        if is_industrial is not None:
            query = query.filter(ThermalIncident.is_industrial == is_industrial)
        if classification:
            query = query.filter(ThermalIncident.classification == classification)

        result = await session.execute(query)
        incidents = result.scalars().all()

        features = []
        for inc in incidents:
            meta = inc.raw_metadata or {}
            color = COLOR_MAP.get(inc.classification, "#6C757D")

            # Point geometry per RFC 7946 [longitude, latitude]
            feature = {
                "type": "Feature",
                "id": str(inc.id),
                "geometry": {
                    "type": "Point",
                    "coordinates": [inc.longitude, inc.latitude],
                },
                "properties": {
                    "detected_at": inc.detected_at.isoformat(),
                    "classification": inc.classification,
                    "classification_confidence": inc.classification_confidence,
                    "is_industrial": inc.is_industrial,
                    "frp_mw": inc.frp,
                    "brightness_k": inc.brightness,
                    "satellite": inc.satellite,
                    "h3_index": inc.h3_index,
                    "marker_color": color,
                    "emitter_id": str(inc.emitter_id) if inc.emitter_id else None,
                    "distance_to_emitter_meters": inc.distance_to_emitter_meters,
                    "shap_attribution": meta.get("shap_attribution"),
                    "verification": meta.get("layer_5_verification"),
                    "footprint_polygon": meta.get("footprint_geojson"),
                },
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "name": "GeoAI_Thermal_Anomalies",
            "crs": {
                "type": "name",
                "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
            },
            "features": features,
        }


# Mount routers
app.include_router(api_v1_router)


@app.get("/", tags=["Root"])
async def root_ping() -> Dict[str, str]:
    """Root meta information ping."""
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "health_endpoint": f"{settings.API_V1_STR}/health",
    }