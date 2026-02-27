import * as THREE from "three";

type ElectroshockOverlayShaderUniforms = {
  uElectroshock01: THREE.IUniform<number>;
  uElectroshocked01: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uRootWorldInverse: THREE.IUniform<THREE.Matrix4>;
  uHitPositions: THREE.IUniform<THREE.Vector3[]>;
  uHitAges: THREE.IUniform<number[]>;
  uHitPulseLifetime: THREE.IUniform<number>;
  uHitPulseMaxRadius: THREE.IUniform<number>;
};

type ElectroshockOverlayEntry = {
  sourceMesh: THREE.Mesh;
  overlayMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
};

export type ShipElectroshockSurfaceEffect = {
  registerImpact: (worldPosition: THREE.Vector3) => void;
  update: (deltaTime: number, electroshock01: number, electroshocked: boolean) => void;
  dispose: () => void;
};

type ElectroshockHitPulse = {
  localPosition: THREE.Vector3;
  ageSeconds: number;
};

const RESCAN_INTERVAL_SECONDS = 0.5;
const OVERLAY_SCALE = 1.014;
const OVERLAY_ELECTROSHOCKED_EXTRA_SCALE = 0.012;
const OVERLAY_FLAG = "__ship_electroshock_overlay__";
const MAX_HIT_PULSES = 8;
const HIT_PULSE_LIFETIME_SECONDS = 1.4;

const ELECTROSHOCK_OVERLAY_VERTEX_SHADER = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

uniform float uElectroshock01;
uniform float uElectroshocked01;
uniform float uTime;

void main() {
  float shock = clamp(uElectroshock01, 0.0, 1.0);
  float shocked = clamp(uElectroshocked01, 0.0, 1.0);
  float jitter = sin(uTime * 12.5 + dot(position, vec3(5.0, 7.0, 6.0))) * 0.0011 * shock;
  float shellPush = 0.0022 + shock * 0.0048 + shocked * 0.0046 + jitter;

  vec3 displaced = position + normal * shellPush;
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vLocalPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const ELECTROSHOCK_OVERLAY_FRAGMENT_SHADER = `
uniform float uElectroshock01;
uniform float uElectroshocked01;
uniform float uTime;
uniform mat4 uRootWorldInverse;
uniform vec3 uHitPositions[${MAX_HIT_PULSES}];
uniform float uHitAges[${MAX_HIT_PULSES}];
uniform float uHitPulseLifetime;
uniform float uHitPulseMaxRadius;

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
    freq *= 2.05;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  float shock = clamp(uElectroshock01, 0.0, 1.0);
  float shocked = clamp(uElectroshocked01, 0.0, 1.0);
  if (shock <= 0.001) {
    discard;
  }
  vec3 rootLocalPos = (uRootWorldInverse * vec4(vWorldPos, 1.0)).xyz;

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 normalDir = normalize(vWorldNormal);
  float rim = pow(1.0 - max(dot(normalDir, viewDir), 0.0), 1.55);

  float flowSpeed = mix(1.2, 2.6, shocked);
  vec3 causticP = vLocalPos * (6.2 + shock * 3.4);
  vec3 driftA = vec3(uTime * 3.3 * flowSpeed, -uTime * 2.2 * flowSpeed, uTime * 2.9 * flowSpeed);
  vec3 driftB = vec3(-uTime * 4.1 * flowSpeed, uTime * 2.7 * flowSpeed, -uTime * 2.1 * flowSpeed);
  float causticBase = fbm3(causticP + driftA);
  float causticDetail = fbm3(causticP * 2.3 + driftB + vec3(7.0, 4.0, 9.0));
  float caustics = smoothstep(0.72, 0.985, mix(causticBase, causticDetail, 0.58));

  float streakA = abs(sin((vLocalPos.x + vLocalPos.z) * 3.4 + uTime * (7.5 + 4.0 * shocked) + causticDetail * 8.0));
  float streakB = abs(sin((vLocalPos.y - vLocalPos.z) * 4.1 - uTime * (8.4 + 5.0 * shocked) + causticBase * 7.0));
  float zigzag = smoothstep(0.68, 0.94, max(streakA, streakB));
  float travelA = abs(sin(dot(vLocalPos, vec3(3.2, 1.2, 2.8)) - uTime * (15.0 + 10.0 * shocked) + causticDetail * 12.0));
  float travelB = abs(sin(dot(vLocalPos, vec3(-2.8, 1.8, 3.1)) + uTime * (13.0 + 8.0 * shocked) + causticBase * 10.0));
  float boltMask = smoothstep(0.74, 0.93, max(travelA, travelB));
  float arcField = valueNoise3(vLocalPos * 1.05 + vec3(uTime * 0.6, -uTime * 0.42, uTime * 0.51));
  float arcPresence = smoothstep(0.76, 0.93, arcField);
  zigzag *= arcPresence;
  boltMask *= arcPresence;
  float electricMask = clamp(
    caustics * (0.32 + shocked * 0.05) +
    zigzag * (0.36 + shocked * 0.12) +
    boltMask * (0.3 + shocked * 0.16),
    0.0,
    1.0
  );

  float hitPulseEnvelope = 0.0;
  for (int i = 0; i < ${MAX_HIT_PULSES}; i++) {
    float age = uHitAges[i];
    if (age < 0.0) {
      continue;
    }
    float t = clamp(age / max(0.0001, uHitPulseLifetime), 0.0, 1.0);
    float radius = mix(0.04, uHitPulseMaxRadius, t);
    float ringWidth = mix(0.1, 0.58, t);
    float distToHit = distance(rootLocalPos, uHitPositions[i]);
    float core = smoothstep(radius * 0.76 + 0.14, 0.0, distToHit) * (1.0 - t * 0.72);
    float ring = 1.0 - smoothstep(ringWidth, ringWidth + 0.35, abs(distToHit - radius));
    float ringFlicker = 0.7 + 0.3 * abs(sin(uTime * (15.0 + shocked * 10.0) + float(i) * 11.0 + distToHit * 3.2));
    hitPulseEnvelope += max(core, ring * (0.92 - 0.62 * t)) * ringFlicker;
  }
  hitPulseEnvelope = clamp(hitPulseEnvelope, 0.0, 1.0);
  if (hitPulseEnvelope <= 0.001) {
    discard;
  }

  electricMask *= 0.25 + hitPulseEnvelope * 0.75;

  vec3 deepBlue = vec3(0.15, 0.62, 1.0);
  vec3 brightBlueWhite = vec3(0.9, 0.98, 1.0);
  vec3 color = mix(
    deepBlue,
    brightBlueWhite,
    clamp(electricMask * 0.82 + boltMask * 0.22 + rim * 0.6, 0.0, 1.0)
  );
  color = mix(color, brightBlueWhite, hitPulseEnvelope * 0.24);

  float flickerSpeed = mix(19.0, 39.0, shocked);
  float flicker = 0.6 + 0.4 * abs(sin(uTime * flickerSpeed + causticDetail * 12.0));
  float stutter = 0.76 + 0.24 * abs(sin(uTime * (61.0 + 29.0 * shocked) + dot(vLocalPos, vec3(4.0, 5.0, 6.0)) * 3.0));
  float surge = 0.84 + 0.16 * abs(sin(uTime * (23.0 + 13.0 * shocked) + causticBase * 13.0));
  flicker *= stutter * surge;
  float alpha =
    shock * (0.08 + rim * 0.24) +
    shock * electricMask * (0.16 + shocked * 0.11) +
    shock * boltMask * (0.06 + shocked * 0.13) +
    shocked * 0.06;
  alpha *= flicker * (0.45 + hitPulseEnvelope * 0.85);
  alpha = clamp(alpha, 0.0, 0.78);

  if (alpha <= 0.002) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;

export function createShipElectroshockSurfaceEffect(
  root: THREE.Object3D
): ShipElectroshockSurfaceEffect {
  const overlayEntries = new Map<number, ElectroshockOverlayEntry>();
  const hitPulses: ElectroshockHitPulse[] = [];
  const hitUniformPositions = Array.from(
    { length: MAX_HIT_PULSES },
    () => new THREE.Vector3(0, -1000, 0)
  );
  const hitUniformAges = Array.from({ length: MAX_HIT_PULSES }, () => -1);
  const rootWorldInverse = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  const boundsSize = new THREE.Vector3();
  const localImpactPosition = new THREE.Vector3();
  let hitPulseMaxRadius = 1.2;
  const uniforms: ElectroshockOverlayShaderUniforms = {
    uElectroshock01: { value: 0 },
    uElectroshocked01: { value: 0 },
    uTime: { value: 0 },
    uRootWorldInverse: { value: rootWorldInverse },
    uHitPositions: { value: hitUniformPositions },
    uHitAges: { value: hitUniformAges },
    uHitPulseLifetime: { value: HIT_PULSE_LIFETIME_SECONDS },
    uHitPulseMaxRadius: { value: hitPulseMaxRadius }
  };
  const overlayMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: ELECTROSHOCK_OVERLAY_VERTEX_SHADER,
    fragmentShader: ELECTROSHOCK_OVERLAY_FRAGMENT_SHADER,
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
    overlayMesh.name = `${sourceMesh.name || "mesh"}_electroshock_overlay`;
    overlayMesh.userData[OVERLAY_FLAG] = true;
    overlayMesh.renderOrder = sourceMesh.renderOrder + 2;
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
    bounds.setFromObject(root);
    if (!bounds.isEmpty()) {
      bounds.getSize(boundsSize);
      hitPulseMaxRadius = Math.max(0.65, Math.max(boundsSize.x, boundsSize.y, boundsSize.z) * 0.52);
      uniforms.uHitPulseMaxRadius.value = hitPulseMaxRadius;
    }
  };

  const updateHitPulses = (deltaTime: number): void => {
    const dt = Math.max(0, deltaTime);
    for (let i = hitPulses.length - 1; i >= 0; i -= 1) {
      const pulse = hitPulses[i];
      pulse.ageSeconds += dt;
      if (pulse.ageSeconds >= HIT_PULSE_LIFETIME_SECONDS) {
        hitPulses.splice(i, 1);
      }
    }
    for (let i = 0; i < MAX_HIT_PULSES; i += 1) {
      if (i < hitPulses.length) {
        hitUniformPositions[i].copy(hitPulses[i].localPosition);
        hitUniformAges[i] = hitPulses[i].ageSeconds;
      } else {
        hitUniformPositions[i].set(0, -1000, 0);
        hitUniformAges[i] = -1;
      }
    }
  };

  const applyVisualState = (electroshock01: number, electroshocked: boolean): void => {
    const visualIntensity01 = electroshock01 > 0.001 ? electroshock01 : 0;
    uniforms.uElectroshock01.value = visualIntensity01;
    uniforms.uElectroshocked01.value = electroshocked ? 1 : 0;
    const active = visualIntensity01 > 0.001 && hitPulses.length > 0;
    const overlayScale =
      OVERLAY_SCALE +
      visualIntensity01 * 0.004 +
      (electroshocked ? OVERLAY_ELECTROSHOCKED_EXTRA_SCALE : 0);
    for (const entry of overlayEntries.values()) {
      entry.overlayMesh.visible = active && entry.sourceMesh.visible;
      entry.overlayMesh.scale.setScalar(overlayScale);
    }
  };

  return {
    registerImpact: (worldPosition: THREE.Vector3): void => {
      if (!Number.isFinite(worldPosition.x) || !Number.isFinite(worldPosition.y) || !Number.isFinite(worldPosition.z)) {
        return;
      }
      root.updateWorldMatrix(true, false);
      localImpactPosition.copy(worldPosition);
      root.worldToLocal(localImpactPosition);
      hitPulses.unshift({
        localPosition: localImpactPosition.clone(),
        ageSeconds: 0
      });
      if (hitPulses.length > MAX_HIT_PULSES) {
        hitPulses.length = MAX_HIT_PULSES;
      }
    },
    update: (deltaTime: number, electroshock01: number, electroshocked: boolean): void => {
      const dt = Math.max(0, deltaTime);
      uniforms.uTime.value += dt;
      root.updateWorldMatrix(true, false);
      uniforms.uRootWorldInverse.value.copy(root.matrixWorld).invert();
      updateHitPulses(dt);
      rescanSecondsRemaining -= dt;
      if (rescanSecondsRemaining <= 0) {
        rescan();
        rescanSecondsRemaining = RESCAN_INTERVAL_SECONDS;
      }
      applyVisualState(THREE.MathUtils.clamp(electroshock01, 0, 1), electroshocked);
    },
    dispose: (): void => {
      hitPulses.length = 0;
      for (const entry of overlayEntries.values()) {
        entry.overlayMesh.removeFromParent();
      }
      overlayEntries.clear();
      overlayMaterial.dispose();
    }
  };
}
