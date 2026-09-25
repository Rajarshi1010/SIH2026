import React, { useState } from 'react';
import { HEIGHT, PAD, PLOT_H, WIDTH, shortDate, slotCentre, slotWidth, tooltipLeft } from './historyChartLayout';

// Peak fire radiative power per day, oldest day first. A day without detections
// has no FRP, so the line breaks there instead of dropping to a made-up zero.
// Shares its day slots with DetectionHistoryChart so the two stack in register.

// Round up to 1, 2, 2.5 or 5 x 10^n so gridlines land on readable values.
const niceCeiling = (value) => {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * magnitude >= value);
  return step * magnitude;
};

const formatMw = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// Consecutive days with detections form one unbroken run of the line.
const toRuns = (series) => {
  const runs = [];
  let current = [];
  series.forEach((d, i) => {
    if (d.detections > 0) {
      current.push(i);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length) runs.push(current);
  return runs;
};

export default function FrpHistoryChart({ series }) {
  const [hovered, setHovered] = useState(null);
  if (!series || series.length === 0) return null;

  const count = series.length;
  const peak = Math.max(...series.map((d) => d.max_frp_mw), 0);
  if (peak <= 0) return null;

  const ceiling = niceCeiling(peak);
  const ticks = [0, ceiling / 2, ceiling];
  const xAt = (i) => slotCentre(i, count);
  const yAt = (v) => PAD.top + PLOT_H - (v / ceiling) * PLOT_H;

  const runs = toRuns(series);
  const isolated = new Set(runs.filter((r) => r.length === 1).map((r) => r[0]));
  const peakIndex = series.reduce((best, d, i) => (d.max_frp_mw > series[best].max_frp_mw ? i : best), 0);
  const markerAt = new Set([...isolated, peakIndex, ...(hovered !== null && series[hovered].detections > 0 ? [hovered] : [])]);
  const active = hovered !== null ? series[hovered] : null;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`Daily peak fire radiative power from ${series[0].date} to ${series[count - 1].date}, highest ${formatMw(series[peakIndex].max_frp_mw)} megawatts on ${series[peakIndex].date}`}
      >
        {/* Recessive gridlines + y axis (MW) */}
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
              {formatMw(t)}
            </text>
          </g>
        ))}

        {/* Crosshair on the hovered day */}
        {hovered !== null && (
          <line
            x1={xAt(hovered)}
            x2={xAt(hovered)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {runs
          .filter((run) => run.length > 1)
          .map((run) => (
            <path
              key={run[0]}
              d={run.map((i, k) => `${k === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(series[i].max_frp_mw)}`).join(' ')}
              fill="none"
              stroke="var(--color-chart)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

        {/* Markers: isolated days (no line to show them), the peak, and the hovered day */}
        {[...markerAt].map((i) => (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(series[i].max_frp_mw)}
            r={hovered === i ? 5 : 4}
            fill="var(--color-chart)"
            stroke="var(--color-card)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Only the peak is labelled directly */}
        {hovered === null && (
          <text
            x={xAt(peakIndex)}
            y={yAt(series[peakIndex].max_frp_mw) - 9}
            textAnchor={peakIndex > count - 3 ? 'end' : peakIndex < 2 ? 'start' : 'middle'}
            className="fill-[var(--color-text-secondary)] font-mono text-[11.5px] tabular-nums"
          >
            {formatMw(series[peakIndex].max_frp_mw)} MW
          </text>
        )}

        {/* Hit targets span each whole day slot */}
        {series.map((d, i) => (
          <rect
            key={`hit-${d.date}`}
            x={PAD.left + i * slotWidth(count)}
            y={PAD.top}
            width={slotWidth(count)}
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
          {shortDate(series[count - 1].date)}
        </text>
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-raised px-2 py-1.5 whitespace-nowrap"
          style={{ left: tooltipLeft(xAt(hovered)) }}
        >
          <div className="font-mono text-[11.5px] tabular-nums text-text-muted">{shortDate(active.date)}</div>
          {active.detections > 0 ? (
            <>
              <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-primary">
                Peak {formatMw(active.max_frp_mw)} MW
              </div>
              <div className="font-mono text-[11.5px] tabular-nums text-text-secondary">
                Total {formatMw(active.total_frp_mw)} MW · {active.detections} {active.detections === 1 ? 'detection' : 'detections'}
              </div>
            </>
          ) : (
            <div className="mt-0.5 font-mono text-[13px] text-text-secondary">No detections</div>
          )}
        </div>
      )}

      {/* Table view for screen readers */}
      <table className="sr-only">
        <caption>Daily peak fire radiative power</caption>
        <thead>
          <tr><th>Date</th><th>Peak FRP (MW)</th><th>Total FRP (MW)</th><th>Detections</th></tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              <td>{d.detections > 0 ? d.max_frp_mw : 'none'}</td>
              <td>{d.total_frp_mw}</td>
              <td>{d.detections}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
