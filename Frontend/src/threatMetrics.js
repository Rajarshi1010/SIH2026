// Placeholder analytics for the threat detail view. Values are derived from a hash
// of the point so they stay stable across re-renders — swap for real endpoints later.

const seedFrom = (input) => {
  const text = String(input);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const makeRng = (seed) => {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const keyFor = (point) => `${point?.id ?? ''}:${point?.lat ?? 0}:${point?.lng ?? 0}`;

export const impactRadiusKm = (point) => {
  if (!point) return 0;
  const frp = Number(point.frp_mw) || 0;
  const rng = makeRng(seedFrom(keyFor(point)));
  const spread = (1.5 + Math.sqrt(frp) * 0.6) * (0.85 + rng() * 0.3);
  return Math.round(Math.min(18, Math.max(1.5, spread)) * 10) / 10;
};

export const populationAtRisk = (point) => {
  if (!point) return 0;
  const rng = makeRng(seedFrom(`${keyFor(point)}:pop`));
  const area = Math.PI * impactRadiusKm(point) ** 2;
  return Math.round((area * (120 + rng() * 900)) / 100) * 100;
};

export const historyFor = (point, count = 6) => {
  if (!point) return [];

  const rng = makeRng(seedFrom(`${keyFor(point)}:history`));
  const baseFrp = Number(point.frp_mw) || 40;
  const baseScore = Number(point.confidence) || 0.5;

  const parsed = point.detected_at ? new Date(point.detected_at) : null;
  const anchor = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

  const entries = [];
  let cursor = anchor.getTime();

  for (let i = 0; i < count; i += 1) {
    entries.push({
      date: new Date(cursor).toISOString().slice(0, 10),
      frp: Math.round(Math.max(1, baseFrp * (0.35 + rng() * 1.25))),
      // Multiplier tops out at 1.0 so high-confidence points vary instead of
      // flat-lining against the upper clamp.
      score: Math.min(0.99, Math.max(0.05, baseScore * (0.5 + rng() * 0.5))),
    });
    cursor -= (3 + Math.floor(rng() * 13)) * 86400000;
  }

  return entries;
};
