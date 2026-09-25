import { metaFor } from "./classifications";

// Contract: FRONTEND_INTEGRATION.md
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api/v1";

// RFC 7946 Feature -> the flat shape the UI renders.
export const normalizeFeature = (feature, idx = 0) => {
  const props = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [0, 0]; // GeoJSON is [lon, lat]
  const key = props.classification || "unclassified";
  const meta = metaFor(key);

  return {
    id: feature.id || `feature_${idx}`,
    classification: key,
    classificationLabel: meta.label,
    priority: meta.priority,
    // Backend assigns the NTRO colour; fall back to the local table.
    color: props.marker_color || meta.color,
    lat,
    lng,
    frp_mw: props.frp_mw ?? null,
    brightness_k: props.brightness_k ?? null,
    confidence: props.classification_confidence ?? null,
    detected_at: props.detected_at || null,
    h3_index: props.h3_index || null,
    satellite: props.satellite || null,
    is_industrial: Boolean(props.is_industrial),
    emitter_id: props.emitter_id ?? null,
    emitter_name: props.emitter_name ?? null,
    distance_to_emitter_m: props.distance_to_emitter_meters ?? null,
    shap: props.shap_attribution || null,
    footprint: props.footprint_polygon || null,
    verification: props.verification ?? null,
  };
};

export const fetchHealthStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    return await res.json();
  } catch (err) {
    console.error("Error fetching health status:", err);
    return null;
  }
};

// GET /api/v1/gis/features — the map feed.
export const fetchGisFeatures = async ({ limit = 500, classification, isIndustrial } = {}) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (classification) params.set("classification", classification);
  if (isIndustrial !== undefined) params.set("is_industrial", String(isIndustrial));

  try {
    const res = await fetch(`${API_BASE_URL}/gis/features?${params}`);
    if (!res.ok) throw new Error(`gis/features responded ${res.status}`);

    const geojson = await res.json();
    const features = Array.isArray(geojson.features) ? geojson.features : [];
    return features.map(normalizeFeature);
  } catch (err) {
    console.error("Error fetching GIS features:", err);
    return [];
  }
};

// GET /api/v1/incidents — tabular feed. `confidence` here is a string label
// ("nominal"/"high"); the numeric score is classification_confidence.
export const fetchIncidents = async ({ limit = 50, classification } = {}) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (classification) params.set("classification", classification);

  try {
    const res = await fetch(`${API_BASE_URL}/incidents?${params}`);
    const data = await res.json();
    return { total: data.total ?? 0, items: data.items ?? [] };
  } catch (err) {
    console.error("Error fetching incidents:", err);
    return { total: 0, items: [] };
  }
};

// GET /api/v1/reviews — human-in-the-loop triage queue.
export const fetchReviews = async ({ statusFilter = "pending", limit = 50 } = {}) => {
  const params = new URLSearchParams({ status_filter: statusFilter, limit: String(limit) });

  try {
    const res = await fetch(`${API_BASE_URL}/reviews?${params}`);
    const data = await res.json();
    return { total: data.total ?? 0, items: data.items ?? [] };
  } catch (err) {
    console.error("Error fetching reviews:", err);
    return { total: 0, items: [] };
  }
};

// GET /api/v1/gis/history — daily NASA FIRMS detections around a point.
// Throws so the caller can tell "no history" apart from "request failed".
export const fetchLocationHistory = async (lat, lng, { days = 30, signal } = {}) => {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), days: String(days) });
  const res = await fetch(`${API_BASE_URL}/gis/history?${params}`, { signal });
  if (!res.ok) throw new Error(`gis/history responded ${res.status}`);
  return res.json();
};

export const fetchNearPoints = async (lat, lng) => {
  const features = await fetchGisFeatures({ limit: 200 });
  return {
    points: features
      .map((pt) => ({ ...pt, distance_km: calculateDistance(lat, lng, pt.lat, pt.lng) }))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 5),
  };
};

// Haversine great-circle distance in kilometres
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
