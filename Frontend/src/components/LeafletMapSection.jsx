import React, { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Polygon, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { historyFor, impactRadiusKm } from '../threatMetrics';
import HistoryChart from './HistoryChart';

const DEFAULT_CENTER = [20.5937, 78.9629];

// FRP drives marker size across a fixed 5px–14px band
const radiusForFrp = (frp) => 5 + Math.min(1, (Number(frp) || 0) / 200) * 9;

// GeoJSON rings are [lon, lat]; Leaflet wants [lat, lng].
const ringToLatLngs = (polygon) =>
  polygon?.coordinates?.[0]?.map(([lon, lat]) => [lat, lon]) || null;

// Leaflet renders against a cached container size, so it needs a nudge while the
// detail panel animates the map's width.
function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function LeafletMapSection({ points, onMarkerClick, selectedPoint, onOpenDetail, impactPoint }) {
  const center = points && points.length > 0 ? [points[0].lat, points[0].lng] : DEFAULT_CENTER;
  const impactFootprint = impactPoint ? ringToLatLngs(impactPoint.footprint) : null;

  return (
    <div className="dark-basemap h-full w-full">
      <MapContainer center={center} zoom={3} style={{ width: '100%', height: '100%' }}>
        <MapAutoResize />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {impactPoint && (
          <Circle
            center={[impactPoint.lat, impactPoint.lng]}
            radius={impactRadiusKm(impactPoint) * 1000}
            pathOptions={{
              color: impactPoint.color,
              fillColor: impactPoint.color,
              weight: 1,
              dashArray: '4 4',
              fillOpacity: 0.08,
            }}
          />
        )}

        {/* DEFM sensor swath for the point under analysis */}
        {impactFootprint && (
          <Polygon
            positions={impactFootprint}
            pathOptions={{
              color: impactPoint.color,
              fillColor: impactPoint.color,
              weight: 1.5,
              fillOpacity: 0.16,
            }}
          />
        )}

        {points && points.map((pt, idx) => {
          const isSelected = selectedPoint && selectedPoint.id === pt.id;
          const recent = historyFor(pt, 6);

          return (
            <CircleMarker
              key={pt.id || idx}
              center={[pt.lat, pt.lng]}
              radius={radiusForFrp(pt.frp_mw)}
              pathOptions={{
                color: pt.color,
                fillColor: pt.color,
                weight: isSelected ? 2.5 : 1,
                fillOpacity: isSelected ? 0.55 : 0.28,
              }}
              eventHandlers={{
                mouseover: (e) => e.target.openPopup(),
                click: () => onMarkerClick && onMarkerClick(pt),
              }}
            >
              <Popup>
                <div className="min-w-[228px] font-sans">
                  {/* Classification is the title — colour is never the only cue */}
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: pt.color }} />
                    <span className="text-[15px] font-medium text-text-primary">
                      {pt.classificationLabel}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-sm border border-border-strong bg-raised px-1.5 py-0.5 font-mono text-[11.5px] tabular-nums text-text-primary">
                      {pt.confidence != null ? `${(pt.confidence * 100).toFixed(1)}%` : 'N/A'}
                    </span>
                    {pt.is_industrial && (
                      <span className="rounded-sm border border-border-strong bg-raised px-1.5 py-0.5 font-sans text-[11.5px] font-semibold uppercase tracking-wider text-text-secondary">
                        Industrial
                      </span>
                    )}
                    <span className="font-sans text-[12px] text-text-muted">{pt.priority}</span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div>
                      <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                        FRP
                      </div>
                      <div className="font-mono text-[15px] tabular-nums text-text-primary">
                        {pt.frp_mw ?? '--'} MW
                      </div>
                    </div>
                    <div>
                      <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                        Brightness
                      </div>
                      <div className="font-mono text-[15px] tabular-nums text-text-primary">
                        {pt.brightness_k ?? '--'} K
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 border-t border-border-soft pt-2">
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      H3 cell
                    </div>
                    <div className="font-mono text-[12.5px] text-text-secondary">{pt.h3_index || '--'}</div>
                  </div>

                  <div className="mt-3 border-t border-border-soft pt-2.5">
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Recent passes
                    </div>
                    <div className="mt-1.5">
                      <HistoryChart history={recent} color={pt.color} compact />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[11.5px] tabular-nums text-text-muted">
                      <span>{recent[recent.length - 1].date}</span>
                      <span>{recent[0].date}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenDetail && onOpenDetail(pt)}
                    className="mt-3 w-full rounded-md border border-accent bg-accent px-3 py-2 font-sans text-[12.5px] font-bold uppercase tracking-[0.15em] text-on-accent transition-colors hover:border-accent-hover hover:bg-accent-hover"
                  >
                    Open Analysis
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
