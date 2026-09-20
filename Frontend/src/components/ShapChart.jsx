import React from 'react';

// SHAP attribution (FRONTEND_INTEGRATION.md §5.6) — why the model chose this class.
// Bar length is impact magnitude; direction is carried by colour AND a signed
// label, so it never depends on colour alone.

const FEATURE_LABELS = {
  distance_to_industrial_km: 'Distance to industrial',
  frp_z_score: 'FRP z-score',
  brightness_mir: 'Brightness (MIR)',
};

const humanize = (key) =>
  FEATURE_LABELS[key] || key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const UNITS = { distance_to_industrial_km: ' km', brightness_mir: ' K' };

export default function ShapChart({ shap }) {
  if (!shap || Object.keys(shap).length === 0) {
    return (
      <p className="font-sans text-[13px] leading-relaxed text-text-muted">
        No attribution recorded. This detection was resolved before the model stage
        (or is still pending classification).
      </p>
    );
  }

  const rows = Object.entries(shap)
    .map(([key, d]) => ({
      key,
      label: humanize(key),
      value: d.value,
      impact: Number(d.impact_pct) || 0,
      positive: d.direction !== 'negative',
    }))
    .sort((a, b) => b.impact - a.impact);

  const widest = Math.max(...rows.map((r) => r.impact), 1);

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-sans text-[13px] text-text-secondary">{row.label}</span>
            <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-text-muted">
              {row.value}
              {UNITS[row.key] || ''}
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-sm bg-raised">
              <div
                className="score-fill h-full rounded-sm"
                style={{
                  width: `${(row.impact / widest) * 100}%`,
                  backgroundColor: row.positive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                }}
              />
            </div>

            <span className="w-[54px] shrink-0 text-right font-mono text-[12.5px] tabular-nums text-text-primary">
              {row.positive ? '+' : '−'}
              {row.impact.toFixed(1)}%
            </span>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4 border-t border-border-soft pt-2.5">
        <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-muted">
          <span className="h-2 w-2 rounded-sm bg-accent" /> Pushes toward class
        </span>
        <span className="flex items-center gap-1.5 font-sans text-[12px] text-text-muted">
          <span className="h-2 w-2 rounded-sm bg-text-muted" /> Pushes away
        </span>
      </div>
    </div>
  );
}
