"""
main.py - Disaster Risk Assessment API

- Ingests global NASA FIRMS telemetry via Firms.py
- Evaluates spatial history and live intensity via Engine.py
- Logs combined Moderate + High (n+h) confidence detection stats
- Enforces strict post-calculation check (final_score >= 0.60) before caching
- Synchronously completes dataset ingestion during boot before showing server ready banner
- Categorizes current-day thermal anomalies into color series:
    - Forest Fire / Wildfire -> green
    - Industry               -> red
    - Refinery / Gas Flare   -> yellow
    - Other                  -> orange
- Serves endpoints:
    - GET  /health
    - GET  /world-points
    - POST /near-points (Returns top 5 nearest detections)
"""

import asyncio
import math
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from Engine import scoring_engine
from Firms import calculate_history_and_redundancy, fetch_live_firms_data

# In-Memory Cache categorized by source type color buckets
PROCESSED_CACHE: dict[str, list[dict] | dict[str, list[dict]]] = {
    "all_points": [],
    "series": {
        "green": [],   # Forest Fires / Wildfires
        "red": [],     # Industrial Facilities
        "yellow": [],  # Refineries / Gas Flares
        "orange": []   # Other / Unclassified Active Threats
    }
}


def classify_detection_source(frp: float, active_days: int, score: float) -> tuple[str, str]:
    """
    Classifies detection type and returns (source_type, color_key):
    - forest_fire: Transient active fire (<4 active days) -> green
    - refinery: Persistent heat (>=4 active days) + High FRP (>=80 MW) -> yellow
    - industry: Persistent heat (>=4 active days) + Standard FRP (<80 MW) -> red
    - other: Fallback active threat -> orange
    """
    if active_days < 4:
        return "forest_fire", "green"
    elif frp >= 80.0:
        return "refinery", "yellow"
    elif active_days >= 4:
        return "industry", "red"
    return "other", "orange"


async def run_pipeline(is_initial_boot: bool = False) -> None:
    """Ingests 5-day telemetry, evaluates source classification, and strictly caches points with final_score >= 0.60."""
    print("[Pipeline] Executing ingestion & scoring cycle...")

    raw_telemetry = await fetch_live_firms_data(days=5)
    if not raw_telemetry:
        print("[Pipeline Warning] No telemetry ingested. Skipping cycle.")
        return

    # Calculate combined Moderate ('n') + High ('h') confidence detections
    total_raw = len(raw_telemetry)
    mod_high_count = sum(1 for pt in raw_telemetry if pt.get("confidence") in ("n", "h"))
    mod_high_pct = round((mod_high_count / total_raw) * 100, 2) if total_raw > 0 else 0.0

    print(f"[Pipeline Stats] Ingested {total_raw} total raw global records.")
    print(f"[Pipeline Stats] Moderate + High (n+h) Confidence Points: {mod_high_count} ({mod_high_pct}%)")

    # Identify the latest acquisition date in the batch (current day)
    latest_date = max(item["acq_date"] for item in raw_telemetry if item.get("acq_date"))
    print(f"[Pipeline] Filtering telemetry for latest acquisition date ({latest_date})...")

    # Isolate current-day events ONLY
    current_day_events = [pt for pt in raw_telemetry if pt.get("acq_date") == latest_date]

    new_series: dict[str, list[dict]] = {
        "green": [],
        "red": [],
        "yellow": [],
        "orange": []
    }
    all_evaluated = []

    for item in current_day_events:
        # Rescale FRP intensity: 25+ MW reaches 1.0 (100% intensity)
        s_live = min(1.0, round(item["frp"] / 25.0, 2))
        s_hist, penalty_multiplier, active_days = calculate_history_and_redundancy(item["lat"], item["lng"])
        s_osm = 0.60  # Baseline OSM vulnerability score

        score_res = scoring_engine.calculate_score(s_live, s_hist, s_osm)
        raw_composite = score_res["composite_score"]

        # Source classification & target color key assignment
        source_type, color_key = classify_detection_source(item["frp"], active_days, raw_composite)

        # Apply redundancy penalty for non-wildfire display score
        penalized_composite = round(raw_composite * penalty_multiplier, 4)
        final_score = raw_composite if source_type == "forest_fire" else penalized_composite

        # STRICT POST-CALCULATION CHECK: Drop ANY point where final_score is below 0.60
        if final_score < 0.60:
            continue

        evaluated_pt = {
            "id": item["id"],
            "name": f"{source_type.replace('_', ' ').title()} ({item['lat']:.2f}, {item['lng']:.2f})",
            "lat": item["lat"],
            "lng": item["lng"],
            "type": source_type,
            "frp_mw": item["frp"],
            "score": final_score,
            "acq_date": item["acq_date"],
            "active_days_5d": active_days,
            "redundancy_penalized": penalty_multiplier < 1.0,
            "score_breakdown": score_res["components"]
        }

        # Store only post-check validated points
        all_evaluated.append(evaluated_pt)
        new_series[color_key].append(evaluated_pt)

    PROCESSED_CACHE["all_points"] = all_evaluated
    PROCESSED_CACHE["series"] = new_series
    print(
        f"[Pipeline] Cycle complete. Filtered down to {len(all_evaluated)} "
        f"points strictly meeting final_score >= 0.60 for current date ({latest_date})."
    )


async def firms_cron_worker() -> None:
    """Background polling worker executing every 45 minutes."""
    while True:
        await asyncio.sleep(2700)  # 45 minutes
        try:
            await run_pipeline()
        except Exception as err:
            print(f"[Cron Error] Scheduled ingestion failed: {err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("============================================================")
    print("[Startup] Initializing Disaster Risk Assessment API...")
    print("[Startup] Starting initial NASA FIRMS dataset ingestion & scoring...")
    print("============================================================")

    # Synchronously await initial pipeline execution to complete ingestion & filtering BEFORE logging startup ready
    await run_pipeline(is_initial_boot=True)

    poller_task = asyncio.create_task(firms_cron_worker())

    print("============================================================")
    print("[Startup] Initial dataset ingestion and filtering cycle complete.")
    print(f"[Startup] Cache primed with {len(PROCESSED_CACHE['all_points'])} points (strictly score >= 0.60).")
    print("[Startup] Background poller scheduled (every 45m).")
    print("[Startup] Disaster Risk Assessment API is FULLY READY!")
    print("============================================================")

    yield

    poller_task.cancel()


app = FastAPI(
    title="Disaster Risk Assessment API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LocationQuery(BaseModel):
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")


def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0  # Earth's radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


@app.get("/health")
def health_check():
    """Health status check returning total count of processed active threat points."""
    return {
        "status": "healthy",
        "cached_classified_points": len(PROCESSED_CACHE["all_points"])
    }


@app.get("/world-points")
def get_world_points():
    """Returns global threat points grouped by source classification color keys (green, red, yellow, orange)."""
    return PROCESSED_CACHE["series"]


@app.post("/near-points")
def get_near_points(query: LocationQuery):
    """Calculates distance to all cached detections and returns the 5 nearest points."""
    all_pts = PROCESSED_CACHE.get("all_points", [])
    evaluated_points = []

    for pt in all_pts:
        dist = calculate_haversine_distance(query.lat, query.lng, pt["lat"], pt["lng"])
        pt_copy = dict(pt)
        pt_copy["distance_km"] = round(dist, 2)
        evaluated_points.append(pt_copy)

    # Sort strictly ascending by physical proximity
    evaluated_points.sort(key=lambda x: x["distance_km"])

    # Slice top 5 nearest points
    nearest_5_points = evaluated_points[:5]

    return {
        "query": query.model_dump(),
        "count": len(nearest_5_points),
        "points": nearest_5_points
    }