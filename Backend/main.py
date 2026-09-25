"""
backend/main.py - GeoAI Industrial Fire Classifier API Entrypoint

Configures FastAPI lifespan management, embedded DuckDB storage engine,
Redis cache and pub/sub, CORS middleware, and production-grade monitoring endpoints.
"""

import sys
from pathlib import Path

# Ensure backend directory is in sys.path regardless of execution root
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from fastapi import APIRouter, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import redis.asyncio as aioredis
from config import settings
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
    Initializes embedded DuckDB engine, Redis cache, and background polling worker.
    Gracefully disposes connections on shutdown.
    """
    logger.info("Initializing %s (Env: %s, Storage: DuckDB In-Process)...", settings.APP_NAME, settings.APP_ENV)

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

    # 2. Initialize Embedded DuckDB Engine & Auto-Bootstrap on First Run
    try:
        from database import get_duckdb
        conn = get_duckdb()
        struct_count = conn.execute("SELECT count(*) FROM india_master_structures;").fetchone()[0]
        if struct_count == 0:
            logger.info("Cold-start deployment detected: Auto-bootstrapping India national grid...")
            from seed import build_india_database
            build_india_database()
            struct_count = conn.execute("SELECT count(*) FROM india_master_structures;").fetchone()[0]

        anomalies_count = conn.execute("SELECT count(*) FROM thermal_anomalies;").fetchone()[0]
        logger.info("DuckDB embedded engine active. Master structures: %d, Anomalies: %d", struct_count, anomalies_count)
    except Exception as exc:
        logger.error("DuckDB initialization warning: %s", exc)

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
        try:
            await app.state.redis.aclose()
            logger.info("Redis connection pool closed.")
        except Exception:
            pass


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
# Automatically support Vercel preview/production domains, localhost, and custom domains.
# If wildcard "*" is configured, we use allow_origin_regex instead of allow_origins=["*"]
# because the W3C Fetch specification blocks responses with Access-Control-Allow-Origin: *
# whenever the request's credentials mode is "include". Using regex reflects the EXACT origin.
cors_has_wildcard = "*" in settings.CORS_ORIGINS or any(str(o).strip() == "*" for o in settings.CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[] if cors_has_wildcard else settings.CORS_ORIGINS,
    allow_origin_regex=(
        r"^https?://.*"
        if cors_has_wildcard
        else r"^https://.*\.vercel\.app$|^https://.*\.onrender\.com$|^http://localhost:\d+$|^http://127\.0\.0\.1:\d+$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------------------
# Root & Health Probes (Supports Render, Cloudflare, UptimeRobot HEAD & GET checks)
# ------------------------------------------------------------------------------
@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def root_ping():
    """Immediate 200 OK for platform health checks (Render, AWS, GCP)."""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "health": f"{settings.API_V1_STR}/health",
        "docs": "/docs",
    }


@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
async def root_health_alias():
    """Root /health alias returning immediate 200 OK."""
    return {"status": "healthy"}


# ------------------------------------------------------------------------------
# API V1 Router
# ------------------------------------------------------------------------------
api_v1_router = APIRouter(prefix=settings.API_V1_STR)


@api_v1_router.api_route("", methods=["GET", "HEAD"], include_in_schema=False)
@api_v1_router.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
async def api_v1_index():
    """Returns directory of available v1 API endpoints."""
    return {
        "status": "healthy",
        "api_version": "v1",
        "service": settings.APP_NAME,
        "available_endpoints": [
            f"{settings.API_V1_STR}/health",
            f"{settings.API_V1_STR}/gis/features",
            f"{settings.API_V1_STR}/incidents",
            f"{settings.API_V1_STR}/reviews",
            f"{settings.API_V1_STR}/ws/alerts",
        ],
        "interactive_docs": "/docs",
    }


@api_v1_router.get(
    "/health",
    response_model=SystemHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="System Health & Infrastructure Diagnostics",
    description="Probes embedded DuckDB storage engine and Redis cache with active latency measurement.",
)
async def health_check() -> JSONResponse:
    """Active diagnostic probe evaluating infrastructure components."""
    now_utc = datetime.now(timezone.utc)
    db_status: Dict[str, Any] = {"status": "unhealthy", "latency_ms": None}
    redis_status: Dict[str, Any] = {"status": "unhealthy", "latency_ms": None}

    # 1. Probe Embedded DuckDB Engine
    db_start = time.perf_counter()
    try:
        from database import get_duckdb
        conn = get_duckdb()
        conn.execute("SELECT 1;").fetchone()
        master_count = conn.execute("SELECT count(*) FROM india_master_structures;").fetchone()[0]
        anomalies_count = conn.execute("SELECT count(*) FROM thermal_anomalies;").fetchone()[0]
        db_latency = round((time.perf_counter() - db_start) * 1000, 2)
        db_status = {
            "status": "connected",
            "engine": "duckdb",
            "latency_ms": db_latency,
            "master_structures": master_count,
            "thermal_anomalies": anomalies_count,
        }
    except Exception as exc:
        db_status = {
            "status": "error",
            "engine": "duckdb",
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


@api_v1_router.post(
    "/admin/bootstrap",
    status_code=status.HTTP_200_OK,
    summary="Bootstrap / Re-populate DuckDB National Structures",
    description="Synthesizes India's 541,180 H3 hexagonal cells and embeds the 17 strategic industrial facilities in DuckDB.",
)
async def admin_bootstrap(
    force: bool = False,
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
) -> Dict[str, Any]:
    """Manually or cloud-triggered database population routine (Protected)."""
    provided_key = x_admin_key
    if not provided_key or provided_key != settings.ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Valid X-Admin-Key header or admin_key parameter required to trigger database bootstrap.",
        )

    from seed import build_india_database
    try:
        total = build_india_database(force_grid=force)
        return {
            "status": "success",
            "message": f"Successfully initialized {total:,} India national grid structures in DuckDB.",
            "total_structures": total,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database bootstrap failed: {str(exc)}",
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
    """Retrieve recent satellite thermal incidents from DuckDB."""
    from database import get_duckdb
    import json
    conn = get_duckdb()
    params = []
    where_sql = ""
    if classification:
        where_sql = "WHERE classification = ?"
        params.append(classification)
    params.append(limit)

    rows = conn.execute(f"""
        SELECT id, detected_at, latitude, longitude, h3_cell,
               brightness_mir, frp, satellite, confidence, classification,
               classification_confidence, is_industrial, raw_metadata
        FROM thermal_anomalies
        {where_sql}
        ORDER BY detected_at DESC
        LIMIT ?;
    """, params).fetchall()

    items = []
    for r in rows:
        raw_meta = json.loads(r[12]) if isinstance(r[12], str) else (r[12] or {})
        h3_hex = hex(r[4])[2:] if r[4] else ""
        conf_val = float(r[10]) / 100.0 if r[10] > 1 else float(r[10] or 0.0)

        items.append({
            "id": str(r[0]),
            "detected_at": r[1].isoformat() if hasattr(r[1], "isoformat") else str(r[1]),
            "latitude": r[2],
            "longitude": r[3],
            "h3_index": h3_hex,
            "brightness": float(r[5] or 0),
            "frp": float(r[6] or 0),
            "satellite": str(r[7]),
            "confidence": str(r[8]),
            "classification": str(r[9]),
            "classification_confidence": conf_val,
            "is_industrial": bool(r[11]),
            "emitter_name": raw_meta.get("emitter_name"),
            "pipeline_stage": raw_meta.get("pipeline_stage"),
            "shap_attribution": raw_meta.get("shap_attribution"),
        })

    return {
        "total": len(items),
        "items": items,
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
    from database import get_duckdb
    conn = get_duckdb()
    rows = conn.execute("""
        SELECT id, incident_id, incident_detected_at, status, priority,
               ai_classification, ai_confidence, reviewer_notes, created_at
        FROM review_queue
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?;
    """, [status_filter, limit]).fetchall()

    return {
        "total": len(rows),
        "items": [
            {
                "id": str(r[0]),
                "incident_id": str(r[1]),
                "incident_detected_at": r[2].isoformat() if hasattr(r[2], "isoformat") else str(r[2]),
                "status": str(r[3]),
                "priority": str(r[4]),
                "ai_classification": str(r[5]),
                "ai_confidence": float(r[6] or 0.0),
                "reviewer_notes": str(r[7] or ""),
                "created_at": r[8].isoformat() if hasattr(r[8], "isoformat") else str(r[8]),
            }
            for r in rows
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
    from database import get_duckdb
    import json
    conn = get_duckdb()

    clauses = []
    params = []
    if is_industrial is not None:
        clauses.append("is_industrial = ?")
        params.append(is_industrial)
    if classification:
        clauses.append("classification = ?")
        params.append(classification)

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)

    rows = conn.execute(f"""
        SELECT id, h3_cell, detected_at, latitude, longitude,
               brightness_mir, frp, satellite, confidence, classification,
               classification_confidence, is_industrial, emitter_id,
               distance_to_emitter_meters, raw_metadata
        FROM thermal_anomalies
        {where_sql}
        ORDER BY detected_at DESC
        LIMIT ?;
    """, params).fetchall()

    features = []
    for r in rows:
        raw_meta = json.loads(r[14]) if isinstance(r[14], str) else (r[14] or {})
        c_type = str(r[9])
        color = COLOR_MAP.get(c_type, "#6C757D")
        h3_hex = hex(r[1])[2:] if r[1] else ""
        conf_val = float(r[10]) / 100.0 if r[10] > 1 else float(r[10] or 0.0)

        features.append({
            "type": "Feature",
            "id": str(r[0]),
            "geometry": {
                "type": "Point",
                "coordinates": [r[4], r[3]],  # [lon, lat] per RFC 7946
            },
            "properties": {
                "detected_at": r[2].isoformat() if hasattr(r[2], "isoformat") else str(r[2]),
                "classification": c_type,
                "classification_confidence": conf_val,
                "is_industrial": bool(r[11]),
                "frp_mw": float(r[6] or 0.0),
                "brightness_k": float(r[5] or 0.0),
                "satellite": str(r[7]),
                "h3_index": h3_hex,
                "marker_color": color,
                "emitter_id": str(r[12]) if r[12] else None,
                "emitter_name": raw_meta.get("emitter_name"),
                "distance_to_emitter_meters": float(r[13]) if r[13] is not None else None,
                "shap_attribution": raw_meta.get("shap_attribution"),
                "verification": raw_meta.get("layer_5_verification"),
                "footprint_polygon": raw_meta.get("footprint_geojson"),
            },
        })

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