import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

function latLngToVector3(lat, lng, radius) {
  const phi = (90 - lat) * THREE.MathUtils.DEG2RAD;
  const theta = (lng + 180) * THREE.MathUtils.DEG2RAD;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export default function RealisticGlobeMesh({ userCoords, nearPoints, showMarkers, freeze = false }) {
  const earthRef = useRef();
  const cloudsRef = useRef();
  const markerGroupRef = useRef();
  const ringRef = useRef();

  const [colorMap, bumpMap, specularMap, cloudsMap] = useTexture([
    "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg",
    "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg",
    "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg",
    "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png"
  ]);

  useFrame((state, delta) => {
    if (!freeze) {
      if (earthRef.current) {
        earthRef.current.rotation.y += delta * 0.015;
      }
      if (cloudsRef.current) {
        cloudsRef.current.rotation.y += delta * 0.02;
      }
    }

    if (markerGroupRef.current && userCoords) {
      const pos = latLngToVector3(userCoords[0], userCoords[1], 2.3);
      markerGroupRef.current.position.copy(pos);

      const normal = pos.clone().normalize();
      const upVector = new THREE.Vector3(0, 1, 0);
      markerGroupRef.current.quaternion.setFromUnitVectors(upVector, normal);

      const t = state.clock.getElapsedTime();
      
      // Subtler, smaller bounce
      const scale = 1 + Math.sin(t * 6) * 0.08;
      markerGroupRef.current.scale.set(scale, scale, scale);

      // Radar ring expansion
      if (ringRef.current) {
        const ringScale = 1 + ((t * 2) % 1) * 1.2;
        const ringOpacity = 1 - ((t * 2) % 1);
        ringRef.current.scale.set(ringScale, ringScale, ringScale);
        ringRef.current.material.opacity = ringOpacity;
      }
    }
  });

  return (
    <group>
      {/* Real Earth Body */}
      <mesh ref={earthRef} castShadow receiveShadow>
        <sphereGeometry args={[2.3, 64, 64]} />
        <meshStandardMaterial
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={0.04}
          roughnessMap={specularMap}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* Atmospheric Cloud Layer */}
      <mesh ref={cloudsRef}>
        <sphereGeometry args={[2.35, 64, 64]} />
        <meshStandardMaterial
          map={cloudsMap}
          transparent={true}
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Outward-Pointing Greenish-Blue 3D Location Pin */}
      {showMarkers && (
        <group ref={markerGroupRef}>
          {/* Surface Pulsing Ring (Cyan/Teal) */}
          <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
            <ringGeometry args={[0.04, 0.07, 32]} />
            <meshBasicMaterial color="#06b6d4" transparent opacity={0.8} side={THREE.DoubleSide} />
          </mesh>

          {/* Compact Stem */}
          <mesh position={[0, 0.09, 0]}>
            <cylinderGeometry args={[0.012, 0.003, 0.18, 16]} />
            <meshStandardMaterial color="#2dd4bf" emissive="#0d9488" emissiveIntensity={0.8} roughness={0.2} />
          </mesh>

          {/* Glowing Greenish-Blue Beacon Head */}
          <mesh position={[0, 0.2, 0]}>
            <sphereGeometry args={[0.05, 24, 24]} />
            <meshStandardMaterial color="#00f5d4" emissive="#00f5d4" emissiveIntensity={1.3} roughness={0.1} />
          </mesh>
        </group>
      )}
    </group>
  );
}