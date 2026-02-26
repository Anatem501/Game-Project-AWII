import * as THREE from "three";

type CryoOverlayShaderUniforms = {
  uCryoFreeze01: THREE.IUniform<number>;
  uCryoFrozen01: THREE.IUniform<number>;
};

type CryoOverlayEntry = {
  sourceMesh: THREE.Mesh;
  overlayMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
};

export type ShipCryoFreezeSurfaceEffect = {
  update: (deltaTime: number, cryoFreeze01: number, cryofrozen: boolean) => void;
  dispose: () => void;
};

const RESCAN_INTERVAL_SECONDS = 0.5;
const OVERLAY_SCALE = 1.015;
const OVERLAY_FROZEN_EXTRA_SCALE = 0.012;
const OVERLAY_FLAG = "__ship_cryo_overlay__";

const CRYO_OVERLAY_VERTEX_SHADER = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

uniform float uCryoFreeze01;
uniform float uCryoFrozen01;

void main() {
  float cryo = clamp(uCryoFreeze01, 0.0, 1.0);
  float frozen = clamp(uCryoFrozen01, 0.0, 1.0);
  float shellPush = (0.002 + cryo * 0.006 + frozen * 0.004);

  vec3 displaced = position + normal * shellPush;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vLocalPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const CRYO_OVERLAY_FRAGMENT_SHADER = `
uniform float uCryoFreeze01;
uniform float uCryoFrozen01;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    sum += valueNoise3(p * freq) * amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  float cryo = clamp(uCryoFreeze01, 0.0, 1.0);
  float frozen = clamp(uCryoFrozen01, 0.0, 1.0);
  if (cryo <= 0.001) {
    discard;
  }

  vec3 normalDir = normalize(vWorldNormal);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - max(dot(normalDir, viewDir), 0.0), 1.65);

  // Use object-space coordinates so the frost pattern sticks to the hull.
  vec3 frostP = vLocalPos * (6.0 + cryo * 2.0 + frozen * 2.0);
  float baseFbm = fbm3(frostP);
  float detailFbm = fbm3(frostP * 1.9 + vec3(11.2, 4.7, 8.3));
  float crystal = smoothstep(0.42, 0.88, mix(baseFbm, detailFbm, 0.55 + frozen * 0.15));
  float crackMask = smoothstep(0.68, 0.92, fbm3(frostP * 3.2 + vec3(3.1, 9.4, 1.7)));
  float veinMask = smoothstep(0.62, 0.95, abs(detailFbm - baseFbm) * (1.4 + frozen * 0.35));

  float bodyMask = smoothstep(0.08, 1.0, cryo * (0.8 + crystal * 0.55));
  float frostMask = clamp(
    bodyMask * (0.25 + rim * (0.85 + frozen * 0.15) + crystal * (0.42 + frozen * 0.25) + veinMask * 0.25),
    0.0,
    1.0
  );

  vec3 iceDeep = mix(vec3(0.14, 0.32, 0.66), vec3(0.05, 0.16, 0.78), frozen);
  vec3 iceMid = mix(vec3(0.40, 0.68, 0.96), vec3(0.18, 0.46, 1.0), frozen);
  vec3 iceBright = mix(vec3(0.90, 0.97, 1.0), vec3(0.68, 0.84, 1.0), frozen);
  vec3 frozenBlueTint = vec3(0.10, 0.38, 1.0);

  vec3 frostColor = mix(iceDeep, iceMid, 0.48 + crystal * 0.42);
  frostColor = mix(frostColor, frozenBlueTint, frozen * (0.34 + crystal * 0.22));
  frostColor = mix(frostColor, iceBright, rim * (0.30 + frozen * 0.42));
  frostColor += iceBright * crackMask * (0.04 + frozen * 0.10);
  frostColor += frozenBlueTint * veinMask * (0.10 + frozen * 0.20);

  float alpha =
    cryo * (0.11 + rim * 0.24) +
    cryo * crystal * (0.14 + frozen * 0.14) +
    cryo * veinMask * 0.08 +
    frozen * 0.16;
  alpha *= smoothstep(0.02, 1.0, frostMask);
  alpha = clamp(alpha, 0.0, 0.78);

  if (alpha <= 0.002) {
    discard;
  }

  gl_FragColor = vec4(frostColor, alpha);
}
`;

export function createShipCryoFreezeSurfaceEffect(
  root: THREE.Object3D
): ShipCryoFreezeSurfaceEffect {
  const overlayEntries = new Map<number, CryoOverlayEntry>();
  const uniforms: CryoOverlayShaderUniforms = {
    uCryoFreeze01: { value: 0 },
    uCryoFrozen01: { value: 0 }
  };
  const overlayMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: CRYO_OVERLAY_VERTEX_SHADER,
    fragmentShader: CRYO_OVERLAY_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false
  });
  overlayMaterial.polygonOffset = true;
  overlayMaterial.polygonOffsetFactor = -1;
  overlayMaterial.polygonOffsetUnits = -1;
  let rescanSecondsRemaining = 0;

  const isOverlayMesh = (mesh: THREE.Mesh): boolean => mesh.userData?.[OVERLAY_FLAG] === true;

  const isEligibleShipSurfaceMesh = (mesh: THREE.Mesh): boolean => {
    if (isOverlayMesh(mesh)) {
      return false;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length <= 0) {
      return false;
    }
    return materials.some((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) {
        return false;
      }
      if (material.transparent && material.opacity < 0.98) {
        return false;
      }
      return true;
    });
  };

  const attachOverlayForMesh = (sourceMesh: THREE.Mesh): void => {
    if (overlayEntries.has(sourceMesh.id)) {
      return;
    }
    if (!isEligibleShipSurfaceMesh(sourceMesh)) {
      return;
    }
    if (!(sourceMesh.geometry instanceof THREE.BufferGeometry)) {
      return;
    }

    const overlayMesh = new THREE.Mesh(sourceMesh.geometry, overlayMaterial);
    overlayMesh.name = `${sourceMesh.name || "mesh"}_cryo_overlay`;
    overlayMesh.userData[OVERLAY_FLAG] = true;
    overlayMesh.renderOrder = sourceMesh.renderOrder + 1;
    overlayMesh.frustumCulled = sourceMesh.frustumCulled;
    overlayMesh.castShadow = false;
    overlayMesh.receiveShadow = false;
    overlayMesh.matrixAutoUpdate = true;
    overlayMesh.scale.setScalar(OVERLAY_SCALE);
    overlayMesh.visible = false;
    sourceMesh.add(overlayMesh);
    overlayEntries.set(sourceMesh.id, { sourceMesh, overlayMesh });
  };

  const pruneDetachedOverlays = (): void => {
    for (const [sourceId, entry] of overlayEntries) {
      if (
        !entry.sourceMesh.parent ||
        entry.overlayMesh.parent !== entry.sourceMesh ||
        entry.sourceMesh.userData?.[OVERLAY_FLAG] === true
      ) {
        entry.overlayMesh.removeFromParent();
        overlayEntries.delete(sourceId);
      }
    }
  };

  const rescan = (): void => {
    pruneDetachedOverlays();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      attachOverlayForMesh(node);
    });
  };

  const applyVisualState = (cryoFreeze01: number, cryofrozen: boolean): void => {
    uniforms.uCryoFreeze01.value = cryoFreeze01;
    uniforms.uCryoFrozen01.value = cryofrozen ? 1 : 0;
    const active = cryoFreeze01 > 0.001;
    const overlayScale =
      OVERLAY_SCALE + cryoFreeze01 * 0.004 + (cryofrozen ? OVERLAY_FROZEN_EXTRA_SCALE : 0);
    for (const entry of overlayEntries.values()) {
      entry.overlayMesh.visible = active && entry.sourceMesh.visible;
      entry.overlayMesh.scale.setScalar(overlayScale);
    }
  };

  return {
    update: (deltaTime: number, cryoFreeze01: number, cryofrozen: boolean): void => {
      rescanSecondsRemaining -= Math.max(0, deltaTime);
      if (rescanSecondsRemaining <= 0) {
        rescan();
        rescanSecondsRemaining = RESCAN_INTERVAL_SECONDS;
      }
      applyVisualState(THREE.MathUtils.clamp(cryoFreeze01, 0, 1), cryofrozen);
    },
    dispose: (): void => {
      for (const entry of overlayEntries.values()) {
        entry.overlayMesh.removeFromParent();
      }
      overlayEntries.clear();
      overlayMaterial.dispose();
    }
  };
}
