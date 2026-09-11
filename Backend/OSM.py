import json
import math
from pathlib import Path
from typing import List, Dict, Any, Optional

CACHE_FILE = Path(__file__).parent / "osm_zones.json"


class OSMSpatialIndex:
    """
    Builds an O(1) Spatial Hash Grid from OSM bounding boxes to eliminate
    costly nested loops over global satellite points.
    """
    def __init__(self, bin_size: float = 0.5):
        self.bin_size = bin_size
        self.grid: Dict[tuple, List[Dict[str, Any]]] = {}

    def _get_bin_key(self, lat: float, lng: float) -> tuple:
        return (math.floor(lat / self.bin_size), math.floor(lng / self.bin_size))

    def index_zones(self, zones: List[Dict[str, Any]]) -> None:
        self.grid.clear()
        for zone in zones:
            min_bin_lat = math.floor(zone['min_lat'] / self.bin_size)
            max_bin_lat = math.floor(zone['max_lat'] / self.bin_size)
            min_bin_lng = math.floor(zone['min_lng'] / self.bin_size)
            max_bin_lng = math.floor(zone['max_lng'] / self.bin_size)

            for b_lat in range(min_bin_lat, max_bin_lat + 1):
                for b_lng in range(min_bin_lng, max_bin_lng + 1):
                    key = (b_lat, b_lng)
                    if key not in self.grid:
                        self.grid[key] = []
                    self.grid[key].append(zone)

    def query_context(self, lat: float, lng: float) -> str:
        """Returns zone type ('industry', 'power_plant', 'refinery', 'forest') or 'none'."""
        key = self._get_bin_key(lat, lng)
        candidate_zones = self.grid.get(key, [])
        for zone in candidate_zones:
            if (zone['min_lat'] <= lat <= zone['max_lat']) and (zone['min_lng'] <= lng <= zone['max_lng']):
                return zone['type']
        return "none"

    def query_proximity(self, lat: float, lng: float, radius_km: float = 2.0) -> Optional[str]:
        """
        Searches within a 2km radius for 'industry' or 'refinery' zones.
        If both or multiple are found in proximity, returns the type of the nearest one.
        """
        base_b_lat, base_b_lng = self._get_bin_key(lat, lng)
        checked_zones = set()
        nearest_type: Optional[str] = None
        min_dist = float('inf')

        # Check current bin and 3x3 surrounding bins to safely cover radius boundaries
        for b_lat in range(base_b_lat - 1, base_b_lat + 2):
            for b_lng in range(base_b_lng - 1, base_b_lng + 2):
                for zone in self.grid.get((b_lat, b_lng), []):
                    zone_id = id(zone)
                    if zone_id in checked_zones:
                        continue
                    checked_zones.add(zone_id)

                    z_type = zone.get('type')
                    if z_type not in ('industry', 'refinery'):
                        continue

                    # Calculate distance from point to the bounding box center
                    center_lat = (zone['min_lat'] + zone['max_lat']) / 2.0
                    center_lng = (zone['min_lng'] + zone['max_lng']) / 2.0

                    dist = _calculate_haversine(lat, lng, center_lat, center_lng)

                    if dist <= radius_km and dist < min_dist:
                        min_dist = dist
                        nearest_type = z_type

        return nearest_type


def _calculate_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


_SPATIAL_INDEX = OSMSpatialIndex(bin_size=0.5)


def get_default_osm_zones() -> List[Dict[str, Any]]:
    """Loads spatial zones categorized by type."""
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass

    return [
        {"type": "industry", "min_lat": 22.70, "max_lat": 22.90, "min_lng": 86.05, "max_lng": 86.30},
        {"type": "power_plant", "min_lat": 23.55, "max_lat": 23.75, "min_lng": 86.75, "max_lng": 87.00},
        {"type": "refinery", "min_lat": 22.25, "max_lat": 22.45, "min_lng": 69.75, "max_lng": 70.05},
        {"type": "forest", "min_lat": 30.10, "max_lat": 30.60, "min_lng": 77.90, "max_lng": 78.40}
    ]


def load_and_index_osm() -> OSMSpatialIndex:
    zones = get_default_osm_zones()
    _SPATIAL_INDEX.index_zones(zones)
    return _SPATIAL_INDEX


def get_osm_facility_classification(lat: float, lng: float) -> Optional[str]:
    """Convenience function to check 2km proximity for industry or refinery."""
    index = load_and_index_osm()
    return index.query_proximity(lat, lng, radius_km=2.0)