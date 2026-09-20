// Demo telemetry, shaped exactly like RFC 7946 features from GET /api/v1/gis/features
// (FRONTEND_INTEGRATION.md §3A) so the UI exercises the real contract. Used only when
// the backend returns nothing, and only in dev — see api.js.
//
// Plain literal with no top-level computation so bundlers drop it from production.

// Square-ish sensor swath around a point, in GeoJSON [lon, lat] order.
const swath = (lon, lat, d) => ({
  type: 'Polygon',
  coordinates: [[
    [lon - d, lat - d * 0.7], [lon + d, lat - d * 0.7],
    [lon + d * 1.2, lat + d * 0.7], [lon - d * 0.8, lat + d * 0.7],
    [lon - d, lat - d * 0.7],
  ]],
});

const feature = (id, lon, lat, props) => ({
  type: 'Feature',
  id,
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { ...props, footprint_polygon: swath(lon, lat, 0.018), isMock: true },
});

export const MOCK_FEATURES = [
  /* @__PURE__ */ feature('mk-ifa-1', 69.8597, 22.3419, {
    detected_at: '2026-09-19T07:33:00+00:00', classification: 'INDUSTRIAL_FIRE_ALERT',
    classification_confidence: 0.97, is_industrial: true, frp_mw: 238.4, brightness_k: 412.6,
    satellite: 'VIIRS (Suomi-NPP)', h3_index: '884249d659fffff', marker_color: '#E63946',
    emitter_id: 'KER-JAM-004', distance_to_emitter_meters: 210.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 0.21, impact_pct: 51.2, direction: 'positive' },
      frp_z_score: { value: 3.84, impact_pct: 28.9, direction: 'positive' },
      brightness_mir: { value: 412.6, impact_pct: 12.4, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-ifa-2', 72.8311, 18.9582, {
    detected_at: '2026-09-19T06:58:00+00:00', classification: 'INDUSTRIAL_FIRE_ALERT',
    classification_confidence: 0.89, is_industrial: true, frp_mw: 154.7, brightness_k: 389.1,
    satellite: 'VIIRS (NOAA-20)', h3_index: '8860e1d2b1fffff', marker_color: '#E63946',
    emitter_id: 'KER-MUM-011', distance_to_emitter_meters: 430.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 0.43, impact_pct: 46.1, direction: 'positive' },
      frp_z_score: { value: 2.61, impact_pct: 24.8, direction: 'positive' },
      brightness_mir: { value: 389.1, impact_pct: 15.2, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-uia-1', 85.1018, 20.84, {
    detected_at: '2026-09-19T05:41:00+00:00', classification: 'UNMAPPED_INDUSTRIAL_ACCIDENT',
    classification_confidence: 0.62, is_industrial: true, frp_mw: 118.2, brightness_k: 371.5,
    satellite: 'VIIRS (Suomi-NPP)', h3_index: '883ca9c91bfffff', marker_color: '#D62828',
    emitter_id: null, distance_to_emitter_meters: 14820.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 14.82, impact_pct: 38.7, direction: 'negative' },
      frp_z_score: { value: 2.05, impact_pct: 31.4, direction: 'positive' },
      brightness_mir: { value: 371.5, impact_pct: 18.6, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-pis-1', 81.4285, 21.209, {
    detected_at: '2026-09-19T07:12:00+00:00', classification: 'PERSISTENT_INDUSTRIAL_SOURCE',
    classification_confidence: 0.98, is_industrial: true, frp_mw: 72.9, brightness_k: 358.2,
    satellite: 'VIIRS', h3_index: '883ca1180bfffff', marker_color: '#7209B7',
    emitter_id: 'KER-BHI-002', distance_to_emitter_meters: 95.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 0.1, impact_pct: 62.3, direction: 'positive' },
      frp_z_score: { value: 0.42, impact_pct: 19.1, direction: 'positive' },
      brightness_mir: { value: 358.2, impact_pct: 7.8, direction: 'negative' },
    },
  }),
  /* @__PURE__ */ feature('mk-pis-2', 6.7623, 51.4344, {
    detected_at: '2026-09-18T22:04:00+00:00', classification: 'PERSISTENT_INDUSTRIAL_SOURCE',
    classification_confidence: 0.95, is_industrial: true, frp_mw: 134.0, brightness_k: 366.9,
    satellite: 'VIIRS (NOAA-21)', h3_index: '881f1d4949fffff', marker_color: '#7209B7',
    emitter_id: 'KER-DUI-001', distance_to_emitter_meters: 160.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 0.16, impact_pct: 58.0, direction: 'positive' },
      frp_z_score: { value: 1.12, impact_pct: 22.4, direction: 'positive' },
      brightness_mir: { value: 366.9, impact_pct: 9.3, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-rgf-1', 47.25, 30.0333, {
    detected_at: '2026-09-19T04:22:00+00:00', classification: 'ROUTINE_GAS_FLARE',
    classification_confidence: 0.93, is_industrial: true, frp_mw: 201.6, brightness_k: 1284.0,
    satellite: 'VIIRS (Suomi-NPP)', h3_index: '8839a0d5b7fffff', marker_color: '#F77F00',
    emitter_id: 'KER-RUM-007', distance_to_emitter_meters: 78.0,
    shap_attribution: {
      brightness_mir: { value: 1284.0, impact_pct: 55.7, direction: 'positive' },
      distance_to_industrial_km: { value: 0.08, impact_pct: 29.2, direction: 'positive' },
      frp_z_score: { value: 3.1, impact_pct: 11.4, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-rgf-2', 7.1667, 4.4333, {
    detected_at: '2026-09-18T19:15:00+00:00', classification: 'ROUTINE_GAS_FLARE',
    classification_confidence: 0.84, is_industrial: true, frp_mw: 88.3, brightness_k: 1211.4,
    satellite: 'MODIS (Terra)', h3_index: '8859b2c4a5fffff', marker_color: '#F77F00',
    emitter_id: 'KER-BON-003', distance_to_emitter_meters: 140.0,
    shap_attribution: {
      brightness_mir: { value: 1211.4, impact_pct: 49.8, direction: 'positive' },
      distance_to_industrial_km: { value: 0.14, impact_pct: 26.6, direction: 'positive' },
      frp_z_score: { value: 1.77, impact_pct: 13.9, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-asf-1', 74.7222, 30.9971, {
    detected_at: '2026-09-19T07:37:00+00:00', classification: 'AGRICULTURAL_STUBBLE_FIRE',
    classification_confidence: 1.0, is_industrial: false, frp_mw: 2.42, brightness_k: 337.86,
    satellite: 'VIIRS (Suomi-NPP)', h3_index: '884249d659fffff', marker_color: '#FCBF49',
    emitter_id: null, distance_to_emitter_meters: 37850.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 37.85, impact_pct: 44.6, direction: 'positive' },
      frp_z_score: { value: -0.68, impact_pct: 21.7, direction: 'positive' },
      brightness_mir: { value: 330.04, impact_pct: 8.1, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-asf-2', 76.3869, 30.3398, {
    detected_at: '2026-09-19T07:35:00+00:00', classification: 'AGRICULTURAL_STUBBLE_FIRE',
    classification_confidence: 0.96, is_industrial: false, frp_mw: 5.81, brightness_k: 341.2,
    satellite: 'VIIRS (NOAA-20)', h3_index: '8841a7192bfffff', marker_color: '#FCBF49',
    emitter_id: null, distance_to_emitter_meters: 28430.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 28.43, impact_pct: 41.2, direction: 'positive' },
      frp_z_score: { value: -0.41, impact_pct: 24.0, direction: 'positive' },
      brightness_mir: { value: 341.2, impact_pct: 9.7, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-wff-1', 76.6333, 11.6854, {
    detected_at: '2026-09-18T08:19:00+00:00', classification: 'WILDFIRE_FOREST_FIRE',
    classification_confidence: 0.94, is_industrial: false, frp_mw: 121.4, brightness_k: 364.7,
    satellite: 'VIIRS (Suomi-NPP)', h3_index: '8861a4d21dfffff', marker_color: '#2A9D8F',
    emitter_id: null, distance_to_emitter_meters: 61200.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 61.2, impact_pct: 52.9, direction: 'positive' },
      frp_z_score: { value: 1.94, impact_pct: 20.3, direction: 'positive' },
      brightness_mir: { value: 364.7, impact_pct: 10.1, direction: 'negative' },
    },
  }),
  /* @__PURE__ */ feature('mk-wff-2', 79.4542, 29.3919, {
    detected_at: '2026-09-18T08:02:00+00:00', classification: 'WILDFIRE_FOREST_FIRE',
    classification_confidence: 0.88, is_industrial: false, frp_mw: 64.2, brightness_k: 352.1,
    satellite: 'VIIRS (NOAA-20)', h3_index: '8843a12c17fffff', marker_color: '#2A9D8F',
    emitter_id: null, distance_to_emitter_meters: 44100.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 44.1, impact_pct: 48.4, direction: 'positive' },
      frp_z_score: { value: 1.21, impact_pct: 23.7, direction: 'positive' },
      brightness_mir: { value: 352.1, impact_pct: 11.6, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-wff-3', 145.3333, -37.5167, {
    detected_at: '2026-09-17T14:48:00+00:00', classification: 'WILDFIRE_FOREST_FIRE',
    classification_confidence: 0.96, is_industrial: false, frp_mw: 203.9, brightness_k: 378.4,
    satellite: 'VIIRS (NOAA-21)', h3_index: '88be8d2a03fffff', marker_color: '#2A9D8F',
    emitter_id: null, distance_to_emitter_meters: 88300.0,
    shap_attribution: {
      distance_to_industrial_km: { value: 88.3, impact_pct: 57.1, direction: 'positive' },
      frp_z_score: { value: 3.02, impact_pct: 26.5, direction: 'positive' },
      brightness_mir: { value: 378.4, impact_pct: 8.4, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-fpg-1', 69.8597, 23.7337, {
    detected_at: '2026-09-19T06:11:00+00:00', classification: 'FALSE_POSITIVE_GLINT',
    classification_confidence: 0.71, is_industrial: false, frp_mw: 1.14, brightness_k: 309.8,
    satellite: 'MODIS (Terra)', h3_index: '8841c8b5a1fffff', marker_color: '#A8DADC',
    emitter_id: null, distance_to_emitter_meters: 51200.0,
    shap_attribution: {
      brightness_mir: { value: 309.8, impact_pct: 61.5, direction: 'negative' },
      frp_z_score: { value: -1.42, impact_pct: 24.8, direction: 'negative' },
      distance_to_industrial_km: { value: 51.2, impact_pct: 6.2, direction: 'positive' },
    },
  }),
  /* @__PURE__ */ feature('mk-unc-1', 82.7501, 22.3595, {
    detected_at: '2026-09-19T07:50:00+00:00', classification: 'unclassified',
    classification_confidence: null, is_industrial: false, frp_mw: 18.6, brightness_k: 344.0,
    satellite: 'VIIRS (Suomi-NPP)', h3_index: '883ca8e2c9fffff', marker_color: '#6C757D',
    emitter_id: null, distance_to_emitter_meters: 9240.0,
    shap_attribution: null,
  }),
  /* @__PURE__ */ feature('mk-unc-2', 89.1833, 21.9497, {
    detected_at: '2026-09-19T07:44:00+00:00', classification: 'unclassified',
    classification_confidence: null, is_industrial: false, frp_mw: 52.3, brightness_k: 349.7,
    satellite: 'VIIRS (NOAA-20)', h3_index: '883d20b4c5fffff', marker_color: '#6C757D',
    emitter_id: null, distance_to_emitter_meters: 17600.0,
    shap_attribution: null,
  }),
];
