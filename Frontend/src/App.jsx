import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import InteractiveWorldGroup from "./components/InteractiveWorldGroup";
import LeafletMapSection from "./components/LeafletMapSection";
import ImpactAnalysisPanel from "./components/ImpactAnalysisPanel";
import { generateMockAssets, getImpactSummary } from "./data/mockImpactAssets";
import { fetchWorldPoints } from "./api";
import { MapPin } from "lucide-react";


export default function App() {
  const scrollProgressRef = useRef(0);
  const targetProgressRef = useRef(0); // Holds the target scroll destination
  const animFrameIdRef = useRef(null);
  const mapSectionRef = useRef(null);

  const [heroProgress, setHeroProgress] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [backendStatus, setBackendStatus] = useState("idle");
  const [fireList, setFireList] = useState([]);
  const [worldPoints, setWorldPoints] = useState([]);
  const [osmBackendStatus, setOsmBackendStatus] = useState("loading");
  const [selectedThreatPoint, setSelectedThreatPoint] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Impact Analysis state
  const [isImpactActive, setIsImpactActive] = useState(false);
  const [impactRadius, setImpactRadius] = useState(5);

  // Generate mock assets for the selected threat (deterministic, memoized)
  const impactAssets = useMemo(() => {
    if (!selectedThreatPoint) return [];
    return generateMockAssets(selectedThreatPoint.lat, selectedThreatPoint.lng);
  }, [selectedThreatPoint]);

  // Filtered assets for the current radius
  const impactSummary = useMemo(() => {
    if (!isImpactActive || impactAssets.length === 0) return null;
    return getImpactSummary(impactAssets, impactRadius);
  }, [isImpactActive, impactAssets, impactRadius]);

  const impactFilteredAssets = impactSummary?.filteredAssets || [];

  // Deactivate impact analysis when threat is deselected
  useEffect(() => {
    if (!selectedThreatPoint) {
      setIsImpactActive(false);
    }
  }, [selectedThreatPoint]);

  const handleImpactToggle = useCallback((active) => {
    setIsImpactActive(active);
  }, []);

  const handleRadiusChange = useCallback((radius) => {
    setImpactRadius(radius);
  }, []);

  // State for triggering map fly-to from outside the map component
  const [flyToTarget, setFlyToTarget] = useState(null);

  // Handler for "View on Map" from Top 5 anomaly cards
  const handleLocateOnMap = useCallback((fire) => {
    if (!fire || !fire._rawPoint) return;

    const rawPt = fire._rawPoint;

    // Find the matching worldPoint to use the full threat object
    const matchedPoint = worldPoints.find(
      (wp) =>
        Math.abs(wp.lat - rawPt.lat) < 0.001 &&
        Math.abs(wp.lng - rawPt.lng) < 0.001
    );

    // Use matched worldPoint if found, otherwise construct from raw data
    const threatObj = matchedPoint || {
      ...rawPt,
      lat: parseFloat(rawPt.lat),
      lng: parseFloat(rawPt.lng),
      categoryColor: rawPt.categoryColor || '#ef4444',
      categoryLabel: rawPt.categoryLabel || rawPt.type || 'Thermal Anomaly',
    };

    // Set as selected threat (syncs with sidebar detail panel + impact analysis)
    setSelectedThreatPoint(threatObj);

    // Trigger map fly-to
    setFlyToTarget({ lat: threatObj.lat, lng: threatObj.lng, _ts: Date.now() });

    // Smooth scroll to map section
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [worldPoints]);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  useEffect(() => {
    fetchWorldPoints()
      .then((data) => {
        if (!data) throw new Error("Failed to fetch world points");

        let allPoints = [];
        if (Array.isArray(data)) {
          allPoints = data.map((pt) => ({
            ...pt,
            lat: parseFloat(pt.lat || pt.latitude || 0),
            lng: parseFloat(pt.lng || pt.longitude || 0),
            categoryColor: pt.categoryColor || '#ef4444',
            categoryLabel: pt.categoryLabel || 'Thermal Anomaly'
          }));
        } else {
          const categories = [
            { key: 'green', color: '#22c55e', label: 'Forest Fire / Wildfire' },
            { key: 'yellow', color: '#eab308', label: 'Refineries / Gas Flares' },
            { key: 'red', color: '#ef4444', label: 'Industrial Facilities' },
            { key: 'orange', color: '#f97316', label: 'Other / Unclassified Active Threats' },
          ];

          categories.forEach((cat) => {
            if (data[cat.key] && Array.isArray(data[cat.key])) {
              data[cat.key].forEach((pt) => {
                allPoints.push({
                  ...pt,
                  lat: parseFloat(pt.lat || pt.latitude || 0),
                  lng: parseFloat(pt.lng || pt.longitude || 0),
                  categoryColor: cat.color,
                  categoryLabel: cat.label
                });
              });
            }
          });
        }

        setWorldPoints(allPoints);
        setOsmBackendStatus("success");
      })
      .catch((err) => {
        console.error("Error fetching /world-points/:", err);
        setOsmBackendStatus("error");
      });
  }, []);

  // Smooth LERP (Linear Interpolation) Loop for continuous rotation animation
  useEffect(() => {
    const updatePhysics = () => {
      const current = scrollProgressRef.current;
      const target = targetProgressRef.current;

      // Smooth dampening factor (0.08 gives a weightful, glided roll)
      const diff = target - current;

      if (Math.abs(diff) > 0.0001) {
        scrollProgressRef.current += diff * 0.08;
      } else {
        scrollProgressRef.current = target;
      }

      // Unlock body scroll once fully rolled to destination
      if (scrollProgressRef.current >= 0.99) {
        setIsUnlocked(true);
      } else {
        setIsUnlocked(false);
      }

      animFrameIdRef.current = requestAnimationFrame(updatePhysics);
    };

    animFrameIdRef.current = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animFrameIdRef.current);
  }, []);

  // Wheel & Key Event Handlers updating Target Progress
  useEffect(() => {
    const handleWheel = (e) => {
      const atTop = window.scrollY <= 5;
      const currentTarget = targetProgressRef.current;

      if (currentTarget < 1 || (atTop && e.deltaY < 0)) {
        e.preventDefault();

        const delta = e.deltaY * 0.0015;
        const nextTarget = Math.min(1, Math.max(0, currentTarget + delta));

        targetProgressRef.current = nextTarget;
      }
    };

    const handleKeydown = (e) => {
      const atTop = window.scrollY <= 5;
      const currentTarget = targetProgressRef.current;
      const step = 0.25;

      if (currentTarget < 1 || (atTop && ["ArrowUp", "PageUp"].includes(e.code))) {
        if (["ArrowDown", "PageDown", "Space"].includes(e.code)) {
          e.preventDefault();
          targetProgressRef.current = Math.min(1, currentTarget + step);
        } else if (["ArrowUp", "PageUp"].includes(e.code) && atTop) {
          e.preventDefault();
          targetProgressRef.current = Math.max(0, currentTarget - step);
        }
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = isUnlocked ? "auto" : "hidden";
    document.body.style.scrollbarGutter = "stable";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isUnlocked]);

  // Interpolated opacity values based on smooth heroProgress
  const landingOpacity = Math.max(0, 1 - heroProgress * 1.3);
  const overlayOpacity = Math.min(1, Math.max(0, (heroProgress - 0.3) / 0.7));

  const handleScanClick = () => {
    targetProgressRef.current = 1;
  };

  const filteredWorldPoints = worldPoints.filter((pt) => {
    if (!searchQuery) return true;
    const nameMatch = pt.name ? pt.name.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const catMatch = pt.categoryLabel ? pt.categoryLabel.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    return nameMatch || catMatch;
  });

  return (
    <div style={{
      color: '#ffffff',
      position: 'relative',
      overflowX: 'hidden',
      backgroundColor: '#030205',
      backgroundImage: `
        repeating-linear-gradient(-35deg, rgba(255, 255, 255, 0.012) 0px, rgba(255, 255, 255, 0.012) 1px, transparent 1px, transparent 90px),
        radial-gradient(ellipse at 78% 28%, rgba(150, 18, 18, 0.12) 0%, transparent 45%),
        radial-gradient(ellipse at 22% 72%, rgba(110, 12, 22, 0.09) 0%, transparent 40%),
        radial-gradient(circle at 50% 50%, rgba(80, 8, 14, 0.14) 0%, transparent 70%)
      `,
      backgroundAttachment: 'fixed'
    }}>

      {/* Sticky Hero Viewport Container */}
      <div style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 65% 50%, rgba(185, 28, 28, 0.12) 0%, rgba(154, 26, 26, 0.04) 40%, rgba(3, 2, 5, 0.85) 80%)'
      }}>

        {/* Title & Primary Copy Overlay */}
        <div style={{
          position: 'absolute',
          left: '6vw',
          top: '50%',
          transform: 'translateY(-50%)',
          maxWidth: '580px',
          zIndex: 10,
          opacity: landingOpacity,
          pointerEvents: landingOpacity < 0.05 ? 'none' : 'auto',
          transition: 'opacity 0.2s ease-out',
          userSelect: 'none'
        }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: '#f97316',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ width: '24px', height: '2px', background: '#f97316' }} />
            Orbital Threat Defense System
          </div>

          <h1 style={{
            fontFamily: "'Baumans', cursive",
            fontSize: 'clamp(3rem, 6vw, 5.5rem)',
            fontWeight: 700,
            lineHeight: 1,
            color: '#ffffff',
            margin: '0 0 20px 0',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            AGNIKAVACH
          </h1>

          <p style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 'clamp(0.95rem, 1.1vw, 1.1rem)',
            lineHeight: 1.6,
            color: 'rgba(255, 255, 255, 0.72)',
            margin: '0 0 32px 0',
            maxWidth: '500px'
          }}>
            Harnessing real-time satellite thermal telemetry to pinpoint wildfires, industrial flares, and critical heat anomalies across the planet before they ignite disaster.
          </p>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={handleScanClick}
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(239, 68, 68, 0.2))',
                border: '1px solid rgba(245, 158, 11, 0.8)',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '14px 32px',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 0 20px rgba(245, 158, 11, 0.25)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f59e0b';
                e.currentTarget.style.color = '#000000';
                e.currentTarget.style.borderColor = '#f59e0b';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(245, 158, 11, 0.6)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(239, 68, 68, 0.2))';
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.8)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.25)';
              }}
            >
              Initiate Thermal Scan
            </button>
          </div>
        </div>

        {/* Telemetry Footer */}
        <div style={{
          position: 'absolute',
          right: '3vw',
          bottom: '4vh',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
          fontFamily: "'Courier New', monospace",
          fontSize: '0.7rem',
          letterSpacing: '0.1em',
          color: 'rgba(255, 255, 255, 0.45)',
          opacity: landingOpacity,
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease-out'
        }}>
          <div>SATELLITE: NOAA-20 / VIIRS_NRT</div>
          <div>BANDS: I4 (3.74 μm) • I5 (11.45 μm)</div>
        </div>

        {/* 3D Canvas Layer */}
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'translateX(4vw)'
        }}>
          <Canvas
            camera={{ position: [0, 0, 14], fov: 45 }}
            shadows={false}
            gl={{ alpha: true, antialias: true }}
            style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}
          >
            <ambientLight intensity={1.8} />
            <directionalLight
              position={[0, 10, 10]}
              intensity={1.5}
              castShadow={false}
            />

            <React.Suspense fallback={null}>
              <InteractiveWorldGroup
                scrollProgressRef={scrollProgressRef}
                onProgressChange={setHeroProgress}
                onBackendStatusChange={setBackendStatus}
                selectedPointId={expandedId}
                onSelectPoint={(id) => setExpandedId(id)}
                onFiresFetched={(points) => {
                  const formatted = points.slice(0, 5).map((pt, index) => ({
                    id: pt.id || index + 1,
                    title: pt.name || `Thermal Anomaly #${index + 1}`,
                    distance: `${pt.distance_km.toFixed(1)} km away`,
                    confidence: `${(pt.score * 100).toFixed(0)}%`,
                    severity: pt.frp_mw > 100 ? "High" : pt.frp_mw > 40 ? "Moderate" : "Low",
                    coords: `${pt.lat.toFixed(3)}° N, ${pt.lng.toFixed(3)}° E`,
                    frp: `${pt.frp_mw} MW`,
                    satellite: "VIIRS / NOAA-20",
                    detectedAt: pt.acq_date,
                    _rawPoint: pt,
                  }));
                  setFireList(formatted);
                }}
              />
            </React.Suspense>
          </Canvas>
        </div>

        {/* Anomaly Cards Layer */}
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          pointerEvents: heroProgress > 0.8 ? 'auto' : 'none',
          opacity: overlayOpacity,
          transition: 'opacity 0.2s ease-out'
        }}>
          <div style={{
            position: 'absolute',
            top: '12%',
            left: '6vw',
            width: '36vw',
            maxWidth: '460px',
            textAlign: 'center'
          }}>
            <h2 style={{
              margin: 0,
              fontFamily: "'Baumans', cursive",
              fontSize: 'clamp(1.1rem, 2vw, 1.9rem)',
              color: '#f97316',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: '10px',
              flexWrap: 'nowrap'
            }}>
              <span>Nearest Active Anomalies</span>
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '0.65em',
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.85)',
                letterSpacing: '0.03em',
                textTransform: 'none'
              }}>
                (Top 5)
              </span>
            </h2>

            <div style={{
              height: '2px',
              width: '70%',
              margin: '12px auto 0 auto',
              background: 'linear-gradient(90deg, transparent, #f97316, transparent)'
            }} />
          </div>

          <div style={{
            position: 'absolute',
            right: '10vw',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 'min(420px, 42vw)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            maxHeight: '82vh',
            overflowY: 'auto',
            paddingRight: '6px'
          }}>
            {backendStatus === "location_error" ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '14px',
                padding: '24px',
                textAlign: 'center',
                color: '#ef4444',
                fontFamily: "'Inter', sans-serif"
              }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 650 }}>Location Disabled</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Enable location access to calculate proximity vectors for nearby thermal anomalies.
                </p>
              </div>
            ) : backendStatus === "error" ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '14px',
                padding: '24px',
                textAlign: 'center',
                color: '#ef4444',
                fontFamily: "'Inter', sans-serif"
              }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', fontWeight: 650 }}>Satellite Feed Offline</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                  Unable to contact thermal API backend. Please verify your network telemetry.
                </p>
              </div>
            ) : backendStatus === "loading" ? (
              <div style={{
                background: 'rgba(15, 23, 30, 0.5)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '14px',
                padding: '24px',
                textAlign: 'center',
                color: '#f59e0b',
                fontFamily: "'Inter', sans-serif"
              }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Acquiring satellite thermal passes...</p>
              </div>
            ) : (
              fireList.map((fire) => {
                const isExpanded = expandedId === fire.id;

                return (
                  <div
                    key={fire.id}
                    onClick={() => toggleExpand(fire.id)}
                    style={{
                      background: isExpanded
                        ? 'rgba(20, 30, 42, 0.85)'
                        : 'rgba(15, 23, 30, 0.6)',
                      backdropFilter: 'blur(16px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                      border: isExpanded
                        ? '1px solid rgba(245, 158, 11, 0.6)'
                        : '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '14px',
                      padding: '16px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                      boxShadow: isExpanded
                        ? '0 10px 30px rgba(245, 158, 11, 0.2), 0 0 15px rgba(0, 0, 0, 0.5)'
                        : '0 4px 20px rgba(0, 0, 0, 0.3)',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', letterSpacing: '0.02em' }}>
                          {fire.title}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                          {fire.distance} • Conf: <span style={{ color: '#f59e0b' }}>{fire.confidence}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          padding: '3px 8px',
                          borderRadius: '20px',
                          background: fire.severity === 'High'
                            ? 'rgba(239, 68, 68, 0.25)'
                            : 'rgba(245, 158, 11, 0.25)',
                          color: fire.severity === 'High' ? '#ef4444' : '#f59e0b',
                          border: `1px solid ${fire.severity === 'High' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                        }}>
                          {fire.severity}
                        </span>

                        <span style={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: '1.1rem',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.3s ease'
                        }}>
                          ▾
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{
                        marginTop: '14px',
                        paddingTop: '12px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        fontSize: '0.78rem',
                        color: 'rgba(255, 255, 255, 0.8)'
                      }}>
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block' }}>GPS Coordinates</span>
                          <strong style={{ fontFamily: "'Courier New', monospace" }}>{fire.coords}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block' }}>Radiative Power</span>
                          <strong style={{ color: '#f59e0b' }}>{fire.frp}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block' }}>Satellite Source</span>
                          <strong>{fire.satellite}</strong>
                        </div>
                        <div>
                          <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block' }}>First Detected</span>
                          <strong>{fire.detectedAt}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleLocateOnMap(fire);
                          }}
                          style={{
                            gridColumn: '1 / -1',
                            width: '100%',
                            marginTop: '4px',
                            padding: '10px 16px',
                            borderRadius: '8px',
                            border: '1px solid rgba(245, 158, 11, 0.5)',
                            background: 'rgba(245, 158, 11, 0.08)',
                            color: '#fbbf24',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            transition: 'all 0.25s ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: '0 0 10px rgba(245, 158, 11, 0.08)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.18)';
                            e.currentTarget.style.boxShadow = '0 0 18px rgba(245, 158, 11, 0.22)';
                            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.75)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.08)';
                            e.currentTarget.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.08)';
                            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                          }}
                        >
                          <MapPin size={13} strokeWidth={2.5} />
                          View on Map
                        </button>

                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Downstream Interactive Map Section */}
      <section
        ref={mapSectionRef}
        style={{
          position: 'relative',
          zIndex: 30,
          padding: '36px 6vw 24px 6vw',
          backgroundColor: 'transparent',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: '#f59e0b', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Interactive Threat Mapping
          </div>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 2.5vw, 2.2rem)',
            fontWeight: 'bold',
            fontFamily: "'Baumans', cursive",
            color: '#ffffff',
            margin: 0
          }}>
            Global Thermal Anomaly Grid
          </h2>
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{
            flex: '1 1 68%',
            minHeight: '520px',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}>
            {osmBackendStatus === "error" ? (
              <div style={{
                width: '100%',
                height: '100%',
                background: 'rgba(239, 68, 68, 0.15)',
                backdropFilter: 'blur(16px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: '#ef4444',
                fontFamily: "'Inter', sans-serif",
                padding: '24px'
              }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 650 }}>Backend Telemetry Unavailable</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.7)', maxWidth: '360px' }}>
                  Unable to connect to the global anomaly endpoint. Please verify server connectivity.
                </p>
              </div>
            ) : (
              <LeafletMapSection
                points={filteredWorldPoints}
                onMarkerClick={setSelectedThreatPoint}
                impactActive={isImpactActive}
                impactThreatPoint={isImpactActive ? selectedThreatPoint : null}
                impactRadiusKm={impactRadius}
                impactFilteredAssets={impactFilteredAssets}
                flyToTarget={flyToTarget}
                selectedThreatPoint={selectedThreatPoint}
              />
            )}
          </div>

          <div style={{
            flex: '1 1 28%',
            minWidth: '280px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '16px',
            fontFamily: "'Inter', sans-serif"
          }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type="text"
                placeholder="Filter threat locations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(15, 23, 30, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: '#fff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                }}
              />
            </div>

            {selectedThreatPoint ? (
              <div style={{
                flex: 1,
                background: 'rgba(15, 23, 30, 0.9)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                borderRadius: '14px',
                padding: '20px',
                position: 'relative',
                boxShadow: '0 8px 25px rgba(245, 158, 11, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                overflowY: 'auto',
                maxHeight: '70vh',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff' }}>
                    {selectedThreatPoint.name || 'Selected Threat'}
                  </div>
                  <button
                    onClick={() => { setSelectedThreatPoint(null); setIsImpactActive(false); }}
                    style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '1rem' }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.82rem', color: 'rgba(255, 255, 255, 0.85)' }}>
                  <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', marginBottom: '4px' }}>Classification</span>
                    <strong style={{ color: '#ffffff', fontSize: '0.9rem' }}>{selectedThreatPoint.categoryLabel || selectedThreatPoint.type}</strong>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', marginBottom: '4px' }}>Latitude</span>
                      <strong style={{ fontFamily: "'Courier New', monospace" }}>{selectedThreatPoint.lat ? selectedThreatPoint.lat.toFixed(4) : '--'}°</strong>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', marginBottom: '4px' }}>Longitude</span>
                      <strong style={{ fontFamily: "'Courier New', monospace" }}>{selectedThreatPoint.lng ? selectedThreatPoint.lng.toFixed(4) : '--'}°</strong>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', marginBottom: '4px' }}>Radiative Power</span>
                      <strong style={{ color: '#f59e0b', fontSize: '0.9rem' }}>{selectedThreatPoint.frp_mw || '--'} MW</strong>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', marginBottom: '4px' }}>Confidence Score</span>
                      <strong>{selectedThreatPoint.score ? `${(selectedThreatPoint.score * 100).toFixed(1)}%` : 'N/A'}</strong>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
                    <span style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'block', marginBottom: '4px' }}>Detection Timestamp</span>
                    <strong>{selectedThreatPoint.acq_date || 'Live Stream / Recent Pass'}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      console.info("PDF export will be available soon.");
                    }}
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '1px solid rgba(245, 158, 11, 0.75)',
                      background: 'rgba(245, 158, 11, 0.10)',
                      color: '#fbbf24',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      boxShadow: '0 0 14px rgba(245, 158, 11, 0.10)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(245, 158, 11, 0.22)';
                      e.currentTarget.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.28)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(245, 158, 11, 0.10)';
                      e.currentTarget.style.boxShadow = '0 0 14px rgba(245, 158, 11, 0.10)';
                    }}
                  >
                    ↓ Export as PDF
                  </button>

                  {/* Impact Analysis Panel */}
                  <ImpactAnalysisPanel
                    selectedThreatPoint={selectedThreatPoint}
                    isActive={isImpactActive}
                    onToggle={handleImpactToggle}
                    activeRadius={impactRadius}
                    onRadiusChange={handleRadiusChange}
                  />
                </div>
              </div>
            ) : (
              <div style={{
                flex: 1,
                background: 'rgba(15, 23, 30, 0.35)',
                border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: '14px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '0.85rem'
              }}>
                Click any marker on the map to inspect live threat details.
              </div>
            )}

            <div style={{
              background: 'rgba(15, 23, 30, 0.6)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '14px',
              padding: '18px 20px'
            }}>
              <h3 style={{
                margin: '0 0 10px 0',
                fontFamily: "'Baumans', cursive",
                fontSize: '1.1rem',
                color: '#f59e0b',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Threat Legend
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)' }} />
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                    Forest Fire / Wildfire
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 8px rgba(234, 179, 8, 0.6)' }} />
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                    Refineries / Gas Flares
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)' }} />
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                    Industrial Facilities
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f97316', boxShadow: '0 0 8px rgba(249, 115, 22, 0.6)' }} />
                  <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                    Other Active Threats
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}