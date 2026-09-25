import React from 'react';
import { CLASSIFICATIONS } from '../classifications';

const formatDistance = (km) => {
  if (km == null) return '--';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
};

const formatCoord = (lat, lng) =>
  `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`;

const Row = ({ label, value }) => (
  <div>
    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
      {label}
    </div>
    <div className="mt-1 font-mono text-[14px] tabular-nums text-text-primary">{value}</div>
  </div>
);

// Selection is owned by App so the numbered globe badges and these cards stay in sync.
export default function NearestAnomalies({ points, expandedId, onToggle }) {
  if (!points || points.length === 0) return null;
  const list = points.slice(0, 5);

  return (
    <div className="flex w-full flex-col gap-3">
      <div>
        <div className="flex items-center gap-2 font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-accent">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent text-accent" />
          {list.length} detections ranked by proximity
        </div>

        <h2 className="font-baumans mt-2.5 text-[1.7rem] uppercase leading-none tracking-[0.04em] text-text-primary">
          {list.length} Nearest Anomalies Near You
        </h2>
      </div>

      {list.map((pt, index) => {
        const meta = CLASSIFICATIONS[pt.classification] || CLASSIFICATIONS.unclassified;
        const isOpen = expandedId === pt.id;

        return (
          <div
            key={pt.id}
            onClick={() => onToggle && onToggle(pt.id)}
            className={`fade-up cursor-pointer rounded-lg border bg-card px-4 py-3.5 ${isOpen ? 'border-border-strong' : 'border-border-soft'}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                {/* Same numbered badge as the marker on the globe */}
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-card font-mono text-[12px] font-bold text-text-primary"
                  style={{ borderColor: meta.color }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="truncate text-[15px] font-medium text-text-primary">
                  {meta.label}
                </span>
              </div>

              <span
                className="shrink-0 font-mono text-[15px] tabular-nums"
                style={{ color: meta.color }}
              >
                {pt.confidence != null ? pt.confidence.toFixed(2) : '--'}
              </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-3 font-mono text-[13px] tabular-nums text-text-muted">
              <span className="truncate">{formatCoord(pt.lat, pt.lng)}</span>
              <span className="shrink-0">{formatDistance(pt.distance_km)}</span>
            </div>

            {/* grid-rows 0fr -> 1fr drawer; the card stays mounted either way */}
            <div className="drawer-body" data-open={isOpen ? 'true' : 'false'}>
              <div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-soft pt-3">
                  <Row label="FRP" value={`${pt.frp_mw ?? '--'} MW`} />
                  <Row label="Brightness" value={`${pt.brightness_k ?? '--'} K`} />
                  <Row label="Satellite" value={pt.satellite || '--'} />
                  <Row
                    label="Detected"
                    value={pt.detected_at ? pt.detected_at.slice(0, 10) : '--'}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
