import React, { useState } from 'react';

// Daily NASA FIRMS detections around a location, oldest day first. One series,
// so no legend — the surrounding heading names it. FRP lives in the tooltip
// rather than on a second axis.
const WIDTH = 420;
const HEIGHT = 150;
const PAD = { left: 28, right: 8, top: 18, bottom: 24 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Column with a 4px rounded cap, square at the baseline.
const columnPath = (x, y, w, h) => {
  const r = Math.min(4, w / 2, h);
  const base = y + h;
  return `M ${x} ${base} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${base} Z`;
};

export default function DetectionHistoryChart({ series }) {
  const [hovered, setHovered] = useState(null);
  if (!series || series.length === 0) return null;

  const peak = Math.max(...series.map((d) => d.detections), 1);
  // Even ceiling keeps every gridline a whole number of detections.
  const ceiling = peak <= 1 ? 1 : Math.ceil(peak / 2) * 2;
  const ticks = ceiling === 1 ? [0, 1] : [0, ceiling / 2, ceiling];

  const slot = PLOT_W / series.length;
  const barW = Math.min(24, Math.max(2, slot - 2)); // 2px surface gap between columns
  const xAt = (i) => PAD.left + i * slot + (slot - barW) / 2;
  const yAt = (v) => PAD.top + PLOT_H - (v / ceiling) * PLOT_H;

  const peakIndex = series.reduce((best, d, i) => (d.detections > series[best].detections ? i : best), 0);
  const active = hovered !== null ? series[hovered] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Daily satellite detections from ${series[0].date} to ${series[series.length - 1].date}, peak ${series[peakIndex].detections} on ${series[peakIndex].date}`}
      >
        {/* Recessive gridlines + y axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="var(--color-border-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.left - 7}
              y={yAt(t) + 3}
              textAnchor="end"
              className="fill-[var(--color-text-muted)] font-mono text-[11px] tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}

        {series.map((d, i) =>
          d.detections > 0 ? (
            <path
              key={d.date}
              d={columnPath(xAt(i), yAt(d.detections), barW, PAD.top + PLOT_H - yAt(d.detections))}
              fill="var(--color-chart)"
              opacity={hovered === null || hovered === i ? 1 : 0.45}
            />
          ) : null,
        )}

        {/* Only the busiest day is labelled directly */}
        {hovered === null && series[peakIndex].detections > 0 && (
          <text
            x={xAt(peakIndex) + barW / 2}
            y={yAt(series[peakIndex].detections) - 6}
            textAnchor="middle"
            className="fill-[var(--color-text-secondary)] font-mono text-[11.5px] tabular-nums"
          >
            {series[peakIndex].detections}
          </text>
        )}

        {/* Hit targets span the whole slot, taller than any bar */}
        {series.map((d, i) => (
          <rect
            key={`hit-${d.date}`}
            x={PAD.left + i * slot}
            y={PAD.top}
            width={slot}
            height={PLOT_H}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {/* X axis: first and last day only, to avoid label collisions */}
        <text x={PAD.left} y={HEIGHT - 6} textAnchor="start" className="fill-[var(--color-text-muted)] font-mono text-[11px] tabular-nums">
          {shortDate(series[0].date)}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 6} textAnchor="end" className="fill-[var(--color-text-muted)] font-mono text-[11px] tabular-nums">
          {shortDate(series[series.length - 1].date)}
        </text>
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-raised px-2 py-1.5 whitespace-nowrap"
          style={{ left: `${Math.min(85, Math.max(15, ((xAt(hovered) + barW / 2) / WIDTH) * 100))}%` }}
        >
          <div className="font-mono text-[11.5px] tabular-nums text-text-muted">{shortDate(active.date)}</div>
          <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-primary">
            {active.detections} {active.detections === 1 ? 'detection' : 'detections'}
          </div>
          {active.detections > 0 && (
            <div className="font-mono text-[11.5px] tabular-nums text-text-secondary">
              Peak {active.max_frp_mw} MW · Total {active.total_frp_mw} MW
            </div>
          )}
        </div>
      )}

      {/* Table view for screen readers */}
      <table className="sr-only">
        <caption>Daily detections</caption>
        <thead>
          <tr><th>Date</th><th>Detections</th><th>Peak FRP (MW)</th><th>Total FRP (MW)</th></tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.date}><td>{d.date}</td><td>{d.detections}</td><td>{d.max_frp_mw}</td><td>{d.total_frp_mw}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
