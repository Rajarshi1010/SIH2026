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
    """Returns the persistent embedded DuckDB connection (Local file or Cloud MotherDuck)."""
    global _duckdb_conn
    if _duckdb_conn is None:
        if getattr(settings, "MOTHERDUCK_TOKEN", None):
            token = settings.MOTHERDUCK_TOKEN.strip()
            conn_str = f"md:india_geoai?motherduck_token={token}"
            _duckdb_conn = duckdb.connect(conn_str)
            logger.info("Connected to MotherDuck Cloud Persistent Storage Engine (Database: india_geoai).")
        else:
            DUCKDB_FILE.parent.mkdir(parents=True, exist_ok=True)
            _duckdb_conn = duckdb.connect(str(DUCKDB_FILE))
            logger.info(f"Connected to DuckDB storage engine: {DUCKDB_FILE}")
        _init_duckdb_schema(_duckdb_conn)
    return _duckdb_conn


def enforce_retention_policy(
    conn: duckdb.DuckDBPyConnection,
    retention_days: Optional[int] = None,
    max_records: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Enforces a strict 3-month (90 days) rolling retention policy and FIFO capacity limit:
    1. Removes any incidents older than `retention_days` (default: 90 days / 3 months).
    2. If total records exceed `max_records` (default: 100,000), prunes oldest records (FIFO).
    3. Cleans up unlinked review_queue items.
    4. Triggers CHECKPOINT to release space.
    """
    if retention_days is None:
        retention_days = getattr(settings, "RETENTION_DAYS", 90)
    if max_records is None:
        max_records = getattr(settings, "MAX_STORED_ANOMALIES", 100000)

    count_before = conn.execute("SELECT count(*) FROM thermal_anomalies;").fetchone()[0]

    # 1. Rolling time window deletion (older than 90 days)
    conn.execute("""
        DELETE FROM thermal_anomalies
        WHERE detected_at < CURRENT_TIMESTAMP - INTERVAL (CAST(? AS VARCHAR) || ' days');
    """, [retention_days])

    count_after_time = conn.execute("SELECT count(*) FROM thermal_anomalies;").fetchone()[0]
    time_pruned = count_before - count_after_time

    # 2. FIFO capacity cap: Delete oldest entries to accommodate newest if total > max_records
    fifo_pruned = 0
    if count_after_time > max_records:
        excess = count_after_time - max_records
        conn.execute("""
            DELETE FROM thermal_anomalies
            WHERE id IN (
                SELECT id FROM thermal_anomalies
                ORDER BY detected_at ASC
                LIMIT ?
            );
        """, [excess])
        fifo_pruned = excess

    # 3. Clean up orphaned review_queue entries
    conn.execute("""
        DELETE FROM review_queue
        WHERE incident_id NOT IN (SELECT id FROM thermal_anomalies);
    """)

    conn.execute("CHECKPOINT;")
    total_remaining = conn.execute("SELECT count(*) FROM thermal_anomalies;").fetchone()[0]

    logger.info(
        "Retention policy enforced: Pruned %d expired (>%dd), %d excess FIFO. Total remaining: %d",
        time_pruned, retention_days, fifo_pruned, total_remaining,
    )
    return {
        "time_pruned": time_pruned,
        "fifo_pruned": fifo_pruned,
        "total_remaining": total_remaining,
        "retention_days": retention_days,
        "max_records": max_records,
    }


def _init_duckdb_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Initializes the optimized Dual-Table schema in DuckDB:
    1. india_master_structures: Strategic baseline industrial facilities with H3 integer keys.
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

        -- Table 1: india_master_structures (Strategic baseline facilities with H3 integer keys)
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
    """)
