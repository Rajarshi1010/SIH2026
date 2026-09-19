/**
 * AGNIKAVACH â€” Impact Analysis Panel (Polished)
 *
 * Renders inside the existing threat detail sidebar.
 * Shows radius controls, exposure level indicator, population estimate,
 * contextual summary sentence, and grouped infrastructure statistics.
 *
 * âš  PROTOTYPE â€” Population and asset data are simulated.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { generateMockAssets, getImpactSummary } from '../data/mockImpactAssets';
import {
  Building2, GraduationCap, Flame, Factory, Zap, Users,
} from 'lucide-react';

const RADII = [1, 5, 10];

const ASSET_DISPLAY = [
  { type: 'hospital', Icon: Building2, label: 'Hospitals', color: '#ef4444' },
  { type: 'school', Icon: GraduationCap, label: 'Schools', color: '#3b82f6' },
  { type: 'fire_station', Icon: Flame, label: 'Fire Stations', color: '#f97316' },
  { type: 'industry', Icon: Factory, label: 'Industries', color: '#a855f7' },
  { type: 'power', Icon: Zap, label: 'Power Sites', color: '#eab308' },
  { type: 'settlement', Icon: Users, label: 'Settlements', color: '#22c55e' },
];

/**
 * Derive an exposure level from the summary data.
 * Entirely based on mock contextual data â€” NOT the existing fire risk score.
 */
function getExposureLevel(summary) {
  if (!summary) return { label: 'â€”', color: '#555', bg: 'transparent' };
  const { totalAssets, populationEstimate } = summary;

  if (populationEstimate > 15000 || totalAssets > 25) {
    return { label: 'CRITICAL', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' };
  }
  if (populationEstimate > 6000 || totalAssets > 12) {
    return { label: 'HIGH', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' };
  }
  if (populationEstimate > 2000 || totalAssets > 5) {
    return { label: 'MODERATE', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)' };
  }
  return { label: 'LOW', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.10)' };
}

export default function ImpactAnalysisPanel({
  selectedThreatPoint,
  isActive,
  onToggle,
  activeRadius,
  onRadiusChange,
}) {
  const [hoveredRadius, setHoveredRadius] = useState(null);

  // Generate deterministic assets for the selected threat
  const allAssets = useMemo(() => {
    if (!selectedThreatPoint) return [];
    return generateMockAssets(selectedThreatPoint.lat, selectedThreatPoint.lng);
  }, [selectedThreatPoint]);

  // Get summary for current radius
  const summary = useMemo(() => {
    if (!isActive || allAssets.length === 0) return null;
    return getImpactSummary(allAssets, activeRadius);
  }, [isActive, allAssets, activeRadius]);

  const exposure = useMemo(() => getExposureLevel(summary), [summary]);

  const handleToggle = useCallback(() => {
    onToggle(!isActive);
  }, [isActive, onToggle]);

  if (!selectedThreatPoint) return null;

  return (
    <div style={{
      marginTop: '16px',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      paddingTop: '16px',
    }}>
      {/* Section header + toggle */}
      <button
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: isActive
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(245, 158, 11, 0.10))'
            : 'rgba(245, 158, 11, 0.08)',
          border: isActive
            ? '1px solid rgba(239, 68, 68, 0.4)'
            : '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          padding: '10px 14px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: isActive
            ? '0 0 16px rgba(239, 68, 68, 0.15)'
            : 'none',
        }}
      >
        <span style={{
          fontFamily: "'Baumans', cursive",
          fontSize: '0.78rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isActive ? '#ef4444' : '#f59e0b',
        }}>
          Impact Analysis
        </span>
        <span style={{
          fontSize: '0.7rem',
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          color: isActive ? '#ef4444' : 'rgba(255, 255, 255, 0.5)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {isActive ? 'â— ACTIVE' : 'ACTIVATE'}
        </span>
      </button>

      {/* Impact analysis content */}
      {isActive && (
        <div style={{
          marginTop: '12px',
          animation: 'fadeInImpact 0.35s ease-out',
        }}>
          {/* Radius selector */}
          <div style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '14px',
          }}>
            {RADII.map((r) => {
              const isSelected = activeRadius === r;
              const isHovered = hoveredRadius === r;
              return (
                <button
                  key={r}
                  onClick={() => onRadiusChange(r)}
                  onMouseEnter={() => setHoveredRadius(r)}
                  onMouseLeave={() => setHoveredRadius(null)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    borderRadius: '6px',
                    border: isSelected
                      ? '1px solid rgba(239, 68, 68, 0.6)'
                      : '1px solid rgba(255, 255, 255, 0.12)',
                    background: isSelected
                      ? 'rgba(239, 68, 68, 0.18)'
                      : isHovered
                        ? 'rgba(255, 255, 255, 0.06)'
                        : 'rgba(255, 255, 255, 0.03)',
                    color: isSelected ? '#ef4444' : 'rgba(255, 255, 255, 0.7)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    fontFamily: "'Courier New', monospace",
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    boxShadow: isSelected
                      ? '0 0 10px rgba(239, 68, 68, 0.12)'
                      : 'none',
                  }}
                >
                  {r} KM
                </button>
              );
            })}
          </div>

          {summary && (
            <>
              {/* â”€â”€ Primary: Estimated Exposure â”€â”€ */}
              <div style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.18)',
                borderRadius: '10px',
                padding: '14px 16px 12px',
                marginBottom: '10px',
                textAlign: 'center',
              }}>
                <div style={{
                  fontSize: '0.6rem',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                }}>
                  Estimated Exposure
                </div>
                <div style={{
                  fontSize: '1.6rem',
                  fontWeight: 700,
                  fontFamily: "'Courier New', monospace",
                  color: '#ffffff',
                  letterSpacing: '0.03em',
                  lineHeight: 1,
                }}>
                  {summary.populationEstimate.toLocaleString()}
                </div>
                <div style={{
                  fontSize: '0.62rem',
                  color: 'rgba(255, 255, 255, 0.38)',
                  fontFamily: "'Inter', sans-serif",
                  marginTop: '5px',
                }}>
                  people within {activeRadius} km radius
                </div>

                {/* Exposure level indicator */}
                <div style={{
                  marginTop: '10px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  background: exposure.bg,
                  border: `1px solid ${exposure.color}33`,
                }}>
                  <span style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: exposure.color,
                    boxShadow: `0 0 6px ${exposure.color}`,
                  }} />
                  <span style={{
                    fontSize: '0.58rem',
                    fontWeight: 700,
                    fontFamily: "'Inter', sans-serif",
                    letterSpacing: '0.1em',
                    color: exposure.color,
                  }}>
                    EXPOSURE: {exposure.label}
                  </span>
                </div>
              </div>

              {/* â”€â”€ Contextual sentence â”€â”€ */}
              <div style={{
                fontSize: '0.68rem',
                color: 'rgba(255, 255, 255, 0.5)',
                fontFamily: "'Inter', sans-serif",
                lineHeight: 1.45,
                padding: '0 2px',
                marginBottom: '12px',
              }}>
                {activeRadius} km zone contains{' '}
                <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: 600 }}>
                  {summary.totalAssets} mapped assets
                </span>{' '}
                requiring situational awareness.
              </div>

              {/* â”€â”€ Infrastructure breakdown â”€â”€ */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                padding: '10px',
              }}>
                <div style={{
                  fontSize: '0.58rem',
                  color: 'rgba(255, 255, 255, 0.35)',
                  fontFamily: "'Inter', sans-serif",
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                }}>
                  Nearby Infrastructure
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '4px',
                }}>
                  {ASSET_DISPLAY.map(({ type, Icon, label, color }) => {
                    const count = summary.counts[type] || 0;
                    const hasItems = count > 0;
                    return (
                      <div
                        key={type}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          padding: '6px 8px',
                          borderRadius: '5px',
                          background: hasItems
                            ? 'rgba(255, 255, 255, 0.03)'
                            : 'transparent',
                          transition: 'background 0.2s ease',
                          opacity: hasItems ? 1 : 0.4,
                        }}
                      >
                        <Icon
                          size={13}
                          color={hasItems ? color : 'rgba(255,255,255,0.3)'}
                          strokeWidth={2}
                          style={{ flexShrink: 0 }}
                        />
                        <div style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '4px',
                          minWidth: 0,
                        }}>
                          <span style={{
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            fontFamily: "'Courier New', monospace",
                            color: hasItems ? '#ffffff' : 'rgba(255, 255, 255, 0.3)',
                            lineHeight: 1,
                          }}>
                            {count}
                          </span>
                          <span style={{
                            fontSize: '0.58rem',
                            color: 'rgba(255, 255, 255, 0.42)',
                            fontFamily: "'Inter', sans-serif",
                            letterSpacing: '0.01em',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* â”€â”€ Prototype disclaimer â”€â”€ */}
              <div style={{
                marginTop: '10px',
                fontSize: '0.56rem',
                color: 'rgba(255, 255, 255, 0.28)',
                fontFamily: "'Inter', sans-serif",
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <span style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.45)',
                  display: 'inline-block',
                  flexShrink: 0,
                }} />
                Simulated Impact Layer â€” Prototype Data
              </div>
            </>
          )}

          {/* Close button */}
          <button
            onClick={handleToggle}
            style={{
              width: '100%',
              marginTop: '10px',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '0.7rem',
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
            }}
          >
            Hide Impact Layer
          </button>
        </div>
      )}

      {/* Inline CSS animations & tooltip overrides */}
      <style>{`
        @keyframes fadeInImpact {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes threatPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.15); }
        }

        .agni-threat-pulse {
          animation: threatPulse 2.4s ease-in-out infinite;
          transform-origin: center;
        }

        .agni-asset-icon {
          background: transparent !important;
          border: none !important;
        }

        .impact-radius-tooltip {
          background: rgba(10, 10, 15, 0.88) !important;
          border: 1px solid rgba(239, 68, 68, 0.25) !important;
          border-radius: 4px !important;
          padding: 3px 8px !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
        }
        .impact-radius-tooltip::before {
          border-top-color: rgba(10, 10, 15, 0.88) !important;
        }

        .asset-marker-tooltip {
          background: rgba(15, 23, 30, 0.94) !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 6px !important;
          padding: 6px 10px !important;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55) !important;
        }
      `}</style>
    </div>
  );
}
