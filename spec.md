# System Architecture & Technical Specification: GeoAI Industrial Fire Classifier 

## 1. Executive Summary & Problem Mandate
This specification defines the production-grade GeoAI backend for Problem Statement **SIH26162** (sponsored by the **National Technical Research Organisation - NTRO** under the Disaster Management theme). 

### Operational Context & The Core Problem
Conventional satellite fire detection systems (e.g., NASA FIRMS) suffer from **semantic blindness**—they detect thermal infrared anomalies indiscriminately, outputting identical point coordinates whether the heat source is a routine oil refinery flare stack, a massive blast furnace, a catastrophic chemical plant explosion, crop stubble burning, or rooftop solar glint. NTRO's explicit mission mandate requires:
1. **Segregation & Classification:** Automated, auditable classification of industrial fires and persistent thermal sources (refineries, petrochemical complexes, thermal power plants, steel mills, mining zones, LNG terminals) from natural/agricultural fires and non-fire thermal noise.
2. **GIS Visualization:** Interactive GIS storage and map-overlay visualization with transparent attribution and confidence metrics.
3. **Latency & Reliability Defense:** Elimination of the 6-to-12-hour polar revisit blind spot and resilience against monsoon cloud/smoke occlusion without incurring external commercial licensing costs.

---

## 2. Ultra-Lean Directory Structure

The backend is organized into a consolidated, high-cohesion structure that eliminates micro-file sprawl while preserving separation of concerns:

(approximate file directory, first scan the codebase then take actions)
geoai-fire-engine/
├── .env.example
├── .gitignore
├── docker-compose.yml
├── spec.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py              # FastAPI app, CORS, lifespans, API router & WebSockets
│   ├── config.py            # Pydantic v2 BaseSettings, environment validation & constants
│   ├── database.py          # Async SQLAlchemy engine, PostGIS connection & ORM models
│   ├── schemas.py           # Pydantic request/response schemas & GeoJSON validators
│   ├── ingestion.py         # FIRMS / INSAT ingestors, Footprint (DEFM) & H3 indexing
│   ├── pipeline.py          # KER fast-path, pyrometry rules, verification fallback
│   ├── model.py             # LightGBM classifier, feature extraction & TreeSHAP
│   └── tasks.py             # Celery worker: 15-min polling, nightly sync & retraining
│
├── data/
│   ├── init.sql             # PostgreSQL extensions (postgis, timescaledb) & DDL
│   ├── osm_industrial.geojson  # Filtered OSM industrial boundaries for India
│   └── flares_registry.csv     # VIIRS Nightfire / World Bank flare database seed
│
├── docs/
│   └── FRONTEND_INTEGRATION.md # RFC 7946 GeoJSON contract & color-coding specs
│
└── frontend/                # Completely decoupled SPA (React / MapLibre GL)
    └── README.md            # Frontend developer instructions

# Overall architecture

[ NASA FIRMS (VIIRS 375m / MODIS) ]    [ ISRO INSAT-3D/3DR (15-min) ]    [ OpenStreetMap Layers ]
               │                                      │                                  │
               └──────────────────────┬───────────────┘                                  │
                                      ▼                                                  │
┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ LAYER 1: MULTI-SOURCE INGESTION & GEOMETRIC NORMALIZATION                            │ │
│ • 15-min cadence fusion (closes 6-12h polar orbit gap)                     │ │
│ • Dynamic Elliptical Footprint Modeling (DEFM) for swath-edge correction             │ │
│ • Uber H3 Hexagonal Binning (Resolution 9, ~500m aperture)                 │ │
└─────────────────────────────────────┬────────────────────────────────────────────────┘ │
                                      ▼                                                  │
┌──────────────────────────────────────────────────────────────────────────────────────┐ │
│ LAYER 2: KNOWN-EMITTER REGISTRY (KER) FAST-PATH MATCHING                             │◄┘
│ • H3 spatial match against persistent emitter catalog (refineries, power plants)
│ • If Matched & FRP Z-Score < 2.0:                                                    │
│     └── Assign: "PERSISTENT_INDUSTRIAL_SOURCE" (Bypasses ML entirely)       │
└─────────────────────────────────────┬────────────────────────────────────────────────┘
                                      │ (Unmatched Residuals: 20-40% of stream)
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: DETERMINISTIC PYROMETRY & GLINT PRE-FILTER                                  │
│ • Dual-band Planck Pyrometry: T_combustion > 1200K + Multi-night persistence
│     └── Assign: "ROUTINE_GAS_FLARE" (Filtered event, 99% flare accuracy)   │
│ • Solar Glint Gating: Day-only + Solar Zenith < 25° + FRP < 3MW                      │
│     └── Assign: "FALSE_POSITIVE_GLINT" (Logged to audit trail)             │
└─────────────────────────────────────┬────────────────────────────────────────────────┘
                                      │ (True Ambiguous Anomalies)
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: RESIDUAL MACHINE LEARNING CLASSIFIER (LightGBM)                             │
│ • Features: Rolling FRP Z-score, Diurnal persistence ratio, OSM distance, Landcover
│ • Target Classes: Industrial Fire, Stubble Burn, Wildfire, Unmapped Emitter, Surface
│ • TreeSHAP Attribution Engine: Generates local feature explanations per inference
└─────────────────────────────────────┬────────────────────────────────────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: CONDITIONAL MULTI-TIER VERIFICATION                                         │
│ • Tier 1: Sentinel-2 / Landsat via STAC API (ΔNBR burn-scar calculation)    │
│ • Tier 2 (Monsoon Fallback): INSAT-3D/3DR 15-min MIR/TIR persistence trends  │
│ • Tier 3 (Provisional): Surface as "PROVISIONALLY_CLASSIFIED" (Zero stalls) │
└─────────────────────────────────────┬────────────────────────────────────────────────┘
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 6: GIS DELIVERY, STREAMING & CONTINUOUS DRIFT MITIGATION                       │
│ • GeoJSON FeatureCollection REST API & real-time WebSocket broadcast       │
│ • Human-in-the-Loop (HITL) review queue for low-confidence inferences (< 0.70)[cite: 1]
│ • Nightly PostGIS registry updates & automated 90-day model retraining loop[cite: 1]│
└──────────────────────────────────────────────────────────────────────────────────────┘



