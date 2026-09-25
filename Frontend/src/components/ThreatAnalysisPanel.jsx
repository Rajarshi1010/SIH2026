import React, { useEffect, useState } from 'react';
import { fetchLocationHistory } from '../api';
import DetectionHistoryChart from './DetectionHistoryChart';
import FrpHistoryChart from './FrpHistoryChart';
import ShapChart from './ShapChart';

const HISTORY_DAYS = 30;

// Loads the FIRMS detection history for the point under analysis.
// Results are tagged with their coordinates, so switching points reads as
// loading until the new response lands.
const useLocationHistory = (lat, lng) => {
  const key = `${lat},${lng}`;
  const [result, setResult] = useState({ key: null, status: 'loading', data: null });

  useEffect(() => {
    if (lat == null || lng == null) return undefined;
    const controller = new AbortController();
    fetchLocationHistory(lat, lng, { days: HISTORY_DAYS, signal: controller.signal })
      .then((data) => setResult({ key: `${lat},${lng}`, status: 'ready', data }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Error fetching location history:', err);
        setResult({ key: `${lat},${lng}`, status: 'error', data: null });
      });
    return () => controller.abort();
  }, [lat, lng]);

  return result.key === key ? result : { status: 'loading', data: null };
};

const Readout = ({ label, value, mono = true }) => (
  <div>
    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
      {label}
    </div>
    <div className={`mt-1 text-[14px] text-text-primary ${mono ? 'font-mono tabular-nums' : 'font-sans'}`}>
      {value}
    </div>
  </div>
);

export default function ThreatAnalysisPanel({ point, onClose, isNotified, onNotify }) {
  const history = useLocationHistory(point.lat, point.lng);
  const series = history.data?.series || [];
  const activeDays = series.filter((d) => d.detections > 0).length;
  const peakFrp = series.reduce((max, d) => Math.max(max, d.max_frp_mw), 0);

  const detected = point.detected_at ? new Date(point.detected_at) : null;
  const detectedLabel =
    detected && !Number.isNaN(detected.getTime())
      ? `${detected.toISOString().replace('T', ' ').slice(0, 16)} UTC`
      : '--';

  return (
    <div className="fade-up flex h-[520px] flex-col rounded-lg border border-border-strong bg-card lg:h-[560px] lg:min-w-[420px]">
      {/* Header — classification is the title, per §5 */}
      <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: point.color }} />
            <span className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
              {point.priority}
            </span>
          </div>

          <h3 className="mt-1.5 font-display text-[22px] font-extrabold uppercase tracking-wide text-text-primary">
            {point.classificationLabel}
          </h3>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-sm border border-border-strong bg-raised px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-text-primary">
              {point.confidence != null ? `${(point.confidence * 100).toFixed(1)}%` : 'N/A'}
            </span>
            <span className="rounded-sm border border-border-strong bg-raised px-1.5 py-0.5 font-sans text-[11.5px] font-semibold uppercase tracking-wider text-text-secondary">
              {point.is_industrial ? 'Industrial' : 'Non-industrial'}
            </span>
          </div>

          <div className="mt-1.5 font-mono text-[12.5px] tabular-nums text-text-muted">
            {point.lat?.toFixed(4) ?? '--'}°, {point.lng?.toFixed(4) ?? '--'}°
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-border-strong bg-raised px-2 py-0.5 font-mono text-[12.5px] text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Physical measurements straight off the feed */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border-soft px-3 py-2.5">
            <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
              Radiative power
            </div>
            <div className="mt-1 font-mono text-[28px] leading-none tabular-nums text-text-primary">
              {point.frp_mw ?? '--'}
              <span className="ml-1 text-[13px] text-text-muted">MW</span>
            </div>
          </div>

          <div className="rounded-md border border-border-soft px-3 py-2.5">
            <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
              Brightness
            </div>
            <div className="mt-1 font-mono text-[28px] leading-none tabular-nums text-text-primary">
              {point.brightness_k ?? '--'}
              <span className="ml-1 text-[13px] text-text-muted">K</span>
            </div>
          </div>
        </div>

        {/* Telemetry identifiers */}
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-border-soft pt-4">
          <Readout label="Satellite" value={point.satellite || '--'} mono={false} />
          <Readout label="Detected" value={detectedLabel} />
          <Readout label="H3 cell" value={point.h3_index || '--'} />
          <Readout
            label="Nearest emitter"
            value={
              point.distance_to_emitter_m != null
                ? `${(point.distance_to_emitter_m / 1000).toFixed(2)} km`
                : '--'
            }
          />
          <div className="col-span-2">
            <Readout
              label="Facility / Asset Name"
              value={point.emitter_name || (point.emitter_id ? `Registered Asset (${point.emitter_id.slice(0, 8)}...)` : 'Regional Landscape (No Registered Industrial Asset)')}
              mono={!point.emitter_name && Boolean(point.emitter_id)}
            />
          </div>
        </div>

        {/* Detection history — NASA FIRMS via /gis/history */}
        <div className="mt-6 border-t border-border-soft pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
              Detections nearby · last {HISTORY_DAYS} days
            </h4>
            {history.status === 'ready' && (
              <span className="font-mono text-[12px] tabular-nums text-text-muted">
                within {history.data.radius_km} km
              </span>
            )}
          </div>

          {history.status === 'loading' && (
            <div className="mt-3 h-[150px] animate-pulse rounded-md bg-raised" aria-label="Loading detection history" />
          )}

          {history.status === 'error' && (
            <p className="mt-3 font-sans text-[13px] leading-relaxed text-text-muted">
              Couldn't load detection history from NASA FIRMS. Try reopening the analysis.
            </p>
          )}

          {history.status === 'ready' && (
            history.data.total_detections === 0 ? (
              <p className="mt-3 font-sans text-[13px] leading-relaxed text-text-muted">
                No other detections within {history.data.radius_km} km in the last {HISTORY_DAYS} days.
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Readout label="Detections" value={history.data.total_detections} />
                  <Readout label="Active days" value={`${activeDays} / ${series.length}`} />
                  <Readout label="Peak FRP" value={`${peakFrp} MW`} />
                </div>
                <div className="mt-4 font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                  Detections per day
                </div>
                <div className="mt-2">
                  <DetectionHistoryChart series={series} />
                </div>

                <div className="mt-5 font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                  Peak radiative power per day (MW)
                </div>
                <div className="mt-2">
                  <FrpHistoryChart series={series} />
                </div>
                <p className="mt-1 font-sans text-[12px] text-text-muted">
                  Gaps are days with no detections. Hover a day for details. Source: {history.data.source}.
                </p>
              </>
            )
          )}
        </div>

        {/* Explainable AI — §5.6 */}
        <div className="mt-6 border-t border-border-soft pt-4">
          <h4 className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
            Why the model decided this
          </h4>
          <div className="mt-3">
            <ShapChart shap={point.shap} />
          </div>
        </div>
      </div>

      {/* Notify action */}
      <div className="border-t border-border-soft px-5 py-4">
        {isNotified ? (
          <div className="rounded-md border border-border-strong bg-raised px-4 py-3">
            <div className="font-sans text-[13px] font-semibold uppercase tracking-wider text-text-primary">
              Alert queued
            </div>
            <div className="mt-1 font-sans text-[12.5px] leading-relaxed text-text-muted">
              Queued for responders near this detection. Dispatch is not wired to a backend yet.
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onNotify}
            className="w-full rounded-md border border-accent bg-accent px-4 py-3 font-sans text-[13px] font-bold uppercase tracking-[0.15em] text-on-accent transition-colors hover:border-accent-hover hover:bg-accent-hover"
          >
            Notify area
          </button>
        )}
      </div>
    </div>
  );
}
