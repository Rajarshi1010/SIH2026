/**
 * AGNIKAVACH â€” Mock Impact Asset Data
 *
 * Generates deterministic, spatially-coherent infrastructure assets
 * positioned relative to a selected threat point.
 *
 * âš  PROTOTYPE DATA â€” Not authoritative emergency infrastructure.
 * These positions are simulated for demonstration purposes only.
 */

// Simple deterministic hash from a string/number seed
function hashSeed(lat, lng) {
  const str = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Deterministic pseudo-random number generator (Mulberry32)
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ASSET_TYPES = [
  { type: 'hospital', label: 'Hospital', icon: 'ðŸ¥' },
  { type: 'school', label: 'School', icon: 'ðŸ«' },
  { type: 'fire_station', label: 'Fire Station', icon: 'ðŸš’' },
  { type: 'industry', label: 'Industrial Facility', icon: 'ðŸ­' },
  { type: 'power', label: 'Power Infrastructure', icon: 'âš¡' },
  { type: 'settlement', label: 'Settlement', icon: 'ðŸ‘¥' },
];

const ASSET_NAMES = {
  hospital: [
    'District General Hospital', 'Community Health Center', 'Regional Medical Center',
    'Primary Health Unit', 'Emergency Care Facility', 'Rural Health Clinic',
    'Civil Hospital', 'Trauma Center'
  ],
  school: [
    'Government Primary School', 'Central High School', 'District Public School',
    'Village Elementary', 'Regional Academy', 'Township School',
    'Junior College', 'Technical Institute', 'Community Learning Center'
  ],
  fire_station: [
    'Central Fire Station', 'District Fire Brigade', 'Emergency Response Unit',
    'Rural Fire Post', 'Fire & Rescue HQ'
  ],
  industry: [
    'Steel Processing Plant', 'Chemical Works', 'Textile Factory',
    'Cement Plant', 'Agricultural Processing', 'Timber Mill',
    'Mining Operations', 'Refinery Complex', 'Manufacturing Unit'
  ],
  power: [
    'Power Substation', 'Solar Farm', 'Wind Turbine Array',
    'Transmission Tower', 'Diesel Generator Plant', 'Micro-Grid Hub'
  ],
  settlement: [
    'Village Cluster', 'Township Area', 'Rural Settlement',
    'Residential Colony', 'Agricultural Community', 'Hamlet',
    'Market Town', 'District Hub'
  ],
};

/**
 * 1 degree of latitude â‰ˆ 111 km
 * 1 degree of longitude â‰ˆ 111 * cos(lat) km
 */
function kmToDegreeLat(km) {
  return km / 111.0;
}
function kmToDegreeLng(km, lat) {
  return km / (111.0 * Math.cos((lat * Math.PI) / 180));
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Generate deterministic mock assets around a threat point.
 * Returns assets within 12km max (so 10km filter still has items).
 *
 * @param {number} threatLat
 * @param {number} threatLng
 * @returns {Array} Array of asset objects
 */
export function generateMockAssets(threatLat, threatLng) {
  const seed = hashSeed(threatLat, threatLng);
  const rng = mulberry32(seed);

  const assets = [];
  let idCounter = 1;

  // Distribution: more assets further out (realistic spatial density)
  // 0-1km: ~3 assets, 1-5km: ~12 assets, 5-10km: ~18 assets
  const rings = [
    { minKm: 0.2, maxKm: 1.0, count: 3 },
    { minKm: 1.0, maxKm: 5.0, count: 12 },
    { minKm: 5.0, maxKm: 10.5, count: 18 },
  ];

  rings.forEach((ring) => {
    for (let i = 0; i < ring.count; i++) {
      // Random angle in radians
      const angle = rng() * 2 * Math.PI;
      // Random distance within the ring
      const dist = ring.minKm + rng() * (ring.maxKm - ring.minKm);

      const offsetLat = kmToDegreeLat(dist * Math.cos(angle));
      const offsetLng = kmToDegreeLng(dist * Math.sin(angle), threatLat);

      const assetLat = threatLat + offsetLat;
      const assetLng = threatLng + offsetLng;

      // Pick asset type deterministically
      const typeIndex = Math.floor(rng() * ASSET_TYPES.length);
      const assetType = ASSET_TYPES[typeIndex];

      // Pick name deterministically
      const names = ASSET_NAMES[assetType.type];
      const nameIndex = Math.floor(rng() * names.length);

      const distanceKm = haversineDistance(threatLat, threatLng, assetLat, assetLng);

      assets.push({
        id: `asset_${idCounter++}`,
        name: names[nameIndex],
        type: assetType.type,
        label: assetType.label,
        icon: assetType.icon,
        lat: assetLat,
        lng: assetLng,
        distanceKm: parseFloat(distanceKm.toFixed(2)),
      });
    }
  });

  // Sort by distance
  assets.sort((a, b) => a.distanceKm - b.distanceKm);

  return assets;
}

/**
 * Filter assets by radius and return a summary.
 */
export function getImpactSummary(assets, radiusKm) {
  const filtered = assets.filter((a) => a.distanceKm <= radiusKm);

  const counts = {
    hospital: 0,
    school: 0,
    fire_station: 0,
    industry: 0,
    power: 0,
    settlement: 0,
  };

  filtered.forEach((a) => {
    if (counts[a.type] !== undefined) counts[a.type]++;
  });

  // Estimated population â€” deterministic based on settlements + radius
  const basePopPerSettlement = 2800;
  const populationEstimate = counts.settlement * basePopPerSettlement +
    Math.round(radiusKm * radiusKm * 120);

  return {
    totalAssets: filtered.length,
    counts,
    populationEstimate,
    filteredAssets: filtered,
  };
}

export { ASSET_TYPES };
