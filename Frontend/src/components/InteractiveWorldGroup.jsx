import React, { useRef, useState, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import RealisticGlobeMesh from "./RealisticGlobeMesh";
import { fetchNearPoints } from "../api";

function latLngToVector3(lat, lng, radius = 2.52) {
  const phi = (90 - lat) * THREE.MathUtils.DEG2RAD;
  const theta = (lng + 180) * THREE.MathUtils.DEG2RAD;

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Geographic centre of India, used as the globe's resting view when the user's
// location is unknown. Only a view target, never drawn as a marker.
const INDIA_CENTRE = [22.5, 79.0];

// Outer atmosphere shell radius in RealisticGlobeMesh — the sphere's true extent.
const GLOBE_RADIUS = 2.35;

// Landing pose. Tilt is held as its own constant rather than derived from
// LANDING_X, so the globe can be moved or resized without also rolling it.
const LANDING_X = 5.0;
const LANDING_Y = 0.2;
const RESTING_X = -3.5;

// On mobile the globe owns the bottom strip on its own, so it stays centred
// and the copy/panel swap above it instead of the globe sliding sideways.
const MOBILE_X = 0;
const LANDING_SCALE = 1.55;
const LANDING_TILT = 0.56;

// Camera distance at each end of the roll. The globe's on-screen size is
// proportional to scale / distance, so scaling with camera.position.z holds its
// apparent size fixed while the camera pushes in.
const LANDING_CAM_Z = 14;
const RESTING_CAM_Z = 9.5;

function getTargetQuaternion(lat, lng, globePos, cameraPos) {
  const phi = (90 - lat) * THREE.MathUtils.DEG2RAD;
  const theta = (lng + 180) * THREE.MathUtils.DEG2RAD;

  const centerToPoint = new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize();

  const localUp = new THREE.Vector3(0, 1, 0);
  let localRight = new THREE.Vector3().crossVectors(localUp, centerToPoint);
  if (localRight.lengthSq() < 0.00001) {
    localRight.set(1, 0, 0);
  } else {
    localRight.normalize();
  }
  const localTrueUp = new THREE.Vector3().crossVectors(centerToPoint, localRight).normalize();
  const mLocal = new THREE.Matrix4().makeBasis(localRight, localTrueUp, centerToPoint);

  const targetForward = new THREE.Vector3().subVectors(cameraPos, globePos).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let targetRight = new THREE.Vector3().crossVectors(worldUp, targetForward);
  if (targetRight.lengthSq() < 0.00001) {
    targetRight.set(1, 0, 0);
  } else {
    targetRight.normalize();
  }
  const targetTrueUp = new THREE.Vector3().crossVectors(targetForward, targetRight).normalize();
  const mWorld = new THREE.Matrix4().makeBasis(targetRight, targetTrueUp, targetForward);

  const mRot = new THREE.Matrix4().multiplyMatrices(mWorld, mLocal.clone().transpose());
  return new THREE.Quaternion().setFromRotationMatrix(mRot);
}

// Marker dots sit just above the Earth mesh (2.3) so they don't float off the
// surface when seen at an angle.
const DOT_RADIUS = 2.34;
const LABEL_RADIUS = 2.36;
// Detections this close are one site: at ~20 km per screen pixel their dots
// overlap, so they share one label listing every rank.
const SITE_KM = 60;
// Label offset from its site: ~17 px to the right, ~14 px up or down. At ~20 km
// per pixel any offset spans real map distance, so the tag is boxed to read as
// a caption rather than a detection, and starts at the end of its leader line.
const LABEL_EAST = 0.15;
const LABEL_NORTH = 0.12;

const haversineKm = (a, b) => {
  const toRad = THREE.MathUtils.DEG2RAD;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

const unitVector = (point) => latLngToVector3(point.lat, point.lng, 1);

// Group the ranked points into sites and place one label per site, to its right
// and slightly up — or slightly down when the site is south of the others, so
// neighbouring labels part.
function layoutSites(points) {
  const sites = [];
  points.forEach((point, index) => {
    const entry = { point, rank: index + 1 };
    const site = sites.find((s) => s.members.some((m) => haversineKm(m.point, point) <= SITE_KM));
    if (site) site.members.push(entry);
    else sites.push({ members: [entry] });
  });

  const overall = points.reduce((sum, p) => sum.add(unitVector(p)), new THREE.Vector3()).normalize();
  const up = new THREE.Vector3(0, 1, 0);

  return sites.map(({ members }) => {
    const centre = members
      .reduce((sum, { point }) => sum.add(unitVector(point)), new THREE.Vector3())
      .normalize();
    const east = new THREE.Vector3().crossVectors(up, centre).normalize();
    const north = new THREE.Vector3().crossVectors(centre, east).normalize();
    const below = sites.length > 1 && centre.clone().sub(overall).dot(north) < 0;

    return {
      key: members.map((m) => m.rank).join('-'),
      members,
      anchor: centre.clone().multiplyScalar(DOT_RADIUS),
      label: centre
        .clone()
        .multiplyScalar(LABEL_RADIUS)
        .addScaledVector(east, LABEL_EAST)
        .addScaledVector(north, below ? -LABEL_NORTH : LABEL_NORTH)
        .setLength(LABEL_RADIUS),
    };
  });
}

const _worldPos = new THREE.Vector3();
const _globeCentre = new THREE.Vector3();

// The detection itself: a dot at its true coordinates, pulsing when selected.
function DetectionDot({ point, isSelected, onSelect }) {
  const ringRef = useRef();
  const dot = useMemo(() => latLngToVector3(point.lat, point.lng, DOT_RADIUS), [point.lat, point.lng]);
  const ringQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dot.clone().normalize()),
    [dot]
  );

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    const t = (clock.getElapsedTime() * 1.5) % 1;
    const s = 1 + t * 1.6;
    ringRef.current.scale.set(s, s, s);
    ringRef.current.material.opacity = 1 - t;
  });

  return (
    <>
      <mesh
        position={dot}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelect) onSelect(point.id);
        }}
      >
        <sphereGeometry args={[isSelected ? 0.042 : 0.032, 16, 16]} />
        <meshStandardMaterial color={point.color} emissive={point.color} emissiveIntensity={isSelected ? 1.6 : 0.7} roughness={0.3} />
      </mesh>

      {isSelected && (
        <mesh ref={ringRef} position={dot} quaternion={ringQuaternion}>
          <ringGeometry args={[0.045, 0.06, 32]} />
          <meshBasicMaterial color={point.color} transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}
    </>
  );
}

// One label per site: a boxed row of numbered buttons whose left edge sits at
// the end of a short line from the site.
function SiteLabel({ site, selectedPointId, onSelect }) {
  const labelAnchorRef = useRef();
  const rowRef = useRef();

  const leader = useMemo(() => {
    const geometry = new THREE.BufferGeometry().setFromPoints([site.anchor, site.label]);
    const material = new THREE.LineBasicMaterial({ color: '#E8EDF5', transparent: true, opacity: 0.6 });
    return new THREE.Line(geometry, material);
  }, [site]);
  useEffect(() => () => {
    leader.geometry.dispose();
    leader.material.dispose();
  }, [leader]);

  useFrame(({ camera }) => {
    // Hide the label once it rotates onto the far side of the globe.
    const anchor = labelAnchorRef.current;
    if (!anchor || !rowRef.current) return;
    anchor.getWorldPosition(_worldPos);
    anchor.parent.getWorldPosition(_globeCentre);
    const normal = _worldPos.clone().sub(_globeCentre).normalize();
    const toCamera = camera.position.clone().sub(_worldPos).normalize();
    const visible = normal.dot(toCamera) > 0.15;
    rowRef.current.style.opacity = visible ? '1' : '0';
    rowRef.current.style.pointerEvents = visible ? 'auto' : 'none';
  });

  return (
    <>
      <primitive object={leader} />
      <group ref={labelAnchorRef} position={site.label}>
        <Html zIndexRange={[19, 10]}>
          <div
            ref={rowRef}
            style={{
              display: 'flex',
              gap: 3,
              padding: 3,
              transform: 'translateY(-50%)',
              background: 'rgba(24, 34, 54, 0.92)',
              border: '1px solid #3D4A63',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
              transition: 'opacity 0.2s ease-out',
            }}
          >
            {site.members.map(({ point, rank }) => {
              const isSelected = selectedPointId != null && selectedPointId === point.id;
              return (
                <button
                  key={point.id || rank}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelect) onSelect(point.id);
                  }}
                  aria-label={`Detection ${rank}: ${point.classificationLabel}`}
                  aria-pressed={isSelected}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 9999,
                    border: `2px solid ${point.color}`,
                    background: isSelected ? '#3D4A63' : '#182236',
                    color: '#E8EDF5',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: '16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {rank}
                </button>
              );
            })}
          </div>
        </Html>
      </group>
    </>
  );
}

export default function InteractiveWorldGroup({
  isMobile = false,
  scrollProgressRef,
  onLocationDenied,
  onProgressChange,
  onFiresFetched,
  onBackendStatusChange,
  selectedPointId,
  onSelectPoint
}) {
  const groupRef = useRef();
  const stationaryRef = useRef();
  const { camera } = useThree();

  const [showMarkers, setShowMarkers] = useState(false);
  const [nearPoints, setNearPoints] = useState([]);
  // Until the browser shares a real position the globe just faces central India;
  // no location pin is drawn for this fallback (see userCoords below).
  const [targetCoords, setTargetCoords] = useState(INDIA_CENTRE);
  const [hasLocation, setHasLocation] = useState(null);
  const sites = useMemo(() => layoutSites(nearPoints), [nearPoints]);

  const stateRef = useRef({
    idleRotY: 0,
    smoothP: 0,
    isFullyLocked: false,
  });

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setHasLocation(true);
          setTargetCoords([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {
          setHasLocation(false);
          if (onLocationDenied) onLocationDenied(true);
          if (onBackendStatusChange) onBackendStatusChange("location_error");
        },
        { timeout: 10000 }
      );
    } else {
      setHasLocation(false);
      if (onLocationDenied) onLocationDenied(true);
      if (onBackendStatusChange) onBackendStatusChange("location_error");
    }
  }, []);

  // Fetch the nearest detections once the globe is at rest AND the location is
  // known, whichever happens last. Triggering this only at the moment the roll
  // finished meant a location that arrived a moment later never loaded the list.
  useEffect(() => {
    if (!showMarkers || hasLocation !== true) return undefined;
    let cancelled = false;
    if (onBackendStatusChange) onBackendStatusChange("loading");

    fetchNearPoints(targetCoords[0], targetCoords[1])
      .then((data) => {
        if (cancelled) return;
        if (data && data.points) {
          setNearPoints(data.points);
          if (onFiresFetched) onFiresFetched(data.points);
          if (onBackendStatusChange) onBackendStatusChange("success");
        } else if (onBackendStatusChange) {
          onBackendStatusChange("error");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch near points from backend:", err);
        if (onBackendStatusChange) onBackendStatusChange("error");
      });

    return () => {
      cancelled = true;
    };
    // Callbacks come from the parent and are not stable; re-fetching on each
    // parent render would hammer the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMarkers, hasLocation, targetCoords]);

  useFrame((state, delta) => {
    const targetP = scrollProgressRef.current;

    stateRef.current.smoothP = THREE.MathUtils.damp(stateRef.current.smoothP, targetP, 3.5, delta);
    if (stateRef.current.smoothP > 0.999) stateRef.current.smoothP = 1;
    if (stateRef.current.smoothP < 0.001) stateRef.current.smoothP = 0;

    const p = stateRef.current.smoothP;
    if (onProgressChange) onProgressChange(p);

    const targetCamZ = THREE.MathUtils.lerp(LANDING_CAM_Z, RESTING_CAM_Z, p);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 6, delta);

    if (p >= 1 && !stateRef.current.isFullyLocked) {
      stateRef.current.isFullyLocked = true;
      if (setShowMarkers) setShowMarkers(true);
    } else if (p < 1 && stateRef.current.isFullyLocked) {
      stateRef.current.isFullyLocked = false;
      if (setShowMarkers) setShowMarkers(false);
    }

    // Travel is horizontal only: X rolls right -> left, Y holds at LANDING_Y.
    const globeY = LANDING_Y;
    // Grow with the camera push-in so the sphere stays the size it is in the hero.
    const globeScale = LANDING_SCALE * (camera.position.z / LANDING_CAM_Z);

    // Keep the sphere inside the frustum: on a narrow or short window the
    // visible half-width shrinks below the globe's travel and it would clip
    // against the canvas edge. Derived from the camera rather than
    // state.viewport, which goes stale while camera.position.z is damped.
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
    const halfWidth = halfHeight * camera.aspect;
    const margin = halfWidth - GLOBE_RADIUS * globeScale;
    const clampX = (x) => THREE.MathUtils.clamp(x, -margin, margin);

    const fromX = isMobile ? MOBILE_X : LANDING_X;
    const toX = isMobile ? MOBILE_X : RESTING_X;
    const globeX = clampX(THREE.MathUtils.lerp(fromX, toX, p));
    const restingX = clampX(toX);
    const currentGlobePos = new THREE.Vector3(globeX, globeY, 0);

    const targetQuat = getTargetQuaternion(
      targetCoords[0],
      targetCoords[1],
      new THREE.Vector3(restingX, LANDING_Y, 0),
      camera.position
    );

    if (p < 1) {
      if (groupRef.current) {
        groupRef.current.visible = true;
        groupRef.current.position.copy(currentGlobePos);
        groupRef.current.scale.set(globeScale, globeScale, globeScale);

        stateRef.current.idleRotY += delta * 0.12 * (1 - p);
        const rollTiltZ = -LANDING_TILT * (1 - p);

        const rollEuler = new THREE.Euler(0, stateRef.current.idleRotY, rollTiltZ, 'YXZ');
        const currentRollQuat = new THREE.Quaternion().setFromEuler(rollEuler);

        const slerpFactor = Math.pow(p, 2.5);
        currentRollQuat.slerp(targetQuat, slerpFactor);

        groupRef.current.quaternion.copy(currentRollQuat);
      }
      if (stationaryRef.current) {
        stationaryRef.current.visible = false;
      }
    } else {
      if (groupRef.current) {
        groupRef.current.visible = false;
      }
      if (stationaryRef.current) {
        stationaryRef.current.visible = true;
        stationaryRef.current.position.set(restingX, LANDING_Y, 0);
        stationaryRef.current.scale.set(globeScale, globeScale, globeScale);
        stationaryRef.current.quaternion.copy(targetQuat);
      }
    }
  });

  return (
    <>
      {/* Frozen: the idle spin comes from idleRotY on this group. Letting the mesh
          spin on its own as well drifts the texture away from the orientation
          getTargetQuaternion aims for, so the roll would land off-target. */}
      <group ref={groupRef} position={[2.8, 0.2, 0]} scale={[1.3, 1.3, 1.3]}>
        <RealisticGlobeMesh
          userCoords={hasLocation === true ? targetCoords : null}
          nearPoints={nearPoints}
          showMarkers={false}
          freeze={true}
        />
      </group>

      <group ref={stationaryRef} visible={false}>
        <RealisticGlobeMesh
          userCoords={hasLocation === true ? targetCoords : null}
          nearPoints={nearPoints}
          showMarkers={showMarkers}
          freeze={true}
        />

        {showMarkers && (
          <>
            {nearPoints.map((point, index) => (
              <DetectionDot
                key={point.id || index}
                point={point}
                isSelected={selectedPointId != null && selectedPointId === point.id}
                onSelect={onSelectPoint}
              />
            ))}
            {sites.map((site) => (
              <SiteLabel key={site.key} site={site} selectedPointId={selectedPointId} onSelect={onSelectPoint} />
            ))}
          </>
        )}
      </group>
    </>
  );
}