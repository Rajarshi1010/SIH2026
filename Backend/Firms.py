"""
Firms.py - NASA FIRMS Telemetry Ingestion & Spatial Memory Buffer

- Downloads global VIIRS satellite CSV telemetry asynchronously via /area/ endpoint
- Loads NASA_FIRMS_MAP_KEY from .env
- Tracks confidence levels ('n', 'h', 'l') per detection
- Maintains spatial grid resolution (~11km) over a sliding 5-day window
- Computes spatial persistence (s_hist) and industrial redundancy penalties
"""

import os
import csv
import httpx
from typing import List, Dict, Tuple, Any
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

NASA_FIRMS_MAP_KEY = os.getenv("MAP_KEY", "").strip()

# In-memory spatial buffer tracking active acquisition dates per ~11km grid cell
GRID_5DAY_BUFFER: Dict[str, set] = {}


def get_grid_key(lat: float, lng: float, precision: int = 1) -> str:
    """Rounds coordinates to precision 1 decimal (~11km spatial grid cell)."""
    return f"{round(lat, precision)}:{round(lng, precision)}"


async def fetch_live_firms_data(days: int = 5) -> List[Dict[str, Any]]:
    """
    Fetches global VIIRS NRT CSV telemetry from NASA FIRMS.
    Populates GRID_5DAY_BUFFER with active acquisition dates per spatial cell.
    """
    if not NASA_FIRMS_MAP_KEY:
        print("[Firms Error] NASA_FIRMS_MAP_KEY environment variable is not set.")
        return []

    # NASA FIRMS global area URL
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_MAP_KEY}/VIIRS_SNPP_NRT/world/{days}"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)

            if response.status_code != 200:
                print(
                    f"[Firms Error] NASA API responded with HTTP status {response.status_code}: "
                    f"{response.text[:200]}"
                )
                return []

            lines = response.text.splitlines()
            if not lines:
                return []

            reader = csv.DictReader(lines)
            raw_telemetry = []
            GRID_5DAY_BUFFER.clear()

            for idx, row in enumerate(reader):
                try:
                    lat = float(row["latitude"])
                    lng = float(row["longitude"])
                    frp = float(row["frp"])
                    acq_date = row["acq_date"]
                    confidence = row.get("confidence", "n").lower()

                    # Track active days per spatial cell in memory
                    grid_key = get_grid_key(lat, lng)
                    if grid_key not in GRID_5DAY_BUFFER:
                        GRID_5DAY_BUFFER[grid_key] = set()
                    GRID_5DAY_BUFFER[grid_key].add(acq_date)

                    raw_telemetry.append({
                        "id": idx + 1,
                        "lat": lat,
                        "lng": lng,
                        "frp": frp,
                        "acq_date": acq_date,
                        "confidence": confidence
                    })
                except (KeyError, ValueError):
                    continue

            return raw_telemetry

    except Exception as err:
        print(f"[Firms Exception] Failed during HTTP ingestion: {err}")
        return []


def calculate_history_and_redundancy(lat: float, lng: float) -> Tuple[float, float, int]:
    """
    Evaluates spatial persistence for a given latitude/longitude.
    Returns:
        - s_hist: Normalized historical persistence score (0.20 to 1.0)
        - penalty_multiplier: 0.35 if active for 4+ days (65% reduction), else 1.0
        - active_days: Count of distinct days active within the 5-day window
    """
    grid_key = get_grid_key(lat, lng)
    active_dates = GRID_5DAY_BUFFER.get(grid_key, set())
    active_days = len(active_dates)

    s_hist = min(1.0, round(active_days / 5.0, 2)) if active_days > 0 else 0.20
    penalty_multiplier = 0.35 if active_days >= 4 else 1.0

    return s_hist, penalty_multiplier, active_days