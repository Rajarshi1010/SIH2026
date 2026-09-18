"""
backend/main.py - GeoAI Industrial Fire Classifier API Entrypoint

Configures FastAPI lifespan management, asynchronous health probes for PostgreSQL/PostGIS
and Redis, CORS middleware, and production-grade monitoring endpoints.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, FastAPI, HTTPException, status
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

    yield

    # Shutdown sequence
    logger.info("Executing graceful shutdown...")
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
                }
                for inc in incidents
            ],
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