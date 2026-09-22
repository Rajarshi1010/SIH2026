# Agnikavach (अग्निकवच)

**Automated Satellite Thermal Anomaly Segregation, Industrial Flare Disambiguation & Disaster Attribution Engine**

*Developed under Problem Statement SIH26162 for the National Technical Research Organisation (NTRO).*

---

## Contents
1. [Executive Summary & Problem Mandate](#1-executive-summary--problem-mandate)
2. [Why Existing Market Platforms Fail](#2-why-existing-market-platforms-fail)
3. [System Architecture & The DuckDB Dual-Table Engine](#3-system-architecture--the-duckdb-dual-table-engine)
4. [Mathematical & Physical Foundations](#4-mathematical--physical-foundations)
5. [Repository Structure & Source Code Map](#5-repository-structure--source-code-map)
6. [Quick Start: Local Execution & Verification](#6-quick-start-local-execution--verification)
7. [API & GIS Streaming Reference](#7-api--gis-streaming-reference)
8. [Zero-Cost Cloud Deployment: HuggingFace + Render + Vercel Stack](#8-zero-cost-cloud-deployment-huggingface--render--vercel-stack)
9. [Database Hosting & Storage Architecture](#9-database-hosting--storage-architecture)

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

**Agnikavach** provides a deterministic, physics-grounded, and explainable AI infrastructure designed to eliminate this ambiguity across India's strategic industrial corridors.

---

## 2. Why Existing Market Platforms Fail

| Capability | NASA FIRMS / Global Forest Watch | Commercial Geospatial Platforms | Agnikavach (GeoAI Engine) |
| :--- | :--- | :--- | :--- |
| **Facility Disambiguation** | **None.** Outputs raw coordinates with generic "Fire" tag. | Manual polygon overlay; requires human analyst verification. | **Automated.** Sub-pixel H3 hexagonal matching against 541,180 national structures. |
| **Surge vs. Routine Detection** | **None.** Routine flare stack triggers the same alert as a burning tank farm. | Static thresholding (FRP > X MW), which fails on facilities with large baselines. | **Dynamic Z-Score Tracking.** Compares current FRP against facility baseline ($\mu_{\text{facility}}, \sigma_{\text{facility}}$). |
| **Combustion Pyrometry** | Ignored. Only reports single-channel brightness temperature. | Unavailable on automated streams. | **Planck Dual-Band Inversion.** Solves Dozier equations ($3.74\,\mu\text{m}$ vs. $11.45\,\mu\text{m}$) for sub-pixel combustion temperature ($T_{\text{combustion}}$). |
| **Solar Glint Rejection** | Basic day/night flag. Solar panels frequently trigger fire alerts. | None or proprietary manual flagging. | **Deterministic Glint Gating.** Filters low-FRP specular reflections during daytime passes. |
| **Explainable AI (XAI)** | **None.** No classification models. | Proprietary black-box deep learning without audit trails. | **Native TreeSHAP Attribution.** Every prediction outputs verified percentage contributions per feature. |
| **Optical Burn Verification** | **None.** Thermal infrared only. | High-cost commercial satellite tasking ($500+ per image). | **Conditional STAC API ($\Delta\text{NBR}$).** Automated Sentinel-2 L2A querying at zero cost. |
| **Operating Cost** | Free, but unclassified and noisy. | $5,000–$50,000/month in licensing fees. | **$0.00 / Zero Cost.** Uses open-data feeds and lightweight CPU models (< 2 MB). |

---

## 3. System Architecture & The DuckDB Dual-Table Engine

### 3.1. The Pure DuckDB In-Process Storage Shift
Initially, the platform was architected using PostgreSQL 16 + TimescaleDB + PostGIS. While capable, PostgreSQL imposed severe overhead:
1. **Memory Drain:** Idling Postgres + TimescaleDB + PostGIS required **1.8 GB – 2.5 GB RAM**, exceeding free-tier cloud limits (512 MB – 1 GB).
2. **Storage Bloat:** Row-oriented tuples and uncompressed JSONB required **~350 bytes/record**, swelling 12.5M records to **> 3.2 GB**.
3. **Hosting Costs:** Required paying for managed PostgreSQL instances (RDS, Supabase, Neon) once compute limits were reached.

Agnikavach migrated completely to a **pure, in-process DuckDB columnar storage engine**:

| Architectural Dimension | Legacy PostgreSQL + TimescaleDB | Modern In-Process DuckDB | Strategic Gain |
| :--- | :--- | :--- | :--- |
| **Hosting Overhead** | Separate database container / cloud DB | Embedded directly in FastAPI process | **100% Serverless (Zero hosting fees)** |
| **RAM Footprint** | 1,800 MB – 2,500 MB RAM | 50 MB – 85 MB RAM | **> 96% Memory Reduction** |
| **Storage per Event** | ~350 bytes (row tuple + JSONB) | ~12–15 bytes (bitpacked columnar) | **> 95% Storage Reduction** |
| **12.5M Events Disk Size**| 3.2 GB – 4.5 GB | 120 MB – 180 MB (ZSTD compressed) | Runs on free ephemeral or persistent disks |
| **Spatial Matching** | `ST_DWithin` trigonometrical scan | `O(1)` integer H3 hash lookup (`UBIGINT`) | **~30x Faster Query Execution (< 1 ms)** |
| **Cold Start** | 10–20 seconds (container dependent)| Instantaneous (< 0.05 seconds) | Zero setup delay |

### 3.2. Dual-Table Columnar Schema
1. **`india_master_structures` (~12 MB for 541,180 nationwide cells):**
   - Contains India's complete national land-use coverage across all 28 states and union territories.
   - Primary Key: **64-bit unsigned integer H3 cell (`UBIGINT`)**, converting 15-character string indexes into compact integers via `int(h3_hex, 16)`.
   - Compact categorization using 1-byte ENUMs (`land_category`: Industry, Agriculture, Forest, Unclassified).
2. **`thermal_anomalies` (~100–180 MB for 12.5M time-series points):**
   - Append-only columnar time-series storing satellite detections.
   - Columnar downcasting: temperatures and FRP stored as 2-byte integers (`USMALLINT`), confidence as 1-byte integer (`UTINYINT`), classifications as 1-byte ENUMs (`hazard_class`).
   - Automated block-level **Zstandard (ZSTD) compression and bitpacking**.
3. **`review_queue`:**
   - Embedded analyst escalation queue for high-priority emergency alerts and ambiguous residual fires.

### 3.3. Multi-Layer Processing Pipeline
```
[ NASA FIRMS (VIIRS 375m / MODIS) ]       [ ISRO INSAT-3D/3DR (15-min) ]       [ Curated National Facilities ]
                 │                                        │                                       │
                 └────────────────────────┬───────────────┘                                       │
                                          ▼                                                       │
┌───────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ LAYER 1: MULTI-SOURCE INGESTION & GEOMETRIC NORMALIZATION                                     │ │
│ • 15-minute cadence polling via asynchronous worker (`Backend/tasks.py`)                       │ │
│ • Dynamic Elliptical Footprint Modeling (DEFM) correcting satellite scan/track swath distortion│ │
│ • Uber H3 Hexagonal Binning (Resolution 8/9, integer conversion to UBIGINT)                   │ │
│ • Primitive downcasting into DuckDB `thermal_anomalies` (~15 bytes/record)                    │ │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘ │
                                        ▼                                                         │
┌───────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ LAYER 2: KNOWN-EMITTER REGISTRY (KER) FAST-PATH MATCHING                                      │◄┘
│ • O(1) integer H3 disk lookup against `india_master_structures` (`Backend/pipeline.py`)        │
│ • Geodesic Haversine verification against strategic emitter perimeters (<= 3000m)             │
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
│ • LightGBM Multi-Class GBDT (`Backend/model.py`) with OpenMP acceleration                     │
│ • Features: Diurnal persistence, distance to industrial complexes, FRP Z-score, pixel area    │
│ • Target Classes: Agricultural Stubble, Forest Fire, Unmapped Industrial Accident             │
│ • Local TreeSHAP Engine: Generates exact percentage drivers for each classification (< 1 ms) │
└───────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 5: CONDITIONAL MULTI-TIER OPTICAL VERIFICATION                                          │
│ • Tier 1: Sentinel-2 L2A via Microsoft Planetary Computer STAC (Calculates ΔNBR burn scar)    │
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

This elliptical polygon is generated and stored in GeoJSON properties for accurate ground boundary intersection.

### 4.2. Dual-Band Planck Combustion Pyrometry (Dozier Inversion)
Biomass fires burn at smoldering temperatures ($600\text{ K} - 900\text{ K}$), whereas industrial gas flares and metallurgical processes burn at $1,200\text{ K} - 1,800\text{ K}$.

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

```text
SIH2026/
├── .env.example                # Zero-cost production environment configuration
├── .gitignore                  # Lean git ignore (excludes *.db, *.parquet, virtualenvs)
├── docker-compose.yml          # Dual-service: backend + redis_cache
├── README.md                   # Complete system documentation & deployment guide
├── spec.md                     # NTRO engineering specification
│
├── Backend/
│   ├── Dockerfile              # Multi-stage production container with OpenMP & dynamic port
│   ├── requirements.txt        # Lean Python dependencies (FastAPI, DuckDB, PyArrow, LightGBM)
│   ├── config.py               # Pydantic v2 settings, DuckDB path, Redis URL, FIRMS key
│   ├── database.py             # Embedded DuckDB storage engine manager & schema migrations
│   ├── seed.py                 # Self-contained national grid builder (541,180 cells in ~3.1s)
│   ├── curated_emitters.py     # 17 strategic national industrial complexes with baseline FRPs
│   ├── ingestion.py            # Layer 1: NASA FIRMS async ingest & H3 spatial indexer
│   ├── pipeline.py             # Layers 2, 3, 5: KER fastpath, Planck pyrometry, STAC verification
│   ├── model.py                # Layer 4: LightGBM residual classifier & TreeSHAP engine
│   ├── schemas.py              # Pydantic request/response schemas & GeoJSON models
│   ├── tasks.py                # Autonomous 15-minute background telemetry polling worker
│   ├── main.py                 # FastAPI application, WebSockets, REST endpoints, auto-bootstrap
│   └── artifacts/
│       └── residual_lgb_model.txt # Pre-compiled LightGBM model binary (< 2 MB)
│
├── Frontend/
│   ├── .env.example            # Frontend environment variables template
│   ├── package.json            # React 19, Vite 8, TailwindCSS, Three.js, React-Leaflet
│   ├── vite.config.js          # Vite build configuration
│   └── src/
│       ├── api.js              # API client supporting VITE_API_BASE_URL & WebSockets
│       ├── App.jsx             # Interactive 3D globe & NTRO map dashboard
│       └── components/         # LeafletMap, ThreatAnalysisPanel, ShapChart, HistoryChart
│
├── data/                       # Local database storage directory (gitignored)
│   └── india_geoai.db          # Embedded DuckDB database (populated on startup)
│
└── docs/
    └── FRONTEND_INTEGRATION.md # API specifications, GeoJSON schemas, and color codes
```

---

## 6. Quick Start: Local Execution & Verification

### Option A: Local Python Execution (Zero Docker)
```powershell
# 1. Setup environment
cp .env.example .env

# 2. Populate India's 541,180 national grid cells (takes ~3 seconds)
python Backend/seed.py

# 3. Start the API server
uvicorn Backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### Option B: Local Docker Compose
```powershell
# Start both Backend and Redis in background
docker compose up -d --build

# Verify health status
curl.exe http://localhost:8000/api/v1/health
```

---

## 7. API & GIS Streaming Reference

Interactive OpenAPI documentation is available at `http://127.0.0.1:8000/docs`.

### Key Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Diagnostic probe for DuckDB latency, master structures count, and Redis status. |
| `GET` | `/api/v1/gis/features` | **RFC 7946 Standard GeoJSON FeatureCollection** styled per NTRO color mandate. |
| `GET` | `/api/v1/incidents` | Paginated thermal incidents with AI classifications and TreeSHAP attribution. |
| `GET` | `/api/v1/reviews` | Human-in-the-Loop triage queue with optical burn-scar verification status. |
| `WS` | `/api/v1/ws/alerts` | Real-time WebSocket streaming feed broadcasting new telemetry batches. |
| `POST` | `/api/v1/admin/bootstrap` | Triggers national grid database population/re-indexing remotely on cloud. |
| `POST` | `/api/v1/telemetry/ingest` | Manually triggers satellite pass ingest from NASA FIRMS. |
| `POST` | `/api/v1/pipeline/run-deterministic`| Manually executes multi-layer classification on unclassified incidents. |

---

## 8. Zero-Cost Cloud Deployment: HuggingFace + Render + Vercel Stack

The entire architecture is designed to run in production with **$0.00 monthly cost** using the following specialized multi-cloud combo:

```mermaid
graph TD
    User([End User / Operator]) --> Vercel[Frontend on Vercel: Global Edge CDN]
    Vercel -- HTTP & WebSockets --> HF[Backend on Hugging Face Spaces: 16GB RAM Docker]
    Vercel -. Fallback .- Render[Backup Backend on Render: Web Service]
    HF --> DuckDB[Embedded DuckDB File: 50GB Persistent Storage]
    HF --> Upstash[Upstash Serverless Redis: Free 10k cmds/day]
    HF --> NASA[NASA FIRMS Live API: 15-min Polling]
    HF --> STAC[Planetary Computer STAC: Sentinel-2 L2A]
```

---

### Step 1: Deploy Backend & ML Pipeline on Hugging Face Spaces (Primary)
**Why Hugging Face?** Hugging Face provides **16 GB RAM, 2 vCPUs, and 50 GB persistent disk space for 100% free forever** with zero sleep timeouts on Docker spaces. This is ideal for running the in-process DuckDB engine and continuous 15-minute satellite polling.

1. Create a free account at [Hugging Face](https://huggingface.co).
2. Go to **Spaces** $\to$ Click **Create new Space**.
3. Space configuration:
   - **Space Name:** `agnikavach-api`
   - **Space SDK:** Select **Docker** (Blank).
   - **Space Hardware:** Free (2 vCPU, 16 GB RAM).
4. Connect your GitHub repository or push directly to the Hugging Face Git remote.
5. Under **Settings** $\to$ **Variables and secrets**, add:
   ```env
   FIRMS_MAP_KEY = <your_nasa_firms_map_key>
   STORAGE_ENGINE = duckdb
   DUCKDB_PATH = data/india_geoai.db
   REDIS_URL = <your_upstash_redis_url>
   ```
6. Hugging Face automatically detects `Backend/Dockerfile`, builds the image with OpenMP, boots FastAPI, and generates your public HTTPS endpoint:
   `https://<your-username>-agnikavach-api.hf.space`

---

### Step 2: Deploy Backup Backend on Render.com (Secondary / Redundant)
**Why Render?** Provides a free Docker web service (512 MB RAM, 0.1 vCPU).
1. Go to [Render.com](https://render.com) $\to$ **New Web Service** $\to$ Connect your GitHub repo.
2. Settings:
   - **Environment:** Docker
   - **Docker Context Directory:** `./Backend`
   - **DockerfilePath:** `./Backend/Dockerfile`
3. Environment Variables:
   - `FIRMS_MAP_KEY`: your NASA FIRMS key
   - `REDIS_URL`: Upstash connection string
   - `STORAGE_ENGINE`: `duckdb`
4. Click **Deploy**. Render automatically spins up the service, connects DuckDB, and performs health checks on `/api/v1/health`.

---

### Step 3: Setup Free Cloud Redis (Upstash)
To enable real-time WebSockets and cross-worker caching on serverless cloud:
1. Create a free account at [Upstash](https://upstash.com).
2. Click **Create Database** $\to$ Select Redis (Serverless).
3. Free Tier provides **10,000 requests/day free forever** (no credit card required).
4. Copy the `rediss://default:xxxx@xxxx.upstash.io:6379` TLS connection URL.
5. Paste it as `REDIS_URL` in your Hugging Face and Render dashboards.

---

### Step 4: Deploy Frontend on Vercel
**Why Vercel?** The React 19 + Vite 8 frontend is a pure static Single Page Application (SPA). Vercel provides **unlimited bandwidth, global edge CDN distribution, and sub-second page loads for 100% free**.

1. Go to [Vercel](https://vercel.com) $\to$ **Add New Project** $\to$ Import your GitHub repository.
2. Configure project settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** `Frontend`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add Environment Variables:
   ```env
   VITE_API_BASE_URL = https://<your-hf-or-render-domain>/api/v1
   VITE_WS_ALERTS_URL = wss://<your-hf-or-render-domain>/api/v1/ws/alerts
   ```
4. Click **Deploy**. Your GIS dashboard will be live within 30 seconds with automated CI/CD on every git commit.

---

## 9. Database Hosting & Storage Architecture

### Where is the Database Hosted?
Because Agnikavach utilizes an **in-process, columnar DuckDB engine**, there is **no external database server to host or pay for** (no AWS RDS, no Supabase, no CockroachDB). 

The entire database exists as a single high-performance file:
```
data/india_geoai.db
```

#### How Database Persistence & Cloud Hosting Work:
1. **On Hugging Face Spaces:**
   - Hugging Face Spaces provides **50 GB of persistent storage** for Docker spaces.
   - The database file is written directly to `/app/data/india_geoai.db`, persisting continuously across application restarts.
2. **On Render / Container Hosts with Ephemeral Disks:**
   - On ephemeral containers, if a new instance boots up with an empty disk, **Agnikavach automatically detects cold start in `Backend/main.py`**.
   - It invokes `Backend/seed.py` in the background.
   - In **~3.1 seconds**, the complete Indian national grid (541,180 cells) and all 17 strategic industrial complexes are regenerated in-memory via PyArrow and saved to DuckDB.
   - This provides **instant self-healing persistence** without requiring expensive persistent cloud disk subscriptions.
3. **On-Demand Remote Population**:
   - You can trigger a full database regeneration or re-index on your cloud server anytime via:
     ```bash
     curl -X POST "https://<your-backend-domain>/api/v1/admin/bootstrap?force=true" \
       -H "X-Admin-Key: <your_admin_api_key>"
     ```

### Zero-Cost Stack Summary

| Layer | Platform | Free Tier Resource Allocation | Monthly Cost |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | **Vercel** | Unlimited Bandwidth, Global Edge CDN, SSL | **$0.00** |
| **Backend & ML** | **Hugging Face Spaces** | 16 GB RAM, 2 vCPUs, 50 GB Persistent Disk | **$0.00** |
| **Backup Backend** | **Render.com** | 512 MB RAM, 0.1 vCPU, Automated HTTPS | **$0.00** |
| **Storage Engine** | **In-Process DuckDB** | Embedded within container, zero external DB | **$0.00** |
| **Pub/Sub Cache** | **Upstash Redis** | 10,000 Commands/day, Serverless TLS Redis | **$0.00** |
| **Telemetry Feed** | **NASA FIRMS** | Free Open Satellite Data Stream (VIIRS/MODIS) | **$0.00** |
| **Optical Verify** | **Planetary Computer** | Free Open Sentinel-2 L2A STAC API | **$0.00** |
| **TOTAL** | | | **$0.00 / mo** |
