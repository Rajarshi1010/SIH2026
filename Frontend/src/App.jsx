import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import InteractiveWorldGroup from "./components/InteractiveWorldGroup";
import LeafletMapSection from "./components/LeafletMapSection";
import { fetchGisFeatures } from "./api";
import { CLASSIFICATIONS, CLASSIFICATION_KEYS } from "./classifications";
import ThreatAnalysisPanel from "./components/ThreatAnalysisPanel";
import NearestAnomalies from "./components/NearestAnomalies";


// Below this width the hero stacks and the scroll hijack is switched off.
const MOBILE_BREAKPOINT = 860;

function useIsMobile() {
  const query = `(max-width: ${MOBILE_BREAKPOINT}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}

const HERO_STATS = [
  { value: '5-day', label: 'window' },
  { value: 'VIIRS', label: 'sensor' },
  { value: '45 min', label: 'refresh' },
];

export default function App() {
  const scrollProgressRef = useRef(0);
  const targetProgressRef = useRef(0); // Holds the target scroll destination
  const animFrameIdRef = useRef(null);
  const pendingMapScrollRef = useRef(false);

  const isMobile = useIsMobile();
  const [heroProgress, setHeroProgress] = useState(0);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [, setBackendStatus] = useState("idle");
  const [fireList, setFireList] = useState([]);
  const [worldPoints, setWorldPoints] = useState([]);
  const [osmBackendStatus, setOsmBackendStatus] = useState("loading");
  const [selectedThreatPoint, setSelectedThreatPoint] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState(() => CLASSIFICATION_KEYS);
  const [detailPoint, setDetailPoint] = useState(null);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19));
  const mapSectionRef = useRef(null);
  const [notifiedIds, setNotifiedIds] = useState([]);

  useEffect(() => {
    const tick = setInterval(() => setUtcClock(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(tick);
  }, []);

  const toggleCategory = (label) => {
    setActiveCategories((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

  useEffect(() => {
    fetchGisFeatures({ limit: 500 })
      .then((features) => {
        setWorldPoints(features);
        setOsmBackendStatus("success");
      })
      .catch((err) => {
        console.error("Error fetching /gis/features:", err);
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

  // Wheel & Key Event Handlers updating Target Progress.
  // Not registered on mobile: there is no wheel event on touch, so hijacking
  // scroll there would leave the page locked with no way to advance. Mobile
  // scrolls natively and drives the roll from the CTA instead.
  useEffect(() => {
    if (isMobile) return undefined;

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
  }, [isMobile]);

  useEffect(() => {
    // Lock on <html>, not <body>: <body> overflow never stops the viewport from
    // scrolling, it only turns <body> into a scroll container — which silently
    // kills the sticky hero's pinning and clips the globe on scroll.
    document.documentElement.style.overflow = isUnlocked || isMobile ? "" : "hidden";
    document.body.style.scrollbarGutter = "stable";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [isUnlocked, isMobile]);

  useEffect(() => {
    if (!isUnlocked || !pendingMapScrollRef.current) return;
    pendingMapScrollRef.current = false;
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isUnlocked]);

  // Interpolated opacity values based on smooth heroProgress
  const landingOpacity = Math.max(0, 1 - heroProgress * 1.3);
  const overlayOpacity = Math.min(1, Math.max(0, (heroProgress - 0.3) / 0.7));

  // "Open live dashboard" -> the threat map below. On desktop the page is still
  // scroll-locked until the roll finishes, so the scroll is queued and fired by
  // the effect below once the lock lifts. Mobile is never locked, so it goes now.
  const handleScanClick = () => {
    if (isMobile) {
      mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    pendingMapScrollRef.current = true;
    targetProgressRef.current = 1;
  };

  // "Find threats near me" -> the nearest-anomalies panel. Rolling to 1 fades the
  // landing copy out, slides the globe left and brings the panel up in its place,
  // so the destination is already on screen — no scroll.
  const handleFindNearby = () => {
    pendingMapScrollRef.current = false;
    targetProgressRef.current = 1;
  };

  const filteredWorldPoints = worldPoints.filter((pt) => {
    if (!activeCategories.includes(pt.classification)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (pt.classificationLabel || '').toLowerCase().includes(q) ||
      (pt.satellite || '').toLowerCase().includes(q) ||
      (pt.h3_index || '').toLowerCase().includes(q) ||
      (pt.emitter_id || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{
      color: '#E8EDF5',
      position: 'relative',
      overflowX: 'clip',
      backgroundColor: '#030205',
      backgroundImage: `
        repeating-linear-gradient(-35deg, rgba(255, 255, 255, 0.012) 0px, rgba(255, 255, 255, 0.012) 1px, transparent 1px, transparent 90px),
        radial-gradient(ellipse at 78% 28%, rgba(150, 18, 18, 0.08) 0%, transparent 45%),
        radial-gradient(ellipse at 22% 72%, rgba(110, 12, 22, 0.06) 0%, transparent 40%),
        radial-gradient(circle at 50% 50%, rgba(80, 8, 14, 0.08) 0%, transparent 70%)
      `,
      backgroundAttachment: 'fixed'
    }}>

      {/* Hero Viewport Container — deliberately not sticky: scroll is locked
          until the globe finishes rolling, so there is nothing to pin against,
          and pinning afterwards just leaves the hero showing under the
          sections that scroll over it. */}
      <div style={{
        position: 'relative',
        // On mobile the hero grows past 100vh rather than clipping: a short
        // viewport would otherwise squeeze the globe to a sliver, and there is
        // no scroll lock on mobile so the page can simply be longer.
        height: isMobile ? 'auto' : '100vh',
        minHeight: isMobile ? '100vh' : undefined,
        width: '100%',
        overflow: isMobile ? 'visible' : 'hidden',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-start' : 'center',
        background: 'radial-gradient(circle at 58% 50%, rgba(185, 28, 28, 0.09) 0%, rgba(154, 26, 26, 0.03) 40%, rgba(3, 2, 5, 0.85) 80%)'
      }}>

        {/* Top status bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: isMobile ? '14px 1.25rem' : '16px 2rem',
          borderBottom: '1px solid #2C3648',
          opacity: landingOpacity,
          pointerEvents: landingOpacity < 0.05 ? 'none' : 'auto',
          transition: 'opacity 0.2s ease-out',
          userSelect: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              border: '1.5px solid #F59E0B',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0
            }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#F59E0B' }} />
            </span>

            <div>
              <div style={{
                fontFamily: "'Baumans', cursive",
                fontSize: '1.15rem',
                letterSpacing: '0.09em',
                lineHeight: 1,
                color: '#E8EDF5',
                textTransform: 'uppercase'
              }}>
                AGNIKAVACH
              </div>
              <div style={{
                display: isMobile ? 'none' : 'block',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: '0.68rem',
                letterSpacing: '0.11em',
                color: '#7E91B1',
                marginTop: '5px'
              }}>
                thermal anomaly intelligence
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: '0.72rem',
            letterSpacing: '0.09em'
          }}>
            <span style={{ color: '#E8EDF5' }}>
              {utcClock} <span style={{ color: '#7E91B1' }}>UTC</span>
            </span>

            <span style={{
              display: isMobile ? 'none' : 'inline',
              borderLeft: '1px solid #2C3648',
              paddingLeft: '12px',
              color: '#7E91B1'
            }}>
              NASA FIRMS
            </span>
          </div>
        </div>

        {/* Hero copy — left column on desktop, top half of the stack on mobile */}
        <div style={{
          position: isMobile ? 'relative' : 'absolute',
          left: isMobile ? 'auto' : 0,
          top: isMobile ? 'auto' : 0,
          flex: isMobile ? '0 0 auto' : undefined,
          height: isMobile ? 'auto' : '100%',
          width: isMobile ? '100%' : '45%',
          minWidth: isMobile ? 0 : '340px',
          display: isMobile && landingOpacity < 0.05 ? 'none' : 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: isMobile ? '88px 1.25rem 4px' : '0 2rem 0 4vw',
          zIndex: 10,
          opacity: landingOpacity,
          pointerEvents: landingOpacity < 0.05 ? 'none' : 'auto',
          transition: 'opacity 0.2s ease-out',
          userSelect: 'none'
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: '0.75rem',
            fontWeight: 500,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#F59E0B',
            marginBottom: isMobile ? '14px' : '22px'
          }}>
            Satellite Thermal Intelligence
          </div>

          <h1 style={{
            fontFamily: "'Baumans', cursive",
            fontSize: 'clamp(2.6rem, 5.2vw, 4.6rem)',
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#E8EDF5',
            margin: isMobile ? '0 0 12px 0' : '0 0 18px 0'
          }}>
            AGNIKAVACH
          </h1>

          <p style={{
            fontFamily: "'Noto Sans', sans-serif",
            fontSize: 'clamp(1.15rem, 1.6vw, 1.5rem)',
            fontWeight: 300,
            lineHeight: 1.3,
            letterSpacing: '-0.012em',
            color: '#E8EDF5',
            margin: '0 0 18px 0'
          }}>
            A shield that never blinks.
            <br />
            <span style={{ opacity: 0.3 }}>Thermal watch over every square kilometre.</span>
          </p>

          <p style={{
            fontFamily: "'Noto Sans', sans-serif",
            fontSize: 'clamp(1rem, 1.1vw, 1.1rem)',
            lineHeight: 1.65,
            color: '#AAB7CC',
            margin: isMobile ? '0 0 20px 0' : '0 0 32px 0',
            maxWidth: '500px'
          }}>
            Live NASA FIRMS detections fused with months of historical persistence, sorted
            into eight threat classes, from routine gas flares to unmapped industrial
            accidents.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={handleScanClick}
              style={{
                background: '#F59E0B',
                border: '1px solid #F59E0B',
                borderRadius: '8px',
                color: '#150E02',
                padding: '13px 26px',
                fontSize: '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s ease, border-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FFB224';
                e.currentTarget.style.borderColor = '#FFB224';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#F59E0B';
                e.currentTarget.style.borderColor = '#F59E0B';
              }}
            >
              Open live dashboard
            </button>

            <button
              onClick={handleFindNearby}
              style={{
                background: '#182236',
                border: '1px solid #3D4A63',
                borderRadius: '8px',
                color: '#AAB7CC',
                padding: '13px 26px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.2s ease, color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#24304A';
                e.currentTarget.style.color = '#E8EDF5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#182236';
                e.currentTarget.style.color = '#AAB7CC';
              }}
            >
              Find threats near me
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: isMobile ? '20px' : '30px' }}>
            {HERO_STATS.map((stat, i) => (
              <div
                key={stat.label}
                style={{
                  padding: i === 0 ? '0 20px 0 0' : '0 20px',
                  borderLeft: i === 0 ? 'none' : '0.5px solid rgba(255, 255, 255, 0.09)'
                }}
              >
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '17px',
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: '#AAB7CC'
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '9px',
                  fontWeight: 500,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginTop: '5px',
                  color: '#AAB7CC',
                  opacity: 0.4
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Telemetry Footer */}
        <div style={{
          position: 'absolute',
          right: '3vw',
          bottom: '4vh',
          zIndex: 10,
          display: isMobile ? 'none' : 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: '0.75rem',
          letterSpacing: '0.1em',
          color: '#7E91B1',
          opacity: landingOpacity,
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease-out'
        }}>
          <div>SATELLITE: NOAA-20 / VIIRS_NRT</div>
          <div>BANDS: I4 (3.74 μm) • I5 (11.45 μm)</div>
        </div>

        {/* 3D Canvas Layer — full width so the globe never clips against the
            canvas edge as it travels left. Widening it costs nothing visually:
            the globe's on-screen size is set by the vertical FOV and the canvas
            height, so only the horizontal room changes. */}
        <div style={{
          position: isMobile ? 'relative' : 'absolute',
          left: isMobile ? 'auto' : 0,
          right: isMobile ? 'auto' : 0,
          top: isMobile ? 'auto' : 0,
          flex: isMobile ? '1 1 auto' : undefined,
          minHeight: isMobile ? '280px' : undefined,
          height: isMobile ? 'auto' : '100%',
          width: '100%',
          zIndex: 0,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Canvas
            camera={{ position: [0, 0, 9.2], fov: 45 }}
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
                isMobile={isMobile}
                scrollProgressRef={scrollProgressRef}
                onProgressChange={setHeroProgress}
                onBackendStatusChange={setBackendStatus}
                selectedPointId={expandedId}
                onSelectPoint={(id) => setExpandedId(id)}
                onFiresFetched={(points) => setFireList(points.slice(0, 5))}
              />
            </React.Suspense>
          </Canvas>
        </div>

        {/* Nearest anomalies — centred in the right half the globe vacates */}
        <div style={{
          position: 'absolute',
          left: isMobile ? 0 : '50%',
          right: 0,
          top: isMobile ? '69px' : 0,
          bottom: isMobile ? 0 : 'auto',
          height: isMobile ? 'auto' : '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '12px 1.25rem' : '0 2rem',
          zIndex: 20,
          opacity: overlayOpacity,
          pointerEvents: 'none',
          transition: 'opacity 0.2s ease-out'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '440px',
            maxHeight: '100%',
            overflowY: isMobile ? 'auto' : 'visible',
            pointerEvents: heroProgress > 0.8 ? 'auto' : 'none'
          }}>
            <NearestAnomalies points={fireList} />
          </div>
        </div>

      </div>

      {/* Downstream Interactive Map Section */}
      <section ref={mapSectionRef} className="relative z-30 bg-transparent px-5 py-9 md:px-8">
        <div className="mb-5">
          <div>
            <div className="flex items-center gap-2.5 font-sans text-[13px] font-bold uppercase tracking-[0.2em] text-accent">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent text-accent" />
              Interactive Threat Mapping
            </div>
            <h2 className="mt-2 font-display text-[24px] font-extrabold uppercase tracking-wide text-text-primary">
              Global Heat Spot Grid
            </h2>
          </div>

        </div>

        {/* Category filter pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          {CLASSIFICATION_KEYS.map((key) => {
            const meta = CLASSIFICATIONS[key];
            const isActive = activeCategories.includes(key);
            const count = worldPoints.filter((p) => p.classification === key).length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                title={meta.meaning}
                className="cat-pill flex items-center gap-2 rounded-full border px-3 py-1.5 font-sans text-[14px] font-medium"
                style={{
                  borderColor: isActive ? meta.color : "var(--color-border-soft)",
                  backgroundColor: isActive ? "var(--color-raised)" : "var(--color-card)",
                  color: isActive ? "var(--color-text-primary)" : "var(--color-text-muted)",
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: isActive ? meta.color : "var(--color-text-muted)" }}
                />
                {meta.short}
                <span className="font-mono tabular-nums opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Map */}
          <div className="h-[380px] min-w-0 flex-1 overflow-hidden rounded-lg border border-border-strong bg-surface sm:h-[520px] lg:h-[560px]">
            {osmBackendStatus === "error" ? (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <span className="mb-3 h-1.5 w-1.5 rounded-full bg-industrial" />
                <h3 className="text-[16px] font-medium text-text-primary">
                  Backend Telemetry Unavailable
                </h3>
                <p className="mt-1.5 max-w-[340px] text-[15px] leading-relaxed text-text-secondary">
                  Unable to connect to the global anomaly endpoint. Verify server connectivity.
                </p>
              </div>
            ) : (
              <LeafletMapSection
                points={filteredWorldPoints}
                onMarkerClick={setSelectedThreatPoint}
                selectedPoint={selectedThreatPoint}
                onOpenDetail={setDetailPoint}
                impactPoint={detailPoint}
              />
            )}
          </div>

          {/* Half-window analysis panel — width animates, pushing the map left */}
          <div
            className={`overflow-hidden transition-[width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              detailPoint ? "block lg:w-1/2" : "hidden lg:block lg:w-0"
            }`}
          >
            {detailPoint && (
              <ThreatAnalysisPanel
                point={detailPoint}
                onClose={() => setDetailPoint(null)}
                isNotified={notifiedIds.includes(detailPoint.id)}
                onNotify={() =>
                  setNotifiedIds((prev) =>
                    prev.includes(detailPoint.id) ? prev : [...prev, detailPoint.id]
                  )
                }
              />
            )}
          </div>

          {/* Right panel — collapses to make room for the analysis window */}
          <div
            className={`flex flex-col gap-4 overflow-hidden transition-[width] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              detailPoint ? "lg:w-0" : "lg:w-[340px]"
            }`}
          >
            <input
              type="text"
              placeholder="Filter threat locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border-strong bg-card px-4 py-2.5 text-[15px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />

            {selectedThreatPoint ? (
              <div className="fade-up flex-1 rounded-lg border border-border-strong bg-card px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: selectedThreatPoint.color }}
                      />
                      <span className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                        {selectedThreatPoint.priority}
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-[16px] font-medium text-text-primary">
                      {selectedThreatPoint.classificationLabel}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedThreatPoint(null)}
                    className="rounded-md border border-border-strong bg-raised px-2 py-0.5 font-mono text-[12.5px] text-text-secondary transition-colors hover:bg-card hover:text-text-primary"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Confidence
                    </span>
                    <span className="font-mono text-[38px] leading-none tabular-nums text-text-primary">
                      {selectedThreatPoint.confidence != null
                        ? (selectedThreatPoint.confidence * 100).toFixed(0)
                        : "--"}
                      <span className="text-[16px] text-text-muted">%</span>
                    </span>
                  </div>

                  <div className="mt-2.5 h-1.5 w-full rounded-sm bg-raised">
                    <div
                      className="score-fill h-full rounded-sm"
                      style={{
                        width: `${(selectedThreatPoint.confidence || 0) * 100}%`,
                        backgroundColor: selectedThreatPoint.color,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 border-t border-border-soft pt-4">
                  <div>
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Latitude
                    </div>
                    <div className="mt-1 font-mono text-[15px] tabular-nums text-text-primary">
                      {selectedThreatPoint.lat != null ? selectedThreatPoint.lat.toFixed(4) : "--"}°
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Longitude
                    </div>
                    <div className="mt-1 font-mono text-[15px] tabular-nums text-text-primary">
                      {selectedThreatPoint.lng != null ? selectedThreatPoint.lng.toFixed(4) : "--"}°
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Radiative Power
                    </div>
                    <div className="mt-1 font-mono text-[15px] tabular-nums text-text-primary">
                      {selectedThreatPoint.frp_mw ?? "--"} MW
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Brightness
                    </div>
                    <div className="mt-1 font-mono text-[15px] tabular-nums text-text-primary">
                      {selectedThreatPoint.brightness_k ?? "--"} K
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Satellite
                    </div>
                    <div className="mt-1 font-sans text-[15px] text-text-primary">
                      {selectedThreatPoint.satellite || "--"}
                    </div>
                  </div>

                  <div>
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      H3 cell
                    </div>
                    <div className="mt-1 font-mono text-[13px] text-text-secondary">
                      {selectedThreatPoint.h3_index || "--"}
                    </div>
                  </div>

                  <div className="col-span-2 border-t border-border-soft pt-4">
                    <div className="font-sans text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                      Detected
                    </div>
                    <div className="mt-1 font-mono text-[15px] tabular-nums text-text-secondary">
                      {selectedThreatPoint.detected_at
                        ? `${selectedThreatPoint.detected_at.replace("T", " ").slice(0, 16)} UTC`
                        : "--"}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <button
                      type="button"
                      onClick={() => setDetailPoint(selectedThreatPoint)}
                      className="w-full rounded-md border border-accent bg-accent px-4 py-2.5 font-sans text-[12.5px] font-bold uppercase tracking-[0.15em] text-on-accent transition-colors hover:border-accent-hover hover:bg-accent-hover"
                    >
                      Open Analysis
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-soft px-6 py-12 text-center text-[15px] leading-relaxed text-text-muted">
                Click any marker on the map to inspect live threat details.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}