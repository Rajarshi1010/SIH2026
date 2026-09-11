import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function LeafletMapSection({ points, onMarkerClick }) {
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
      {points && points.map((pt, idx) => {
        const iconColor = pt.categoryColor || '#ef4444';
        return (
          <Marker 
            key={pt.id || idx} 
            position={[pt.lat, pt.lng]}
            icon={getCustomIcon(iconColor)}
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
    </MapContainer>
  );
}