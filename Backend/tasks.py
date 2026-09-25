"""
backend/tasks.py - Automated Ingestion & Pipeline Polling Worker

Periodically polls NASA FIRMS satellite streams, ingests new thermal passes,
runs the multi-layer classification pipeline (Layers 2, 3, 4, and 5), and broadcasts
real-time updates via WebSockets.

Zero-cost architecture: Runs seamlessly as an asynchronous background loop
inside the FastAPI lifecycle (or as a standalone worker CLI).
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from config import settings
from ingestion import firms_ingestion_engine
from pipeline import deterministic_pipeline

logger = logging.getLogger("geoai.worker")


class TelemetryPollingWorker:
    """
    Continuous automated polling worker.
    Runs every `interval_seconds` (default: 900s = 15 minutes).
    """

    def __init__(self, interval_seconds: int = 900):
        self.interval_seconds = interval_seconds
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self.last_run_timestamp: Optional[datetime] = None
        self.last_run_stats: Dict[str, Any] = {}

    async def execute_cycle(self) -> Dict[str, Any]:
        """
        Executes a single end-to-end pull and processing cycle:
        1. Ingest new FIRMS telemetry.
        2. Execute Layer 2 (KER) & Layer 3 (Pyrometry).
        3. Execute Layer 4 (LightGBM + TreeSHAP) on residuals.
        4. Broadcast new alerts to connected WebSocket clients.
        """
        cycle_start = datetime.now(timezone.utc)
        logger.info(f"--- [Automated Polling Cycle Initiated: {cycle_start.isoformat()}] ---")

        # 1. Ingestion: Multi-sensor parallel VIIRS pull (SNPP + NOAA-21 + NOAA-20)
        ingest_res = await firms_ingestion_engine.ingest_latest_multi_source(day_range=3)
        new_incidents = ingest_res.get("total_inserted", 0)
        logger.info(f"Ingested {new_incidents} new incidents from NASA FIRMS multi-sensor constellation.")

        # 2. Pipeline Execution (Layers 2, 3, 4, 5)
        pipeline_res = {}
        from database import get_duckdb, enforce_retention_policy
        conn = get_duckdb()
        unclass_count = conn.execute("SELECT count(*) FROM thermal_anomalies WHERE classification = 'unclassified';").fetchone()[0]

        if new_incidents > 0 or unclass_count > 0:
            batch_size = max(new_incidents + unclass_count, 150)
            logger.info(f"Triggering pipeline for {unclass_count} unclassified incidents ({new_incidents} freshly ingested)...")
            pipeline_res = await deterministic_pipeline.run_batch(
                batch_limit=batch_size, target_stage="all"
            )
            logger.info(f"Pipeline executed: {pipeline_res.get('breakdown', {})}")

            # 3. Broadcast to active WebSockets (Layer 6)
            try:
                from ws import ws_manager
                await ws_manager.broadcast({
                    "event": "new_telemetry_batch",
                    "timestamp": cycle_start.isoformat(),
                    "inserted_count": new_incidents,
                    "processed_count": pipeline_res.get("processed_count", 0),
                    "pipeline_breakdown": pipeline_res.get("breakdown", {}),
                })
            except Exception as e:
                logger.debug(f"WebSocket broadcast skipped: {e}")

        # 4. Strict 3-month (90-day) rolling retention & FIFO capacity enforcement
        retention_stats = enforce_retention_policy(
            conn,
            retention_days=settings.RETENTION_DAYS,
            max_records=settings.MAX_STORED_ANOMALIES,
        )

        self.last_run_timestamp = cycle_start
        self.last_run_stats = {
            "timestamp": cycle_start.isoformat(),
            "ingested_count": new_incidents,
            "pipeline_summary": pipeline_res,
            "retention_status": retention_stats,
        }
        return self.last_run_stats

    async def _run_loop(self):
        """Internal continuous loop with error resilience and backoff."""
        self.is_running = True
        logger.info(f"Automated Polling Worker started (cadence: {self.interval_seconds}s).")
        # Allow server to complete initial platform health checks before heavy telemetry cycle
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            self.is_running = False
            return

        while self.is_running:
            try:
                await self.execute_cycle()
            except Exception as exc:
                logger.error(f"Error in polling worker cycle: {exc}", exc_info=True)

            # Sleep until next scheduled interval
            try:
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break

        self.is_running = False
        logger.info("Automated Polling Worker stopped.")

    def start(self):
        """Starts the background worker task."""
        if not self.is_running and self._task is None:
            self._task = asyncio.create_task(self._run_loop())

    def stop(self):
        """Stops the background worker task."""
        if self._task and not self._task.done():
            self._task.cancel()
            self._task = None
        self.is_running = False


# Global singleton instance
polling_worker = TelemetryPollingWorker(interval_seconds=900)


# CLI execution entrypoint
if __name__ == "__main__":
    async def main():
        logging.basicConfig(level=logging.INFO)
        print("Running single manual cycle of TelemetryPollingWorker...")
        stats = await polling_worker.execute_cycle()
        print("Cycle completed:", stats)

    asyncio.run(main())
