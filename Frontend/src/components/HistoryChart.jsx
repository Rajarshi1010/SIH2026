import React, { useState } from 'react';

// Radiative power over successive satellite passes. One series, so no legend —
// the surrounding heading names it.
export default function HistoryChart({ history, color, compact = false }) {
  const [hovered, setHovered] = useState(null);

  const series = [...history].reverse(); // oldest → newest
  if (series.length === 0) return null;

  const peak = Math.max(...series.map((d) => d.frp), 1);
  const ceiling = Math.ceil(peak / 20) * 20 || 20;

  const width = compact ? 220 : 420;
  const height = compact ? 46 : 150;
  const padLeft = compact ? 2 : 36;
  const padRight = compact ? 2 : 12;
  const padTop = compact ? 6 : 12;
  const padBottom = compact ? 6 : 24;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xAt = (i) => padLeft + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const yAt = (v) => padTop + plotH - (v / ceiling) * plotH;

  const linePath = series.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.frp)}`).join(' ');
  const areaPath = `${linePath} L ${xAt(series.length - 1)} ${padTop + plotH} L ${xAt(0)} ${padTop + plotH} Z`;

  const peakIndex = series.reduce((best, d, i) => (d.frp > series[best].frp ? i : best), 0);
  const gradientId = `hist-${compact ? 'c' : 'f'}-${String(color).replace('#', '')}`;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Radiative power across ${series.length} satellite passes, ${series[0].date} to ${series[series.length - 1].date}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines + y axis */}
        {!compact && [0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={padTop + plotH * t}
              y2={padTop + plotH * t}
              stroke="var(--color-border-soft)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={padLeft - 7}
              y={padTop + plotH * t + 3}
              textAnchor="end"
              className="fill-[var(--color-text-muted)] font-mono text-[11px] tabular-nums"
            >
              {Math.round(ceiling * (1 - t))}
            </text>
          </g>
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Crosshair on the hovered pass */}
        {hovered !== null && !compact && (
          <line
            x1={xAt(hovered)}
            x2={xAt(hovered)}
            y1={padTop}
            y2={padTop + plotH}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {series.map((d, i) => (
          <g key={d.date}>
            <circle
              cx={xAt(i)}
              cy={yAt(d.frp)}
              r={compact ? 2 : hovered === i ? 5 : 3.5}
              fill={color}
              stroke="var(--color-card)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {!compact && (
              <rect
                x={xAt(i) - plotW / (series.length * 2)}
                y={padTop}
                width={plotW / series.length}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            )}
          </g>
        ))}

        {/* Only the peak is labelled directly — never every point */}
        {!compact && hovered === null && (
          <text
            x={xAt(peakIndex)}
            y={yAt(series[peakIndex].frp) - 10}
            textAnchor={peakIndex === series.length - 1 ? 'end' : 'middle'}
            className="fill-[var(--color-text-secondary)] font-mono text-[11.5px] tabular-nums"
          >
            {series[peakIndex].frp} MW
          </text>
        )}

        {/* X axis: first and last pass only, to avoid label collisions */}
        {!compact && (
          <>
            <text
              x={padLeft}
              y={height - 8}
              textAnchor="start"
              className="fill-[var(--color-text-muted)] font-mono text-[11px] tabular-nums"
            >
              {series[0].date}
            </text>
            <text
              x={width - padRight}
              y={height - 8}
              textAnchor="end"
              className="fill-[var(--color-text-muted)] font-mono text-[11px] tabular-nums"
            >
              {series[series.length - 1].date}
            </text>
          </>
        )}
      </svg>

      {hovered !== null && !compact && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 border border-border-strong bg-raised px-2 py-1.5 whitespace-nowrap"
          style={{ left: `${(xAt(hovered) / width) * 100}%` }}
        >
          <div className="font-mono text-[11.5px] tabular-nums text-text-muted">
            {series[hovered].date}
          </div>
          <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-primary">
            {series[hovered].frp} MW · {(series[hovered].score * 100).toFixed(0)}%
          </div>
        </div>
      )}
    </div>
  );
}
