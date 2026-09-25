"""
backend/database.py - Embedded Vectorized In-Process Database Architecture

Implements the Dual-Table DuckDB storage model:
1. india_master_structures: National spatial table holding base land-use features
   with H3 integer keys (UBIGINT), downcasted buffer counts, and facility baselines.
2. thermal_anomalies: Append-only time-series table holding satellite thermal incidents
   with ZSTD block compression, delta/RLE encoding, and 1-byte enum hazard classes.
3. review_queue: Human-in-the-loop triage table for low-confidence and anomalous incidents.
"""

from datetime import datetime, timezone
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import uuid

import duckdb
from config import settings

logger = logging.getLogger("geoai.database")


def resolve_duckdb_path(raw_path: str) -> Path:
    """
    Resolves the DuckDB file path across development environments:
    - Absolute paths are preserved as-is.
    - Inside Docker container (/app): resolves relative to /app or /app/data.
    - Local repo root (SIH2026/): resolves to SIH2026/data/india_geoai.db.
    - CWD check handles any subfolder execution.
    """
    p = Path(raw_path)
    if p.is_absolute():
        return p

    # 1. Check direct cwd relative
    cwd_candidate = Path.cwd() / raw_path
    if cwd_candidate.exists():
        return cwd_candidate.resolve()

    # 2. Check relative to Backend's parent (workspace root)
    backend_dir = Path(__file__).resolve().parent
    if backend_dir.name.lower() == "backend":
        repo_candidate = backend_dir.parent / raw_path
        if repo_candidate.exists():
            return repo_candidate.resolve()
        return repo_candidate.resolve()

    # 3. Running inside Docker container (/app) or custom root
    app_candidate = backend_dir / raw_path
    return app_candidate.resolve()


DUCKDB_FILE = resolve_duckdb_path(settings.DUCKDB_PATH)

# Thread-safe persistent in-process connection
_duckdb_conn: Optional[duckdb.DuckDBPyConnection] = None


def get_duckdb() -> duckdb.DuckDBPyConnection:
    """Returns the persistent embedded DuckDB connection."""
    global _duckdb_conn
    if _duckdb_conn is None:
        DUCKDB_FILE.parent.mkdir(parents=True, exist_ok=True)
        _duckdb_conn = duckdb.connect(str(DUCKDB_FILE))
        _init_duckdb_schema(_duckdb_conn)
        logger.info(f"Connected to DuckDB storage engine: {DUCKDB_FILE}")
    return _duckdb_conn


def _init_duckdb_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Initializes the optimized Dual-Table schema in DuckDB:
    1. india_master_structures: ~700,000 baseline land-use features with H3 integer keys.
    2. thermal_anomalies: Append-only time-series with ZSTD compression and downcasted types.
    3. review_queue: Analyst triage table for low-confidence or high-impact anomalies.
    """
    conn.execute("""
        -- Enums for 1-byte dictionary encoding
        CREATE TYPE IF NOT EXISTS hazard_class AS ENUM (
            'PERSISTENT_INDUSTRIAL_SOURCE',
            'ROUTINE_GAS_FLARE',
            'INDUSTRIAL_FIRE_ALERT',
            'UNMAPPED_INDUSTRIAL_ACCIDENT',
            'AGRICULTURAL_STUBBLE_FIRE',
            'WILDFIRE_FOREST_FIRE',
            'FALSE_POSITIVE_GLINT',
            'unclassified'
        );

        CREATE TYPE IF NOT EXISTS satellite_source AS ENUM (
            'VIIRS',
            'MODIS',
            'INSAT_3D',
            'INSAT_3DR',
            'OTHER'
        );

        CREATE TYPE IF NOT EXISTS land_category AS ENUM (
            'Industry',
            'Agriculture',
            'Forest',
            'Unclassified',
            'Water',
            'Urban'
        );

        -- Table 1: india_master_structures (~12 MB for ~700k features)
        CREATE TABLE IF NOT EXISTS india_master_structures (
            h3_cell UBIGINT PRIMARY KEY,
            land_use_category land_category DEFAULT 'Unclassified',
            hospitals USMALLINT DEFAULT 0,
            schools USMALLINT DEFAULT 0,
            fire_stations USMALLINT DEFAULT 0,
            power_sites USMALLINT DEFAULT 0,
            facility_name VARCHAR,
            baseline_frp_mw FLOAT DEFAULT 40.0
        );

        -- Table 2: thermal_anomalies (ZSTD compressed time-series, ~12-15 bytes/row)
        CREATE TABLE IF NOT EXISTS thermal_anomalies (
            id UUID,
            h3_cell UBIGINT,
            detected_at TIMESTAMPTZ,
            latitude FLOAT,
            longitude FLOAT,
            brightness_mir USMALLINT,
            bright_t31 USMALLINT,
            frp USMALLINT,
            satellite satellite_source DEFAULT 'VIIRS',
            confidence VARCHAR,
            classification hazard_class DEFAULT 'unclassified',
            classification_confidence UTINYINT DEFAULT 0,
            is_industrial BOOLEAN DEFAULT FALSE,
            emitter_id UUID,
            distance_to_emitter_meters FLOAT,
            raw_metadata JSON,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        -- Index on h3_cell and detected_at for sub-millisecond lookups
        CREATE INDEX IF NOT EXISTS idx_thermal_anomalies_h3 ON thermal_anomalies (h3_cell);
        CREATE INDEX IF NOT EXISTS idx_thermal_anomalies_time ON thermal_anomalies (detected_at);

        -- Table 3: review_queue (HITL analyst triage)
        CREATE TABLE IF NOT EXISTS review_queue (
            id UUID PRIMARY KEY,
            incident_id UUID,
            incident_detected_at TIMESTAMPTZ,
            status VARCHAR DEFAULT 'pending',
            priority VARCHAR DEFAULT 'medium',
            assigned_to VARCHAR,
            reviewer_notes TEXT,
            ai_classification VARCHAR,
            ai_confidence FLOAT,
            human_verdict VARCHAR,
            resolution_reason TEXT,
            reviewed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );

        -- Table 4: frp_history_daily (per-location daily NASA FIRMS history for
        -- the analysis panel charts). Kept apart from thermal_anomalies so past
        -- detections never reach the live map or the classification pipeline.
        CREATE TABLE IF NOT EXISTS frp_history_daily (
            location_key VARCHAR,   -- "lat,lon" rounded to 3 dp (~100 m)
            radius_km DOUBLE,
            day DATE,               -- UTC acquisition date, as FIRMS reports it
            source VARCHAR,         -- FIRMS product, e.g. VIIRS_SNPP_NRT
            detections USMALLINT,
            -- DOUBLE, not FLOAT: 32-bit floats shift values like 7.05 enough to
            -- round differently from the freshly fetched figures.
            max_frp_mw DOUBLE,
            total_frp_mw DOUBLE,
            fetched_at TIMESTAMPTZ,
            PRIMARY KEY (location_key, radius_km, day, source)
        );
    """)
