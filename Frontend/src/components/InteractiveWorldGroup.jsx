import React, { useRef, useState, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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

function RedThreatMarker({ point, radius = 2.52, selectedPointId, onMarkerClick }) {
  const ring1Ref = useRef();
  const ring2Ref = useRef();

  const isSelected = selectedPointId !== null && selectedPointId !== undefined && selectedPointId === point.id;

  useFrame(({ clock }) => {
    if (isSelected) {
      const t = clock.getElapsedTime() * 2.5;

      if (ring1Ref.current) {
        const scale1 = 1 + (t % 1) * 1.5;
        ring1Ref.current.scale.set(scale1, scale1, scale1);
        ring1Ref.current.material.opacity = Math.max(0, 1 - (t % 1));
      }

      if (ring2Ref.current) {
        const scale2 = 1 + ((t + 0.5) % 1) * 1.5;
        ring2Ref.current.scale.set(scale2, scale2, scale2);
        ring2Ref.current.material.opacity = Math.max(0, 1 - ((t + 0.5) % 1));
      }
    }
  });

  const pos = latLngToVector3(point.lat, point.lng, radius);
  const normal = pos.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal
  );

  return (
    <group
      position={pos}
      quaternion={quaternion}
      onClick={(e) => {
        e.stopPropagation();
        if (onMarkerClick) onMarkerClick(point);
      }}
    >
      <mesh>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={isSelected ? 2.2 : 0.8}
          roughness={0.2}
        />
      </mesh>

      {isSelected && (
        <>
          <mesh ref={ring1Ref} position={[0, 0, -0.002]}>
            <ringGeometry args={[0.045, 0.065, 32]} />
            <meshBasicMaterial
              color="#ef4444"
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh ref={ring2Ref} position={[0, 0, -0.002]}>
            <ringGeometry args={[0.045, 0.065, 32]} />
            <meshBasicMaterial
              color="#f97316"
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

export default function InteractiveWorldGroup({
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
  const [targetCoords, setTargetCoords] = useState([17.3850, 78.4867]);
  const [hasLocation, setHasLocation] = useState(null);

  const stateRef = useRef({
    idleRotY: 0,
    smoothP: 0,
    hasTriggeredRestApi: false,
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

  useFrame((state, delta) => {
    const targetP = scrollProgressRef.current;

    stateRef.current.smoothP = THREE.MathUtils.damp(stateRef.current.smoothP, targetP, 3.5, delta);
    if (stateRef.current.smoothP > 0.999) stateRef.current.smoothP = 1;
    if (stateRef.current.smoothP < 0.001) stateRef.current.smoothP = 0;

    const p = stateRef.current.smoothP;
    if (onProgressChange) onProgressChange(p);

    const targetCamZ = THREE.MathUtils.lerp(14, 9.5, p);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamZ, 6, delta);

    if (p >= 1 && !stateRef.current.isFullyLocked) {
      stateRef.current.isFullyLocked = true;
      if (setShowMarkers) setShowMarkers(true);

      if (hasLocation === true && !stateRef.current.hasTriggeredRestApi) {
        stateRef.current.hasTriggeredRestApi = true;
        if (onBackendStatusChange) onBackendStatusChange("loading");

        fetchNearPoints(targetCoords[0], targetCoords[1])
          .then((data) => {
            if (data && data.points) {
              if (setNearPoints) setNearPoints(data.points);
              if (onFiresFetched) onFiresFetched(data.points);
              if (onBackendStatusChange) onBackendStatusChange("success");
            } else {
              if (onBackendStatusChange) onBackendStatusChange("error");
            }
          })
          .catch((err) => {
            console.error("Failed to fetch near points from backend:", err);
            if (onBackendStatusChange) onBackendStatusChange("error");
          });
      }
    } else if (p < 1 && stateRef.current.isFullyLocked) {
      stateRef.current.isFullyLocked = false;
      if (setShowMarkers) setShowMarkers(false);
      stateRef.current.hasTriggeredRestApi = false;
    }

    // Positions: Landing (2.8, 0.2) on the right -> Post-scroll (-3.5, -0.5) on the left
    const globeX = THREE.MathUtils.lerp(2.8, -3.5, p);
    const globeY = THREE.MathUtils.lerp(0.2, -0.5, p);
    const globeScale = THREE.MathUtils.lerp(1.3, 1.0, p);
    const currentGlobePos = new THREE.Vector3(globeX, globeY, 0);

    const targetQuat = getTargetQuaternion(
      targetCoords[0],
      targetCoords[1],
      new THREE.Vector3(-3.5, -0.5, 0),
      camera.position
    );

    if (p < 1) {
      if (groupRef.current) {
        groupRef.current.visible = true;
        groupRef.current.position.copy(currentGlobePos);
        groupRef.current.scale.set(globeScale, globeScale, globeScale);

        stateRef.current.idleRotY += delta * 0.12 * (1 - p);
        const rollTiltZ = (-globeX * 0.2) * (1 - p);

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
        stationaryRef.current.position.set(-3.5, -0.5, 0);
        stationaryRef.current.scale.set(1.0, 1.0, 1.0);
        stationaryRef.current.quaternion.copy(targetQuat);
      }
    }
  });

  return (
    <>
      <group ref={groupRef} position={[2.8, 0.2, 0]} scale={[1.3, 1.3, 1.3]}>
        <RealisticGlobeMesh
          userCoords={hasLocation === false ? null : targetCoords}
          nearPoints={nearPoints}
          showMarkers={false}
          freeze={false}
        />
      </group>

      <group ref={stationaryRef} visible={false}>
        <RealisticGlobeMesh
          userCoords={hasLocation === false ? null : targetCoords}
          nearPoints={nearPoints}
          showMarkers={showMarkers}
          freeze={true}
        />

        {showMarkers &&
          nearPoints.map((point, index) => (
            <RedThreatMarker
              key={point.id || index}
              point={point}
              radius={2.52}
              selectedPointId={selectedPointId}
              onMarkerClick={onSelectPoint}
            />
          ))}
      </group>
    </>
  );
}