import React, { useState } from "react";

const MOCK_FIRES = [
  {
    id: 1,
    title: "Thermal Anomaly #01",
    distance: "12.4 km away",
    confidence: "94%",
    severity: "High",
    coords: "17.412° N, 78.498° E",
    frp: "48.2 MW",
    satellite: "VIIRS / NOAA-20",
    detectedAt: "14 mins ago"
  },
  {
    id: 2,
    title: "Thermal Anomaly #02",
    distance: "28.1 km away",
    confidence: "87%",
    severity: "High",
    coords: "17.520° N, 78.380° E",
    frp: "32.6 MW",
    satellite: "MODIS / TERRA",
    detectedAt: "32 mins ago"
  },
  {
    id: 3,
    title: "Thermal Anomaly #03",
    distance: "45.3 km away",
    confidence: "78%",
    severity: "Moderate",
    coords: "17.290° N, 78.610° E",
    frp: "19.4 MW",
    satellite: "VIIRS / S-NPP",
    detectedAt: "1 hr ago"
  },
  {
    id: 4,
    title: "Thermal Anomaly #04",
    distance: "61.0 km away",
    confidence: "65%",
    severity: "Moderate",
    coords: "17.610° N, 78.210° E",
    frp: "12.1 MW",
    satellite: "VIIRS / NOAA-20",
    detectedAt: "2 hrs ago"
  },
  {
    id: 5,
    title: "Thermal Anomaly #05",
    distance: "83.7 km away",
    confidence: "52%",
    severity: "Low",
    coords: "17.150° N, 78.820° E",
    frp: "7.8 MW",
    satellite: "MODIS / AQUA",
    detectedAt: "3 hrs ago"
  }
];

export default function NearestFiresOverlay({ visible = true }) {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      pointerEvents: "none",
      zIndex: 20,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0 4vw",
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Title Above Left Earth */}
      <div style={{
        position: "absolute",
        top: "8%",
        left: "5%",
        width: "35vw",
        maxWidth: "420px",
        textAlign: "center",
        pointerEvents: "auto"
      }}>
        <h2 style={{
          margin: 0,
          fontFamily: "'Baumans', cursive",
          fontSize: "clamp(1.2rem, 2.2vw, 2.2rem)",
          color: "#ffffff",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          textShadow: "0 0 20px rgba(245, 158, 11, 0.6), 0 0 40px rgba(239, 68, 68, 0.4)"
        }}>
          Nearest Possible Fires <span style={{ color: "#fbbf24" }}>(Top 5)</span>
        </h2>
        <div style={{
          height: "2px",
          width: "60%",
          margin: "10px auto 0 auto",
          background: "linear-gradient(90deg, transparent, #f59e0b, transparent)",
          boxShadow: "0 0 10px #f59e0b"
        }} />
      </div>

      {/* Right Column: 5 Expandable Glass Containers */}
      <div style={{
        position: "absolute",
        right: "4vw",
        top: "50%",
        transform: "translateY(-50%)",
        width: "min(420px, 42vw)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        pointerEvents: "auto",
        maxHeight: "85vh",
        overflowY: "auto",
        paddingRight: "6px"
      }}>
        {MOCK_FIRES.map((fire) => {
          const isExpanded = expandedId === fire.id;

          return (
            <div
              key={fire.id}
              onClick={() => toggleExpand(fire.id)}
              style={{
                background: isExpanded
                  ? "rgba(30, 25, 20, 0.65)"
                  : "rgba(18, 20, 28, 0.45)",
                backdropFilter: "blur(16px) saturate(180%)",
                WebkitBackdropFilter: "blur(16px) saturate(180%)",
                border: isExpanded
                  ? "1px solid rgba(245, 158, 11, 0.5)"
                  : "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: "14px",
                padding: "14px 18px",
                cursor: "pointer",
                transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: isExpanded
                  ? "0 10px 30px rgba(245, 158, 11, 0.15), 0 0 15px rgba(0, 0, 0, 0.5)"
                  : "0 4px 20px rgba(0, 0, 0, 0.3)",
                userSelect: "none"
              }}
            >
              {/* Collapsed Header Bar */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <div style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: "#ffffff",
                    letterSpacing: "0.02em"
                  }}>
                    {fire.title}
                  </div>
                  <div style={{
                    fontSize: "0.78rem",
                    color: "rgba(255, 255, 255, 0.6)",
                    marginTop: "3px"
                  }}>
                    {fire.distance} • Conf: <span style={{ color: "#2dd4bf" }}>{fire.confidence}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {/* Severity Badge */}
                  <span style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "3px 8px",
                    borderRadius: "20px",
                    background: fire.severity === "High"
                      ? "rgba(239, 68, 68, 0.25)"
                      : "rgba(245, 158, 11, 0.25)",
                    color: fire.severity === "High" ? "#ef4444" : "#f59e0b",
                    border: `1px solid ${fire.severity === "High" ? "rgba(239, 68, 68, 0.4)" : "rgba(245, 158, 11, 0.4)"}`
                  }}>
                    {fire.severity}
                  </span>

                  {/* Expand Chevron Icon */}
                  <span style={{
                    color: "rgba(255, 255, 255, 0.7)",
                    fontSize: "1.1rem",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.3s ease"
                  }}>
                    ▾
                  </span>
                </div>
              </div>

              {/* Expandable Body */}
              {isExpanded && (
                <div style={{
                  marginTop: "14px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  fontSize: "0.78rem",
                  color: "rgba(255, 255, 255, 0.8)",
                  animation: "fadeIn 0.3s ease"
                }}>
                  <div>
                    <span style={{ color: "rgba(255, 255, 255, 0.45)", display: "block" }}>GPS Coordinates</span>
                    <strong>{fire.coords}</strong>
                  </div>
                  <div>
                    <span style={{ color: "rgba(255, 255, 255, 0.45)", display: "block" }}>Radiative Power</span>
                    <strong style={{ color: "#fbbf24" }}>{fire.frp}</strong>
                  </div>
                  <div>
                    <span style={{ color: "rgba(255, 255, 255, 0.45)", display: "block" }}>Satellite Source</span>
                    <strong>{fire.satellite}</strong>
                  </div>
                  <div>
                    <span style={{ color: "rgba(255, 255, 255, 0.45)", display: "block" }}>First Detected</span>
                    <strong>{fire.detectedAt}</strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}