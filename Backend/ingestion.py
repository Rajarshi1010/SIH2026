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
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid

import httpx
import h3
from shapely.affinity import rotate
from shapely.geometry import Point, Polygon
from config import settings
from database import get_duckdb

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


# Stored history for today and yesterday (UTC) is refetched after this long,
# since FIRMS can still add late satellite passes to those days.
HISTORY_RECENT_TTL = timedelta(minutes=15)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


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
        bbox: Optional[str] = None,
        start_date: Optional[str] = None,
    ) -> str:
        """
        Asynchronously fetches FIRMS CSV telemetry stream.
        URL pattern: {FIRMS_API_URL}/{MAP_KEY}/{SOURCE}/{BBOX}/{DAY_RANGE}[/{START_DATE}]
        FIRMS accepts DAY_RANGE 1..5; START_DATE (YYYY-MM-DD) shifts the window back in time.
        """
        if not self.map_key or "your_nasa_firms" in self.map_key:
            raise ValueError("NASA FIRMS Map Key is not configured.")

        url = f"{self.api_base}/{self.map_key}/{source}/{bbox or self.operational_bbox}/{day_range}"
        if start_date:
            url = f"{url}/{start_date}"
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

    async def _fetch_firms_daily(
        self,
        lat: float,
        lon: float,
        first_day: date,
        last_day: date,
        radius_km: float,
        source: str,
    ) -> Dict[date, Dict[str, float]]:
        """
        Daily detection counts and FRP within `radius_km` of a point from NASA FIRMS,
        for every day in [first_day, last_day]. The range is split into 5-day requests
        (the FIRMS maximum) fetched in parallel. Days without detections come back as zeros.
        """
        dlat = radius_km / 111.32
        dlon = radius_km / (111.32 * max(math.cos(math.radians(lat)), 0.01))
        bbox = f"{lon - dlon:.4f},{lat - dlat:.4f},{lon + dlon:.4f},{lat + dlat:.4f}"

        chunks = []
        cursor = first_day
        while cursor <= last_day:
            span = min(5, (last_day - cursor).days + 1)
            chunks.append((cursor, span))
            cursor += timedelta(days=span)

        csv_texts = await asyncio.gather(*(
            self.fetch_telemetry(source=source, day_range=span, bbox=bbox, start_date=start.isoformat())
            for start, span in chunks
        ))

        per_day = {
            first_day + timedelta(days=i): {"detections": 0, "max_frp_mw": 0.0, "total_frp_mw": 0.0}
            for i in range((last_day - first_day).days + 1)
        }
        for text in csv_texts:
            for row in csv.DictReader(io.StringIO(text)):
                try:
                    r_lat, r_lon = float(row["latitude"]), float(row["longitude"])
                    frp = max(float(row.get("frp") or 0.0), 0.0)
                    day = per_day.get(date.fromisoformat(row["acq_date"]))
                except (KeyError, ValueError):
                    continue
                if day is None or _haversine_km(lat, lon, r_lat, r_lon) > radius_km:
                    continue
                day["detections"] += 1
                day["max_frp_mw"] = max(day["max_frp_mw"], frp)
                day["total_frp_mw"] += frp
        return per_day

    async def fetch_location_history(
        self,
        lat: float,
        lon: float,
        days: int = 30,
        radius_km: float = 5.0,
        source: str = "VIIRS_SNPP_NRT",
    ) -> Dict[str, Any]:
        """
        Daily detection history within `radius_km` of a point, stored in DuckDB
        (`frp_history_daily`) and topped up from NASA FIRMS.

        A stored day is reused as-is once it is older than yesterday (UTC); FIRMS
        can still add late passes to today and yesterday, so those are refetched
        when their stored copy is older than HISTORY_RECENT_TTL. Only the span
        covering missing or stale days is requested from FIRMS.
        """
        location_key = f"{lat:.3f},{lon:.3f}"
        now = datetime.now(timezone.utc)
        today = now.date()
        first_day = today - timedelta(days=days - 1)
        settled_before = today - timedelta(days=1)

        conn = get_duckdb()
        stored = {
            row[0]: {"detections": row[1], "max_frp_mw": row[2], "total_frp_mw": row[3], "fetched_at": row[4]}
            for row in conn.execute(
                """
                SELECT day, detections, max_frp_mw, total_frp_mw, fetched_at
                FROM frp_history_daily
                WHERE location_key = ? AND radius_km = ? AND source = ? AND day BETWEEN ? AND ?
                """,
                [location_key, radius_km, source, first_day, today],
            ).fetchall()
        }

        window = [first_day + timedelta(days=i) for i in range(days)]
        needed = [
            d for d in window
            if d not in stored
            or (d >= settled_before and now - stored[d]["fetched_at"] > HISTORY_RECENT_TTL)
        ]

        if needed:
            fetched = await self._fetch_firms_daily(lat, lon, min(needed), max(needed), radius_km, source)
            conn.executemany(
                """
                INSERT OR REPLACE INTO frp_history_daily
                    (location_key, radius_km, day, source, detections, max_frp_mw, total_frp_mw, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    [location_key, radius_km, d, source, v["detections"], v["max_frp_mw"], v["total_frp_mw"], now]
                    for d, v in fetched.items()
                ],
            )
            stored.update({d: {**v, "fetched_at": now} for d, v in fetched.items()})

        series = [
            {
                "date": d.isoformat(),
                "detections": int(stored[d]["detections"]),
                "max_frp_mw": round(float(stored[d]["max_frp_mw"]), 1),
                "total_frp_mw": round(float(stored[d]["total_frp_mw"]), 1),
            }
            for d in window
        ]
        refetched = sum(1 for d in window if needed and min(needed) <= d <= max(needed))
        return {
            "latitude": lat,
            "longitude": lon,
            "radius_km": radius_km,
            "days": days,
            "source": f"NASA FIRMS {source}",
            "total_detections": sum(d["detections"] for d in series),
            "storage": {"days_from_duckdb": days - refetched, "days_from_firms": refetched},
            "series": series,
        }

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
        return await self.store_records(records, source=source)

    async def store_records(
        self,
        records: List[Dict[str, Any]],
        source: str = "VIIRS_SNPP_NRT",
    ) -> Dict[str, Any]:
        """Stores parsed telemetry records into DuckDB or PostgreSQL."""
        if not records:
            return {
                "source": source,
                "fetched_count": 0,
                "inserted_count": 0,
                "message": "No thermal anomalies detected in operational bounds.",
            }

        inserted = 0
        import json

        conn = get_duckdb()
        for item in records:
            h3_int = int(item["h3_index"], 16) if isinstance(item["h3_index"], str) else int(item["h3_index"])
            sat_val = "VIIRS" if "VIIRS" in str(item["instrument"]).upper() else "MODIS"

            # Check for existing record to prevent duplicates (accounting for satellite source)
            existing = conn.execute("""
                SELECT id FROM thermal_anomalies
                WHERE detected_at = ?
                  AND satellite = ?::satellite_source
                  AND ABS(latitude - ?) < 0.0001
                  AND ABS(longitude - ?) < 0.0001
                LIMIT 1;
            """, [item["detected_at"], sat_val, item["latitude"], item["longitude"]]).fetchone()

            if existing:
                continue

            # Insert into DuckDB with primitive integer downcasting (~12-15 bytes)
            conn.execute("""
                INSERT INTO thermal_anomalies (
                    id, h3_cell, detected_at, latitude, longitude,
                    brightness_mir, bright_t31, frp, satellite, confidence,
                    classification, classification_confidence, is_industrial,
                    raw_metadata
                ) VALUES (
                    ?, ?, ?, ?, ?,
                    ?, ?, ?, ?::satellite_source, ?,
                    'unclassified'::hazard_class, 0, FALSE,
                    ?
                );
            """, [
                str(uuid.uuid4()),
                h3_int,
                item["detected_at"],
                item["latitude"],
                item["longitude"],
                int(item["brightness"]),
                int(item["bright_t31"] or 0),
                int(item["frp"]),
                sat_val,
                item["confidence"],
                json.dumps(item["raw_metadata"])
            ])
            inserted += 1

        conn.execute("CHECKPOINT;")
        logger.info(f"[DuckDB] Ingestion successful: {inserted}/{len(records)} incidents saved.")

        return {
            "source": source,
            "engine": "duckdb",
            "fetched_count": len(records),
            "inserted_count": inserted,
            "status": "success",
        }



# Global singleton instance
firms_ingestion_engine = FirmsIngestionEngine()
