/**
 * AGNIKAVACH â€” Impact Radius & Affected Area Component
 *
 * Renders impact radius circles and Lucide-based asset markers on the
 * existing Leaflet map when impact analysis is active for a selected threat.
 */
import React, { useMemo } from 'react';
import { Circle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

// --- Inline SVG paths from Lucide (16Ã—16 viewBox-adapted) ---
// These are the raw SVG path data so we can render them inside L.divIcon
// without importing React components into Leaflet's DOM layer.
const LUCIDE_PATHS = {
  hospital: `<path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>`,
  school: `<path d="M14 22v-4a2 2 0 1 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/>`,
  fire_station: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
  industry: `<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>`,
  power: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
  settlement: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
};

const ASSET_MARKER_COLORS = {
  hospital: '#ef4444',
  school: '#3b82f6',
  fire_station: '#f97316',
  industry: '#a855f7',
  power: '#eab308',
  settlement: '#22c55e',
};

// Pre-build Leaflet divIcon instances for each asset type (cached)
const assetIconCache = {};
function getAssetIcon(type) {
  if (assetIconCache[type]) return assetIconCache[type];

  const color = ASSET_MARKER_COLORS[type] || '#ffffff';
  const svgPaths = LUCIDE_PATHS[type] || '';

  const html = `<div style="
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 15, 0.82);
    border: 1.5px solid ${color};
    border-radius: 5px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.5), 0 0 8px ${color}33;
  ">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      ${svgPaths}
    </svg>
  </div>`;

  const icon = L.divIcon({
    className: 'agni-asset-icon',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
  assetIconCache[type] = icon;
  return icon;
}

const ASSET_LABELS = {
  hospital: 'Hospital',
  school: 'School',
  fire_station: 'Fire Station',
  industry: 'Industrial',
  power: 'Power',
  settlement: 'Settlement',
};

export default function ImpactRadiusLayer({
  threatPoint,
  radiusKm,
  filteredAssets,
  isActive,
}) {
  // Concentric ring radii for subtle visual context
  const concentricRings = useMemo(() => {
    if (!isActive || !threatPoint) return [];
    const rings = [];
    if (radiusKm >= 5) rings.push(1000);
    if (radiusKm >= 10) rings.push(5000);
    return rings;
  }, [isActive, threatPoint, radiusKm]);

  if (!isActive || !threatPoint) return null;

  const center = [threatPoint.lat, threatPoint.lng];
  const radiusMeters = radiusKm * 1000;

  return (
    <>
      {/* Concentric context rings â€” very subtle */}
      {concentricRings.map((ringRadius) => (
        <Circle
          key={`ring-${ringRadius}`}
          center={center}
          radius={ringRadius}
          pathOptions={{
            color: 'rgba(255, 255, 255, 0.08)',
            weight: 0.8,
            dashArray: '4, 10',
            fillColor: 'transparent',
            fillOpacity: 0,
            interactive: false,
          }}
        />
      ))}

      {/* Main impact radius â€” primary boundary */}
      <Circle
        center={center}
        radius={radiusMeters}
        pathOptions={{
          color: '#ef4444',
          weight: 1.5,
          fillColor: 'rgba(239, 68, 68, 0.06)',
          fillOpacity: 1,
          dashArray: radiusKm === 1 ? undefined : '6, 4',
          interactive: false,
        }}
      >
        <Tooltip
          direction="top"
          offset={[0, -20]}
          permanent
          className="impact-radius-tooltip"
        >
          <span style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#ef4444',
          }}>
            {radiusKm} KM RADIUS
          </span>
        </Tooltip>
      </Circle>

      {/* Selected threat â€” dominant pulse/glow rings */}
      {/* Outer animated glow */}
      <Circle
        center={center}
        radius={200 + radiusKm * 15}
        pathOptions={{
          color: 'rgba(239, 68, 68, 0.15)',
          weight: 0,
          fillColor: 'rgba(239, 68, 68, 0.12)',
          fillOpacity: 1,
          interactive: false,
          className: 'agni-threat-pulse',
        }}
      />
      {/* Core glow halo */}
      <Circle
        center={center}
        radius={120}
        pathOptions={{
          color: 'rgba(239, 68, 68, 0.5)',
          weight: 1,
          fillColor: 'rgba(239, 68, 68, 0.25)',
          fillOpacity: 1,
          interactive: false,
        }}
      />
      {/* Center dot */}
      <Circle
        center={center}
        radius={50}
        pathOptions={{
          color: '#ef4444',
          weight: 2,
          fillColor: '#ef4444',
          fillOpacity: 0.8,
          interactive: false,
        }}
      />

      {/* Asset markers â€” Lucide-based divIcons, smaller than threat */}
      {filteredAssets.map((asset) => (
        <Marker
          key={asset.id}
          position={[asset.lat, asset.lng]}
          icon={getAssetIcon(asset.type)}
        >
          <Tooltip
            direction="top"
            offset={[0, -14]}
            className="asset-marker-tooltip"
          >
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '0.72rem',
              lineHeight: 1.35,
              minWidth: '110px',
            }}>
              <div style={{
                fontWeight: 600,
                marginBottom: '2px',
                color: '#222',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: ASSET_MARKER_COLORS[asset.type] || '#888',
                  flexShrink: 0,
                }} />
                {asset.name}
              </div>
              <div style={{ color: '#777', fontSize: '0.66rem' }}>
                {ASSET_LABELS[asset.type]} Â· {asset.distanceKm.toFixed(1)} km
              </div>
            </div>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
