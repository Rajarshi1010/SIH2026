# Agnikavach

**Automated Satellite Thermal Anomaly Segregation, Industrial Flare Disambiguation & Disaster Attribution Engine**

*Developed under Problem Statement SIH26162 for the National Technical Research Organisation (NTRO).*

---

## Contents
1. [Executive Summary & Problem Mandate](#1-executive-summary--problem-mandate)
2. [Why Existing Market Platforms Fail](#2-why-existing-market-platforms-fail)
3. [System Architecture & Multi-Layer Pipeline](#3-system-architecture--multi-layer-pipeline)
4. [Mathematical & Physical Foundations](#4-mathematical--physical-foundations)
5. [Repository Structure & Source Code Map](#5-repository-structure--source-code-map)
6. [Quick Start: Automated Local Execution & Testing](#6-quick-start-automated-local-execution--testing)
7. [Automated Comparative Audit: GeoAI vs. NASA FIRMS](#7-automated-comparative-audit-geoai-vs-nasa-firms)
8. [API & GIS Streaming Reference](#8-api--gis-streaming-reference)
9. [Zero-Cost Production Hosting Strategy](#9-zero-cost-production-hosting-strategy)

---

## 1. Executive Summary & Problem Mandate

Conventional satellite thermal infrared fire detection systems—such as NASA FIRMS (VIIRS 375m / MODIS 1km), ESA World Fire Atlas, and Global Forest Watch—suffer from **semantic blindness**. These systems detect infrared radiation anomalies indiscriminately, outputting identical red point markers regardless of whether the heat source is:
- A routine petrochemical flare stack operating safely at an oil refinery,
- Molten iron tapping and basic oxygen furnace exhaust at a steel plant,
- Century-old smoldering coal seams,
- Seasonal agricultural stubble burning in Punjab or Haryana,
- High-reflectance rooftop solar panels or water glint, or
- **A catastrophic chemical plant explosion, tank farm inferno, or industrial accident.**

For strategic national agencies such as the **National Technical Research Organisation (NTRO)**, this semantic ambiguity poses severe operational challenges:
- **False Alarm Fatigue:** Routine industrial operations trigger continuous priority alerts, desensitizing surveillance operators.
- **Disaster Invisibility:** A catastrophic fire occurring *inside* a known refinery or steel mill is ignored because operators assume the satellite detection is just routine facility flaring.
- **Attribution Void:** Black-box alarms fail to provide mathematical justification or transparent evidence for why an event was categorized as agricultural, forest, or industrial.

The **GeoAI Industrial Fire Classifier** provides a deterministic, physics-grounded, and explainable AI infrastructure designed to eliminate this ambiguity across India's strategic industrial corridors.

---

## 2. Why Existing Market Platforms Fail

Existing commercial and open-source fire monitoring systems fail to meet strategic defence and disaster response requirements:

| Capability | NASA FIRMS / Global Forest Watch | Commercial Geospatial Platforms | GeoAI Industrial Fire Classifier |
| :--- | :--- | :--- | :--- |
| **Facility Disambiguation** | **None.** Outputs raw latitude/longitude points with generic "Fire" tag. | Manual polygon overlay; requires human analyst to identify facilities. | **Automated.** Sub-pixel H3 hexagonal matching against high-precision industrial registries. |
| **Surge vs. Routine Detection** | **None.** Routine flare stack triggers the same alert as a burning storage tank. | Static thresholding (FRP > X MW), which fails on facilities with large baselines. | **Dynamic Z-Score Tracking.** Compares current FRP against facility baseline ($\mu_{\text{facility}}, \sigma_{\text{facility}}$). |
| **Combustion Pyrometry** | Ignored. Only reports single-channel brightness temperature. | Unavailable on automated streams. | **Planck Dual-Band Inversion.** Solves Dozier equations ($3.74\,\mu\text{m}$ vs. $11.45\,\mu\text{m}$) to estimate sub-pixel combustion temperature ($T_{\text{combustion}}$). |
| **Solar Glint Rejection** | Basic day/night flag. Solar panels frequently trigger fire alerts. | None or proprietary manual flagging. | **Deterministic Glint Gating.** Filters low-FRP specular reflections during daytime passes. |
| **Explainable AI (XAI)** | **None.** No classification models. | Proprietary black-box deep learning without audit trails. | **Native TreeSHAP Attribution.** Every prediction outputs verified percentage contributions per feature. |
| **Optical Burn Verification** | **None.** Thermal infrared only. | High-cost commercial satellite tasking ($500+ per image). | **Conditional STAC API ($\Delta\text{NBR}$).** Automated Sentinel-2 L2A querying at zero cost. |
| **Operating Cost** | Free, but unclassified and noisy. | $5,000–$50,000/month in licensing fees. | **$0.00 / Zero Cost.** Uses open-data feeds and lightweight CPU models (< 2 MB). |

---

## 3. System Architecture & Multi-Layer Pipeline

The processing pipeline is organized into six cohesive layers designed for high-throughput, low-latency processing without external commercial dependencies:

```
[ NASA FIRMS (VIIRS 375m / MODIS) ]       [ ISRO INSAT-3D/3DR (15-min) ]       [ OpenStreetMap Industrial Layers ]
                 │                                        │                                       │
                 └────────────────────────┬───────────────┘                                       │
                                          ▼                                                       │
┌───────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ LAYER 1: MULTI-SOURCE INGESTION & GEOMETRIC NORMALIZATION                                     │ │
│ • 15-minute cadence polling via asynchronous HTTP (`Backend/ingestion.py`)                     │ │
│ • Dynamic Elliptical Footprint Modeling (DEFM) correcting satellite scan/track swath-edge skew│ │
│ • Uber H3 Hexagonal Binning (Resolution 8/9, ~500m aperture)                                  │ │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘ │
                                        ▼                                                         │
┌───────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ LAYER 2: KNOWN-EMITTER REGISTRY (KER) FAST-PATH                                               │◄┘
│ • O(1) H3 lookup + PostGIS `ST_DWithin` geodesic verification (`Backend/pipeline.py`)          │
│ • FRP Z-score calculation against facility baseline:                                          │
│     ├── If Z-score < 2.5 ──► "PERSISTENT_INDUSTRIAL_SOURCE" (Bypasses ML, zero delay)         │
│     └── If Z-score >= 2.5 ─► "INDUSTRIAL_FIRE_ALERT" (Flagged to HITL Review Queue)           │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                        │ (Unmatched Residuals: 20–40% of stream)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: DETERMINISTIC PYROMETRY & SOLAR GLINT PRE-FILTER                                     │
│ • Dual-band Planck Pyrometry: T_combustion > 1200 K ──► "ROUTINE_GAS_FLARE"                   │
│ • Solar Glint Gating: Day-only + FRP < 3.0 MW + low conf ──► "FALSE_POSITIVE_GLINT"          │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                        │ (Ambiguous Residual Hotspots)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: RESIDUAL MACHINE LEARNING CLASSIFIER & TreeSHAP                                      │
│ • LightGBM Multi-Class GBDT (`Backend/model.py`)                                              │
│ • Features: Diurnal persistence, distance to industrial polygons, FRP Z-score, pixel area     │
│ • Target Classes: Agricultural Stubble, Forest Fire, Unmapped Industrial Accident             │
│ • Local TreeSHAP Engine: Generates exact percentage drivers for each classification          │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: CONDITIONAL MULTI-TIER OPTICAL VERIFICATION                                          │
│ • Tier 1: Sentinel-2 L2A via Planetary Computer STAC (Calculates ΔNBR burn-scar damage)       │
│ • Tier 2 (Monsoon Fallback): Detects cloud occlusion (> 75%) and switches to INSAT trend      │
│ • Tier 3 (Provisional): Guarantees zero pipeline stalls if external STAC times out            │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 6: GIS DELIVERY & REAL-TIME WEBSTREAMING                                                │
│ • RFC 7946 GeoJSON FeatureCollection endpoint (`/api/v1/gis/features`) with NTRO color coding  │
│ • Real-Time Streaming WebSocket feed (`/api/v1/ws/alerts`) for live map updates              │
│ • Human-in-the-Loop (HITL) analyst triage queue (`/api/v1/reviews`)                           │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Mathematical & Physical Foundations

### 4.1. Dynamic Elliptical Footprint Modeling (DEFM)
At the edge of a polar satellite swath, scan angle distortion causes a nominal $375\text{ m}$ VIIRS pixel to expand into an ellipse of up to $800\text{ m} \times 800\text{ m}$ (and MODIS pixels from $1\text{ km}$ to $4.8\text{ km} \times 2.0\text{ km}$). Treating pixels as dimensionless points causes false associations with neighboring industrial complexes. 

DEFM computes the exact semi-major axis ($r_{\text{lon}}$) and semi-minor axis ($r_{\text{lat}}$) in angular degrees:

$$r_{\text{lat}} = \frac{\text{track\_km} / 2}{111.0},\quad r_{\text{lon}} = \frac{\text{scan\_km} / 2}{111.0 \times \cos(\text{latitude})}$$

This elliptical polygon is generated and stored directly inside PostGIS for boundary intersection.

### 4.2. Dual-Band Planck Combustion Pyrometry (Dozier Inversion)
Biomass fires (agricultural residue and forest litter) burn at smoldering temperatures ($600\text{ K} - 900\text{ K}$), whereas industrial gas flares and metallurgical processes burn at $1,200\text{ K} - 1,800\text{ K}$.

Using Planck's spectral radiance equation for Mid-Infrared ($\lambda_{\text{MIR}} = 3.74\,\mu\text{m}$) and Thermal-Infrared ($\lambda_{\text{TIR}} = 11.45\,\mu\text{m}$):

$$L(\lambda, T) = \frac{c_1}{\lambda^5 \left( \exp\left(\frac{c_2}{\lambda T}\right) - 1 \right)}$$

where $c_1 = 1.19104 \times 10^8\,\text{W}\cdot\mu\text{m}^4/(\text{m}^2\cdot\text{sr})$ and $c_2 = 14387.77\,\mu\text{m}\cdot\text{K}$. 

By analyzing the dual-channel radiance ratio $R = L_{\text{MIR}} / L_{\text{TIR}}$, the sub-pixel combustion temperature $T_{\text{combustion}}$ is estimated. Targets exceeding $1,200\text{ K}$ with high persistence are classified directly as `ROUTINE_GAS_FLARE`.

### 4.3. Statistical Anomaly Surge Detection (Z-Score)
To detect true disasters occurring within known industrial facilities, every registered emitter maintains a historical baseline radiative output ($\mu_{\text{baseline}}$, $\sigma_{\text{baseline}}$). For each incoming incident:

$$Z_{\text{FRP}} = \frac{\text{FRP}_{\text{observed}} - \mu_{\text{baseline}}}{\sigma_{\text{baseline}}}$$

- **$Z_{\text{FRP}} < 2.5$:** Expected operational variation $\rightarrow$ Classified as `PERSISTENT_INDUSTRIAL_SOURCE`.
- **$Z_{\text{FRP}} \ge 2.5$:** Statistically significant thermal surge (e.g., storage tank rupture or major structural blaze) $\rightarrow$ Classified as `INDUSTRIAL_FIRE_ALERT` and immediately dispatched to the HITL priority queue.

### 4.4. Normalized Burn Ratio ($\Delta\text{NBR}$) Optical Verification
Thermal anomalies represent instantaneous heat, which can be caused by hot roofs or transient flares. Ground destruction leaves a physical burn scar. Sentinel-2 L2A observes Near-Infrared (Band 8, $842\text{ nm}$) and Shortwave-Infrared (Band 12, $2190\text{ nm}$):

$$\text{NBR} = \frac{\text{NIR} - \text{SWIR}}{\text{NIR} + \text{SWIR}},\quad \Delta\text{NBR} = \text{NBR}_{\text{pre-fire}} - \text{NBR}_{\text{post-fire}}$$

- **$\Delta\text{NBR} \ge 0.27$:** Physical ground destruction, ash deposition, and vegetation loss $\rightarrow$ Verified raging fire.
- **$\Delta\text{NBR} < 0.15$:** Surface remains intact $\rightarrow$ Confirmed non-destructive heat source or transient thermal anomaly.

---

## 5. Repository Structure & Source Code Map

The backend is built around a consolidated layout:

```
SIH2026/
├── docker-compose.yml              # PostgreSQL 16 (PostGIS + TimescaleDB) & Redis containers
├── .env.example                    # Environment template with sanitized parameters
├── .gitignore                      # Cleaned production gitignore (protects secrets and model files)
│
├── Backend/
│   ├── Dockerfile                  # Production container definition for FastAPI service
│   ├── requirements.txt            # Python dependencies (FastAPI, SQLAlchemy, H3, LightGBM, Shapely)
│   ├── config.py                   # Pydantic v2 settings, BBOX parameters, STAC endpoints
│   ├── database.py                 # Async SQLAlchemy engine, PostGIS Geometry mappings, ORM models
│   ├── schemas.py                  # Pydantic request/response schemas & GeoJSON models
│   ├── ingestion.py                # Layer 1: NASA FIRMS async fetcher, DEFM footprint, H3 binning
│   ├── pipeline.py                 # Layers 2, 3, 5: KER fast-path, Planck pyrometry, Sentinel-2 STAC
│   ├── model.py                    # Layer 4: LightGBM classifier & native TreeSHAP attribution engine
│   ├── tasks.py                    # Automated background polling worker (15-min cycle)
│   └── main.py                     # FastAPI application, Lifespan startup, REST & WebSocket routers
│
├── data/
│   ├── init.sql                    # TimescaleDB hypertable setup, PostGIS extensions, DDL schema
│   ├── flares_registry.csv         # Curated Indian strategic emitters (refineries, flares, steel mills)
│   └── osm_industrial.geojson      # RFC 7946 spatial boundaries for industrial corridors
│
└── scripts/
    ├── seed_data_generator.py      # Automated generator for spatial boundaries and PostGIS seed loader
    ├── run_and_compare.py          # Zero-command audit script comparing GeoAI against NASA FIRMS
    └── test_layer4_inference.py    # Unit test suite verifying LightGBM and TreeSHAP attribution math
```

### Important Code Reference Points
- **Swath-Edge Footprint Modeling:** [`compute_defm_footprint`](file:///c:/Users/arung/AntigravityProjects/SIH2026/Backend/ingestion.py#L40-L75)
- **Fast-Path Registry & Surge Logic:** [`evaluate_ker_fastpath`](file:///c:/Users/arung/AntigravityProjects/SIH2026/Backend/pipeline.py#L125-L180)
- **Planck Radiance Inversion:** [`estimate_planck_temperature`](file:///c:/Users/arung/AntigravityProjects/SIH2026/Backend/pipeline.py#L60-L85)
- **Local TreeSHAP Attribution:** [`ResidualClassifier.predict_with_shap`](file:///c:/Users/arung/AntigravityProjects/SIH2026/Backend/model.py#L235-L289)
- **Sentinel-2 STAC Verification:** [`verify_incident_burn_scar`](file:///c:/Users/arung/AntigravityProjects/SIH2026/Backend/pipeline.py#L48-L125)
- **Automated Polling Loop:** [`TelemetryPollingWorker`](file:///c:/Users/arung/AntigravityProjects/SIH2026/Backend/tasks.py#L20-L80)

---

## 6. Quick Start: Automated Local Execution & Testing

The system is configured for automated startup using Docker and Python.

### Step 1: Clone and Configure Environment
Copy the environment template:
```powershell
cp .env.example .env
```
Ensure your `.env` contains your active `FIRMS_MAP_KEY`. (A functional default key is pre-configured).

### Step 2: Start Infrastructure Containers
Start TimescaleDB with PostGIS and Redis in background daemon mode:
```powershell
docker compose up -d postgres_db redis_cache
```
*Note: `postgres_db` automatically runs `data/init.sql` on first boot, configuring PostGIS extensions, spatial indexes, and TimescaleDB hypertables.*

### Step 3: Populate Reference Spatial Data
Run the automated seed script to populate India's strategic industrial facilities and pre-compute H3 hexagonal indexes:
```powershell
$env:PYTHONPATH="Backend"; & .\.venv\Scripts\python.exe scripts/seed_data_generator.py
```

### Step 4: Run the Backend API Service
Start the FastAPI server:
```powershell
$env:PYTHONPATH="Backend"; & .\.venv\Scripts\python.exe -m uvicorn Backend.main:app --reload --host 127.0.0.1 --port 8000
```
When started, the **Automated Polling Worker** launches automatically in the background, polling NASA FIRMS every 15 minutes, processing new incidents, and broadcasting to WebSockets.

---

## 7. Automated Comparative Audit: GeoAI vs. NASA FIRMS

To verify system performance, run the built-in audit script:
```powershell
$env:PYTHONPATH="Backend"; & .\.venv\Scripts\python.exe scripts/run_and_compare.py
```

### Audit Output
The audit script executes a side-by-side comparison across live satellite incidents:

```
=========================================================================================================
 GeoAI INDUSTRIAL FIRE CLASSIFIER vs. RAW NASA FIRMS: COMPARATIVE AUDIT
=========================================================================================================

[Summary Metrics]
Total Thermal Anomalies Ingested from Satellite: 46
Raw NASA FIRMS Verdict: ALL 46 marked indiscriminately as 'ACTIVE FIRE'
---------------------------------------------------------------------------------------------------------
GeoAI Multi-Layer Segregation:
  * WILDFIRE_FOREST_FIRE           :  32 incidents (Avg Confidence: 86.0%)
  * AGRICULTURAL_STUBBLE_FIRE      :   6 incidents (Avg Confidence: 100.0%)
  * PERSISTENT_INDUSTRIAL_SOURCE   :   5 incidents (Avg Confidence: 98.0%)
  * UNMAPPED_INDUSTRIAL_ACCIDENT   :   3 incidents (Avg Confidence: 67.0%)

=========================================================================================================
LAT / LON          | NASA FIRMS (Raw)     | GeoAI Classified               | FACILITY / ATTRIBUTION DRIVER
---------------------------------------------------------------------------------------------------------
23.7662, 86.4054   | FIRE (FRP: 7.3MW)    | PERSISTENT_INDUSTRIAL_SOURCE   | Matched: Jharia Coalfield Persistent Subsurface
22.2084, 84.8620   | FIRE (FRP: 4.3MW)    | PERSISTENT_INDUSTRIAL_SOURCE   | Matched: SAIL Rourkela Steel Plant
23.7120, 86.4501   | FIRE (FRP: 2.4MW)    | UNMAPPED_INDUSTRIAL_ACCIDENT   | High Anomaly! L5 STAC: PENDING
23.7736, 86.3654   | FIRE (FRP: 5.6MW)    | UNMAPPED_INDUSTRIAL_ACCIDENT   | High Anomaly! L5 STAC: PENDING
23.4022, 86.4411   | FIRE (FRP: 1.4MW)    | AGRICULTURAL_STUBBLE_FIRE      | Stubble: 37.8km from industry (SHAP: +44%)
28.0371, 69.6743   | FIRE (FRP: 3.3MW)    | WILDFIRE_FOREST_FIRE           | Non-industrial biomass fire
9.6120, 78.4025    | FIRE (FRP: 7.7MW)    | WILDFIRE_FOREST_FIRE           | Non-industrial biomass fire
=========================================================================================================
```

### Observations
1. **False Alarm Elimination:** Raw FIRMS flagged the blast furnace operations at **SAIL Rourkela Steel Plant** and continuous mining fires at **Jharia** as generic fires. GeoAI recognized them as `PERSISTENT_INDUSTRIAL_SOURCE` ($98\%$ confidence), suppressing unnecessary emergency dispatches.
2. **Agricultural Disambiguation:** Isolated rural anomalies in Jharkhand were attributed to `AGRICULTURAL_STUBBLE_FIRE` based on low FRP and distance from industrial infrastructure.
3. **Local Explainability:** Every prediction contains exact feature percentages from TreeSHAP (e.g., $+44.6\%$ distance to industrial facility, $+21.7\%$ relative FRP intensity).

---

## 8. API & GIS Streaming Reference

Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### Key Endpoints

#### 1. RFC 7946 Standard GeoJSON Stream
- **URL:** `GET /api/v1/gis/features`
- **Description:** Returns map-ready GeoJSON features styled per the NTRO operational color palette:
  - `#E63946` (Crimson): `INDUSTRIAL_FIRE_ALERT`
  - `#D62828` (Deep Red): `UNMAPPED_INDUSTRIAL_ACCIDENT`
  - `#7209B7` (Purple): `PERSISTENT_INDUSTRIAL_SOURCE`
  - `#F77F00` (Orange): `ROUTINE_GAS_FLARE`
  - `#FCBF49` (Yellow): `AGRICULTURAL_STUBBLE_FIRE`
  - `#2A9D8F` (Green): `WILDFIRE_FOREST_FIRE`
- **Parameters:** `limit` (int), `classification` (str), `is_industrial` (bool)

#### 2. Real-Time WebSocket Alerts Feed
- **URL:** `ws://127.0.0.1:8000/api/v1/ws/alerts`
- **Description:** Broadcasts JSON event payloads within milliseconds of a newly classified satellite incident or emergency alert. Supports bidirectional ping/pong.

#### 3. Human-in-the-Loop (HITL) Review Queue
- **URL:** `GET /api/v1/reviews?status_filter=pending`
- **Description:** Lists all anomalous incidents flagged for analyst verification due to low classification confidence ($< 0.70$) or unmapped industrial proximity.

#### 4. Manual Ingestion & Pipeline Triggers
- **Trigger Telemetry Ingest:** `POST /api/v1/telemetry/ingest?source=VIIRS_SNPP_NRT&day_range=1`
- **Trigger Processing Run:** `POST /api/v1/pipeline/run-deterministic?batch_limit=100`

---

## 9. Zero-Cost Production Hosting Strategy

The system is engineered to operate indefinitely on free cloud tiers:

1. **Database:** Supabase Free Tier or Neon Free Tier (Postgres 16 + PostGIS extension pre-installed, up to $500\text{ MB} - 1\text{ GB}$ storage).
2. **Application Service:** Render.com Web Service Free Tier or Railway/Koyeb (Runs the asynchronous FastAPI backend with zero continuous hosting cost).
3. **Data Storage Footprint:** 
   - Regional India telemetry footprint: $\approx 200\text{ KB/day}$.
   - 180 Days of Historical Storage: $< 36\text{ MB}$.
   - Machine Learning Model Size: $< 2\text{ MB}$ (LightGBM text format).
   - CPU / RAM Consumption: Runs comfortably within $512\text{ MB}$ RAM on standard dual-core free-tier cloud instances.
