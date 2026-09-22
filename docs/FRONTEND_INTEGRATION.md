# Frontend Developer Integration Guide (Agnikavach / GeoAI)

This document contains everything a frontend developer needs to build, connect, and style the GIS dashboard for **Agnikavach** (Problem Statement SIH26162 - NTRO).

---

## 1. Simple 1-Line Data Flow

> **Raw Satellite Thermal Hotspots (NASA FIRMS)** ➔ **Normalized with DEFM & Hex-Binned (H3)** ➔ **Filtered via Known Facilities (KER) & Planck Physics** ➔ **Classified via LightGBM + TreeSHAP** ➔ **Delivered via standard GeoJSON REST & Real-Time WebSockets to the Frontend.**

---

## 2. Server Base URLs & CORS

- **Local Backend Base URL:** `http://127.0.0.1:8000`
- **Interactive Swagger Docs:** `http://127.0.0.1:8000/docs`
- **Real-Time WebSocket URL:** `ws://127.0.0.1:8000/api/v1/ws/alerts`
- **Configured CORS Origins:** `http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`

---

## 3. Primary API Endpoints for Frontend

### A. GIS Map Feed: Standard RFC 7946 GeoJSON
- **Endpoint:** `GET /api/v1/gis/features`
- **Usage:** Feed directly into MapLibre GL, Leaflet (`L.geoJSON`), React-Leaflet, or Mapbox.
- **Query Parameters:**
  - `limit` (int, default: 100) — Max features to return.
  - `classification` (string, optional) — Filter by specific class name.
  - `is_industrial` (bool, optional) — Filter only industrial events (`true` / `false`).

#### Response Format:
```json
{
  "type": "FeatureCollection",
  "name": "GeoAI_Thermal_Anomalies",
  "crs": {
    "type": "name",
    "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" }
  },
  "features": [
    {
      "type": "Feature",
      "id": "da3ca499-3d79-4a14-855e-e9e492722607",
      "geometry": {
        "type": "Point",
        "coordinates": [74.72215, 30.99714] // [longitude, latitude] per RFC 7946
      },
      "properties": {
        "detected_at": "2026-09-18T07:37:00+00:00",
        "classification": "AGRICULTURAL_STUBBLE_FIRE",
        "classification_confidence": 1.0,
        "is_industrial": false,
        "frp_mw": 2.42,
        "brightness_k": 337.86,
        "satellite": "VIIRS (Suomi-NPP)",
        "h3_index": "884249d659fffff",
        "marker_color": "#FCBF49",
        "emitter_id": null,
        "distance_to_emitter_meters": 37850.0,
        "shap_attribution": {
          "distance_to_industrial_km": { "value": 37.85, "impact_pct": 44.6, "direction": "positive" },
          "frp_z_score": { "value": -0.68, "impact_pct": 21.7, "direction": "positive" },
          "brightness_mir": { "value": 330.04, "impact_pct": 8.1, "direction": "positive" }
        },
        "verification": null,
        "footprint_polygon": {
          "type": "Polygon",
          "coordinates": [[[74.7239, 30.9971], [74.7238, 30.9980], ...]]
        }
      }
    }
  ]
}
```

---

### B. Thermal Incidents Tabular / Paginated Feed
- **Endpoint:** `GET /api/v1/incidents`
- **Usage:** Used for sidebar tables, search filters, analytics cards, and time-range scrubbing.
- **Query Parameters:**
  - `limit` (int, default: 50)
  - `classification` (string, optional)

#### Response Format:
```json
{
  "total": 46,
  "items": [
    {
      "id": "237662-864054-...",
      "detected_at": "2026-09-18T07:33:00+00:00",
      "latitude": 23.7662,
      "longitude": 86.4054,
      "h3_index": "883ca9c91bfffff",
      "brightness": 340.83,
      "frp": 7.33,
      "satellite": "VIIRS",
      "confidence": "nominal",
      "classification": "PERSISTENT_INDUSTRIAL_SOURCE",
      "classification_confidence": 0.98,
      "is_industrial": true,
      "pipeline_stage": "LAYER_2_KER_FASTPATH",
      "shap_attribution": null
    }
  ]
}
```

---

### C. Human-in-the-Loop (HITL) Review Queue
- **Endpoint:** `GET /api/v1/reviews`
- **Usage:** Displays the emergency escalation triage desk for analyst manual verification.
- **Query Parameters:** `status_filter` (`"pending"` / `"under_review"` / `"verified_industrial"`), `limit` (default: 50).

#### Response Format:
```json
{
  "total": 5,
  "items": [
    {
      "id": "e63b-...",
      "incident_id": "237120-864501-...",
      "incident_detected_at": "2026-09-18T07:33:00+00:00",
      "status": "pending",
      "priority": "high",
      "ai_classification": "UNMAPPED_INDUSTRIAL_ACCIDENT",
      "ai_confidence": 0.62,
      "reviewer_notes": "Layer 4 ML routed to HITL: Class=UNMAPPED_INDUSTRIAL_ACCIDENT, Conf=0.62. Layer 5 Verification: Tier=TIER_1_SENTINEL2_STAC, Status=NO_SURFACE_SCAR",
      "created_at": "2026-09-19T05:43:22+00:00"
    }
  ]
}
```

---

### D. Real-Time Streaming WebSocket
- **Endpoint:** `ws://127.0.0.1:8000/api/v1/ws/alerts`
- **Usage:** Keep open in React (`useEffect`). When satellite passes are processed, new alerts pop up without page refresh.
- **Initial Connection Message:**
  ```json
  {
    "event": "connected",
    "timestamp": "2026-09-19T17:00:00Z",
    "message": "Connected to GeoAI real-time fire telemetry stream."
  }
  ```
- **New Satellite Telemetry Broadcast Message:**
  ```json
  {
    "event": "new_telemetry_batch",
    "timestamp": "2026-09-19T17:15:00Z",
    "inserted_count": 42,
    "pipeline_breakdown": {
      "PERSISTENT_INDUSTRIAL_SOURCE": 4,
      "AGRICULTURAL_STUBBLE_FIRE": 12,
      "WILDFIRE_FOREST_FIRE": 24,
      "UNMAPPED_INDUSTRIAL_ACCIDENT": 2
    }
  }
  ```
- **Keep-Alive Ping:** Client can send raw string `"ping"`, server immediately returns `"pong"`.

---

## 4. UI Color Palette & Map Marker Styling (NTRO Standard)

The backend provides pre-assigned hex codes in `properties.marker_color`. The frontend should use these colors across all charts, badges, and map markers:

| Classification | Hex Code | Color Name | Meaning / Visual Priority |
| :--- | :--- | :--- | :--- |
| `INDUSTRIAL_FIRE_ALERT` | `#E63946` | Crimson Red | **Critical Disaster Alert:** Thermal explosion inside refinery/chemical complex |
| `UNMAPPED_INDUSTRIAL_ACCIDENT` | `#D62828` | Deep Red | **Emergency Warning:** Massive heat surge in unmapped industrial area |
| `PERSISTENT_INDUSTRIAL_SOURCE` | `#7209B7` | Purple | **Routine Industry:** Regulated flare stack / blast furnace (not a disaster) |
| `ROUTINE_GAS_FLARE` | `#F77F00` | Orange | **Hydrocarbon Flare:** Confirmed high-temp flaring ($T > 1200\text{ K}$) |
| `AGRICULTURAL_STUBBLE_FIRE` | `#FCBF49` | Yellow | **Crop Stubble:** Farm biomass burn (Punjab/Haryana season) |
| `WILDFIRE_FOREST_FIRE` | `#2A9D8F` | Teal / Green | **Vegetation:** Forest / wildland fire |
| `FALSE_POSITIVE_GLINT` | `#A8DADC` | Pale Blue | **Noise:** Solar panel / water reflection (Filtered out) |
| `unclassified` | `#6C757D` | Gray | Pending processing |

---

## 5. What Each Property Means (For Tooltips & Popups)

When a user clicks a fire pin on the map, render a popup or side drawer with these details:

1. **`classification`** (Title): e.g., *"Agricultural Stubble Fire"*.
2. **`classification_confidence`** (Badge): e.g., `98.0%`.
3. **`frp_mw`** (Metric): Fire Radiative Power in Megawatts (indicates combustion intensity).
4. **`brightness_k`** (Metric): Mid-Infrared Brightness Temperature in Kelvin ($300\text{ K} \approx 27^\circ\text{C}$; $450\text{ K} \approx 177^\circ\text{C}$).
5. **`h3_index`** (Cell ID): Uber H3 hexagon spatial address (e.g., `884249d659fffff`).
6. **`shap_attribution`** (Explainable AI Drawer):
   - Renders a horizontal bar chart showing *why* the AI made this decision:
     - `distance_to_industrial_km` (+44.6% impact)
     - `frp_z_score` (+21.7% impact)
     - `brightness_mir` (+8.1% impact)
7. **`footprint_polygon`** (Dynamic Sensor Footprint):
   - A GeoJSON Polygon showing the actual ground swath ellipse of the satellite sensor pixel (DEFM model). You can draw this directly on Leaflet/MapLibre as a transparent polygon around the center pin.

---

## 6. Database / Backend Architecture Quick Sheet (For Full Context)

- **Primary Storage Engine:** **DuckDB (Embedded In-Process Columnar Storage)**
  - Zero-cost, zero-server architecture: No Docker PostgreSQL required to run the frontend against the backend!
  - Sub-millisecond query response latencies (< 15 ms total REST roundtrip).
  - High-performance ZSTD columnar compression storing nationwide thermal telemetry in under 180 MB.
- **Dual-Table Columnar Schema:**
  - `india_master_structures`: Baseline land-use and facility records (~700k features) indexed by 64-bit unsigned integer H3 keys (`UBIGINT`).
  - `thermal_anomalies`: Downcasted integer-compressed time-series of satellite thermal anomalies, updated continuously.
  - `review_queue`: Human-in-the-Loop triage queue for analyst verification.
- **Storage Engine Migration:** The platform has transitioned completely from PostgreSQL/PostGIS to embedded DuckDB (`data/india_geoai.db`). No separate database container or external PostgreSQL daemon is required.
- **Frontend Impact:** **Zero.** All API contracts (`/api/v1/gis/features`, `/api/v1/incidents`, `/api/v1/reviews`, `/api/v1/ws/alerts`) remain 100% identical and RFC 7946 compliant. Coordinates, property keys, color mappings, and TreeSHAP vectors are unchanged.
- **Refresh Cadence:** Background polling worker auto-fetches NASA FIRMS feeds every 15 minutes. Data is automatically preserved in `thermal_anomalies` for historical time-lapse analytics.
