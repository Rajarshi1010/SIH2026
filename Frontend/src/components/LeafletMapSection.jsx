import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import ImpactRadiusLayer from './ImpactRadiusLayer';

// Internal component to control map view when impact analysis is activated
function MapViewController({ threatPoint, isImpactActive, radiusKm }) {
  const map = useMap();
  const prevActiveRef = useRef(false);

  useEffect(() => {
    if (isImpactActive && threatPoint) {
      // Calculate zoom level based on radius
      const zoomForRadius = { 1: 14, 5: 12, 10: 11 };
      const zoom = zoomForRadius[radiusKm] || 12;

      map.flyTo([threatPoint.lat, threatPoint.lng], zoom, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    } else if (prevActiveRef.current && !isImpactActive) {
      // Zoom back out when deactivating
      map.flyTo(map.getCenter(), 3, {
        duration: 0.8,
        easeLinearity: 0.25,
      });
    }
    prevActiveRef.current = isImpactActive;
  }, [isImpactActive, threatPoint, radiusKm, map]);

  return null;
}

// Internal component to handle external fly-to requests (from Top 5 "View on Map")
function FlyToHandler({ flyToTarget }) {
  const map = useMap();
  const lastTsRef = useRef(null);

  useEffect(() => {
    if (!flyToTarget || flyToTarget.lat == null || flyToTarget.lng == null) return;
    // Deduplicate using timestamp
    if (lastTsRef.current === flyToTarget._ts) return;
    lastTsRef.current = flyToTarget._ts;

    map.flyTo([flyToTarget.lat, flyToTarget.lng], 10, {
      duration: 1.4,
      easeLinearity: 0.2,
    });
  }, [flyToTarget, map]);

  return null;
}

export default function LeafletMapSection({
  points,
  onMarkerClick,
  impactActive = false,
  impactThreatPoint = null,
  impactRadiusKm = 5,
  impactFilteredAssets = [],
  flyToTarget = null,
  selectedThreatPoint = null,
}) {
  const defaultCenter = [20.5937, 78.9629]; 
  const center = points && points.length > 0 ? [points[0].lat, points[0].lng] : defaultCenter;

  // Helper function to generate a custom colored dot marker icon
  const getCustomIcon = (color) => {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="
        background-color: ${color};
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 10px ${color};
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8]
    });
  };

  // Selected threat highlighted icon — slightly larger with stronger glow
  const getSelectedIcon = (color) => {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="
        background-color: ${color};
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 16px ${color}, 0 0 30px ${color}88;
        animation: agniMarkerPulse 2s ease-in-out infinite;
      "></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10]
    });
  };

  // Check if a point is the currently selected threat
  const isSelected = (pt) => {
    if (!selectedThreatPoint || !pt) return false;
    return (
      Math.abs(pt.lat - selectedThreatPoint.lat) < 0.0001 &&
      Math.abs(pt.lng - selectedThreatPoint.lng) < 0.0001
    );
  };

  return (
    <MapContainer 
      center={center} 
      zoom={3} 
      style={{ width: '100%', height: '100%', background: '#0a0a0f' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Map view controller for impact analysis */}
      <MapViewController
        threatPoint={impactThreatPoint}
        isImpactActive={impactActive}
        radiusKm={impactRadiusKm}
      />

      {/* External fly-to handler (from Top 5 cards) */}
      <FlyToHandler flyToTarget={flyToTarget} />

      {/* Impact radius overlay */}
      <ImpactRadiusLayer
        threatPoint={impactThreatPoint}
        radiusKm={impactRadiusKm}
        filteredAssets={impactFilteredAssets}
        isActive={impactActive}
      />

      {/* Selected threat highlight ring (visible when selected but impact NOT active) */}
      {selectedThreatPoint && !impactActive && (
        <>
          <CircleMarker
            center={[selectedThreatPoint.lat, selectedThreatPoint.lng]}
            radius={20}
            pathOptions={{
              color: 'rgba(245, 158, 11, 0.35)',
              weight: 1.5,
              fillColor: 'rgba(245, 158, 11, 0.08)',
              fillOpacity: 1,
              dashArray: '4, 4',
              interactive: false,
              className: 'agni-selected-ring',
            }}
          />
        </>
      )}

      {points && points.map((pt, idx) => {
        const iconColor = pt.categoryColor || '#ef4444';
        const selected = isSelected(pt);
        return (
          <Marker 
            key={pt.id || idx} 
            position={[pt.lat, pt.lng]}
            icon={selected ? getSelectedIcon(iconColor) : getCustomIcon(iconColor)}
            zIndexOffset={selected ? 1000 : 0}
            eventHandlers={{
              click: () => {
                if (onMarkerClick) onMarkerClick(pt);
              }
            }}
          >
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', color: '#111', minWidth: '160px' }}>
                <strong style={{ fontSize: '0.95rem', display: 'block', marginBottom: '4px' }}>
                  {pt.name || `Threat #${idx + 1}`}
                </strong>
                <span style={{ fontSize: '0.78rem', color: '#555', display: 'block' }}>
                  Type: <b>{pt.categoryLabel || pt.type}</b>
                </span>
                <span style={{ fontSize: '0.78rem', color: '#555', display: 'block' }}>
                  FRP: <b>{pt.frp_mw} MW</b>
                </span>
                <span style={{ fontSize: '0.78rem', color: '#555', display: 'block' }}>
                  Score: <b>{(pt.score * 100).toFixed(1)}%</b>
                </span>
                <span style={{ fontSize: '0.75rem', color: '#888', display: 'block', marginTop: '4px' }}>
                  Date: {pt.acq_date}
                </span>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* CSS for selected marker pulse animation */}
      <style>{`
        @keyframes agniMarkerPulse {
          0%, 100% { box-shadow: 0 0 16px currentColor, 0 0 30px currentColor; transform: scale(1); }
          50% { box-shadow: 0 0 22px currentColor, 0 0 40px currentColor; transform: scale(1.1); }
        }
        .agni-selected-ring {
          animation: agniRingPulse 2.5s ease-in-out infinite;
        }
        @keyframes agniRingPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </MapContainer>
  );
}