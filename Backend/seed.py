"""
Backend/seed.py - Strategic Industrial Facilities Registration Engine

Initializes strategic industrial facilities, refineries, petrochemical complexes,
and gas flares across India with verified baseline Fire Radiative Power (FRP).
Zero external dependencies, cloud-native (DuckDB / MotherDuck).
"""

import argparse
import logging
import time

import duckdb
import h3

from config import settings
from database import get_duckdb, resolve_duckdb_path
from curated_emitters import CURATED_EMITTERS

logger = logging.getLogger("geoai.seed")


def inject_curated_emitters(conn: duckdb.DuckDBPyConnection) -> int:
    """Injects high-precision strategic industrial complexes with verified baselines."""
    logger.info("Registering %d strategic Indian industrial facilities...", len(CURATED_EMITTERS))
    for emitter in CURATED_EMITTERS:
        lat = emitter["latitude"]
        lon = emitter["longitude"]
        h3_cell_str = h3.latlng_to_cell(lat, lon, 7)
        h3_int = int(h3_cell_str, 16)
        baseline_frp = float(emitter.get("metadata", {}).get("expected_baseline_frp_mw", 40.0))

        conn.execute("""
            INSERT OR REPLACE INTO india_master_structures (
                h3_cell, land_use_category, facility_name, baseline_frp_mw, power_sites
            ) VALUES (
                ?, 'Industry'::land_category, ?, ?, 1
            );
        """, [h3_int, emitter["name"], baseline_frp])

    conn.execute("CHECKPOINT;")
    return len(CURATED_EMITTERS)


def build_india_database(force: bool = False) -> int:
    """Initializes and registers strategic industrial facilities in DuckDB / MotherDuck."""
    start_time = time.perf_counter()
    logger.info("Initializing DuckDB National Strategic Facilities (%s)...", settings.DUCKDB_PATH)

    conn = get_duckdb()
    current_count = conn.execute("SELECT count(*) FROM india_master_structures WHERE facility_name IS NOT NULL;").fetchone()[0]
    if current_count == 0 or force:
        inject_curated_emitters(conn)

    total = conn.execute("SELECT count(*) FROM india_master_structures;").fetchone()[0]
    elapsed = time.perf_counter() - start_time
    logger.info("Strategic facilities registration complete. Total facilities: %d (Elapsed: %.2fs)", total, elapsed)
    return total


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
    parser = argparse.ArgumentParser(description="Register Strategic Indian Industrial Facilities")
    parser.add_argument("--force", action="store_true", help="Force re-registration of facilities")
    args = parser.parse_args()

    build_india_database(force=args.force)
