"""
Engine.py - Multi-Criteria Disaster Risk Scoring Engine

Calculates composite risk score using weighted linear combination:
- Live Fire Radiative Power Intensity (w_live = 0.45)
- Spatial Telemetry Persistence / History (w_hist = 0.31)
- OSM Baseline Vulnerability (w_osm = 0.24)
"""

class ScoringEngine:
    def __init__(self, w_live: float = 0.45, w_hist: float = 0.31, w_osm: float = 0.24):
        self.w_live = w_live
        self.w_hist = w_hist
        self.w_osm = w_osm

    def calculate_score(self, s_live: float, s_hist: float, s_osm: float) -> dict:
        """
        Calculates raw composite risk score bounded between 0.0 and 1.0.
        """
        raw_score = (self.w_live * s_live) + (self.w_hist * s_hist) + (self.w_osm * s_osm)
        composite_score = round(min(1.0, max(0.0, raw_score)), 4)

        return {
            "composite_score": composite_score,
            "components": {
                "s_live": s_live,
                "s_hist": s_hist,
                "s_osm": s_osm
            }
        }

scoring_engine = ScoringEngine()