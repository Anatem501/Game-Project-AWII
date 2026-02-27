import * as THREE from "three";

type ArcBurst = {
  age: number;
  lifetime: number;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
};

export type ShipElectroshockArcEmitterEffect = {
  update: (deltaTime: number, electroshock01: number, electroshocked: boolean) => void;
  dispose: () => void;
};

const RESCAN_INTERVAL_SECONDS = 0.4;
const MIN_BURSTS_PER_SECOND = 1.2;
const MAX_BURSTS_PER_SECOND = 7;
const ELECTROSHOCKED_EXTRA_BURSTS_PER_SECOND = 2;
const MIN_PARTICLE_COUNT = 8;
const MAX_PARTICLE_COUNT = 18;
const BASE_LIFETIME_SECONDS = 0.24;
const MIN_RADIUS = 0.9;

const VERTEX_SHADER = `
attribute vec3 aVelocity;
attribute float aSeed;

uniform float uAge;
uniform float uLifetime;
uniform float uViewportHeight;
uniform float uScale;

varying float vLife;
varying float vSeed;

void main() {
  float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
  vec3 displaced = position + aVelocity * uAge;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float crackle = 0.74 + 0.26 * abs(sin(uAge * 36.0 + aSeed * 31.0));
  float baseSize = mix(22.0, 5.0, t) * uScale;
  gl_PointSize = baseSize * crackle * (uViewportHeight / max(320.0, -mvPosition.z * 190.0));

  vLife = 1.0 - t;
  vSeed = aSeed;
}
`;

const FRAGMENT_SHADER = `
varying float vLife;
varying float vSeed;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float d = length(p);
  float angle = atan(p.y, p.x);

  float zigA = abs(sin(angle * 7.0 + (1.0 - vLife) * 20.0 + vSeed * 15.0));
  float zigB = abs(sin(angle * 11.0 - (1.0 - vLife) * 15.0 + vSeed * 19.0));
  float zig = smoothstep(0.72, 0.98, max(zigA, zigB));
  float core = smoothstep(0.35, 0.0, d);
  float shell = smoothstep(0.95, 0.12, d) * zig;
  float alpha = (core * 0.48 + shell * 0.94) * vLife * (0.66 + 0.24 * abs(sin(vSeed * 37.0 + vLife * 26.0)));

  if (alpha <= 0.001) {
    discard;
  }

  vec3 deepBlue = vec3(0.10, 0.46, 1.0);
  vec3 brightBlueWhite = vec3(0.86, 0.97, 1.0);
  vec3 color = mix(deepBlue, brightBlueWhite, clamp(core * 0.52 + shell * 0.9, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}
`;

export function createShipElectroshockArcEmitterEffect(
  root: THREE.Object3D
): ShipElectroshockArcEmitterEffect {
  const emitterRoot = new THREE.Group();
  emitterRoot.name = "ShipElectroshockArcEmitter";
  emitterRoot.userData.isElectroshockArcEmitter = true;

  const bursts: ArcBurst[] = [];
  const bounds = new THREE.Box3();
  const localBounds = new THREE.Box3();
  const inverseRootWorld = new THREE.Matrix4();
  const meshToRootLocal = new THREE.Matrix4();
  const meshBounds = new THREE.Box3();
  const localBoundsCenter = new THREE.Vector3();
  const localBoundsSize = new THREE.Vector3();
  const spawnDirection = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const worldCenter = new THREE.Vector3();
  const currentRootWorldPosition = new THREE.Vector3();
  const previousRootWorldPosition = new THREE.Vector3();
  const rootWorldVelocity = new THREE.Vector3();

  let localCenter = new THREE.Vector3();
  let burstRadius = MIN_RADIUS;
  let emissionAccumulator = 0;
  let rescanSecondsRemaining = 0;
  let hasPreviousRootWorldPosition = false;

  const ensureEmitterParent = (): void => {
    const targetParent = root.parent ?? null;
    if (!targetParent) {
      return;
    }
    if (emitterRoot.parent === targetParent) {
      return;
    }
    targetParent.add(emitterRoot);
  };

  const refreshBounds = (): void => {
    root.updateWorldMatrix(true, true);
    inverseRootWorld.copy(root.matrixWorld).invert();
    localBounds.makeEmpty();
    let hasBounds = false;

    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      if (node.userData.isElectroshockArcEmitter || node.userData.isShieldBubbleEffect) {
        return;
      }
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        const isMostlyTransparent = materials.every(
          (material) =>
            material instanceof THREE.Material &&
            material.transparent === true &&
            material.opacity < 0.08
        );
        if (isMostlyTransparent) {
          return;
        }
      }
      if (!node.geometry) {
        return;
      }
      if (!node.geometry.boundingBox) {
        node.geometry.computeBoundingBox();
      }
      if (!node.geometry.boundingBox) {
        return;
      }
      meshBounds.copy(node.geometry.boundingBox);
      meshToRootLocal.multiplyMatrices(inverseRootWorld, node.matrixWorld);
      meshBounds.applyMatrix4(meshToRootLocal);
      if (!hasBounds) {
        localBounds.copy(meshBounds);
        hasBounds = true;
      } else {
        localBounds.union(meshBounds);
      }
    });

    if (!hasBounds) {
      bounds.setFromObject(root);
      if (bounds.isEmpty()) {
        localCenter.set(0, 0.5, 0);
        burstRadius = MIN_RADIUS;
        return;
      }
      localCenter.copy(root.worldToLocal(bounds.getCenter(localBoundsCenter)));
      bounds.getSize(localBoundsSize);
    } else {
      localBounds.getCenter(localBoundsCenter);
      localBounds.getSize(localBoundsSize);
      localCenter.copy(localBoundsCenter);
    }

    const fittedRadius =
      Math.max(localBoundsSize.x, localBoundsSize.y, localBoundsSize.z) * 0.6 * 1.15;
    burstRadius = Math.max(MIN_RADIUS, fittedRadius);
  };

  const spawnBurst = (electroshock01: number, electroshocked: boolean): void => {
    if (!emitterRoot.parent) {
      return;
    }

    root.updateWorldMatrix(true, false);
    worldCenter.copy(localCenter).applyMatrix4(root.matrixWorld);

    const count = Math.floor(
      THREE.MathUtils.lerp(MIN_PARTICLE_COUNT, MAX_PARTICLE_COUNT, electroshock01) *
        (electroshocked ? 1.2 : 1)
    );
    const particleCount = Math.max(1, count);
    const lifetime = BASE_LIFETIME_SECONDS;
    const speedMin = (burstRadius / lifetime) * 0.82;
    const speedMax = (burstRadius / lifetime) * (electroshocked ? 1.22 : 1.06);
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i += 1) {
      const idx = i * 3;
      positions[idx] = worldCenter.x;
      positions[idx + 1] = worldCenter.y;
      positions[idx + 2] = worldCenter.z;

      randomUnitVector(spawnDirection);
      const speed = randomRange(speedMin, speedMax);
      velocity.copy(spawnDirection).multiplyScalar(speed).add(rootWorldVelocity);
      velocities[idx] = velocity.x;
      velocities[idx + 1] = velocity.y;
      velocities[idx + 2] = velocity.z;
      seeds[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aVelocity", new THREE.Float32BufferAttribute(velocities, 3));
    geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetime },
        uViewportHeight: { value: window.innerHeight || 1080 },
        uScale: { value: 0.66 + electroshock01 * 0.34 + (electroshocked ? 0.16 : 0) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    const points = new THREE.Points(geometry, material);
    points.renderOrder = 61;
    emitterRoot.add(points);
    bursts.push({
      age: 0,
      lifetime,
      material,
      points
    });
  };

  const updateBursts = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }
    const viewportHeight = window.innerHeight || 1080;
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const burst = bursts[i];
      burst.age += deltaTime;
      burst.material.uniforms.uAge.value = burst.age;
      burst.material.uniforms.uViewportHeight.value = viewportHeight;
      if (burst.age < burst.lifetime) {
        continue;
      }
      burst.points.removeFromParent();
      burst.points.geometry.dispose();
      burst.material.dispose();
      bursts.splice(i, 1);
    }
  };

  return {
    update: (deltaTime: number, electroshock01: number, electroshocked: boolean): void => {
      ensureEmitterParent();

      const dt = Math.max(0, deltaTime);
      root.getWorldPosition(currentRootWorldPosition);
      if (dt > 0 && hasPreviousRootWorldPosition) {
        rootWorldVelocity
          .copy(currentRootWorldPosition)
          .sub(previousRootWorldPosition)
          .multiplyScalar(1 / dt);
      } else {
        rootWorldVelocity.set(0, 0, 0);
      }
      previousRootWorldPosition.copy(currentRootWorldPosition);
      hasPreviousRootWorldPosition = true;

      rescanSecondsRemaining -= dt;
      if (rescanSecondsRemaining <= 0) {
        refreshBounds();
        rescanSecondsRemaining = RESCAN_INTERVAL_SECONDS;
      }

      const intensity01 = THREE.MathUtils.clamp(electroshock01, 0, 1);
      const active = electroshocked && intensity01 > 0.001;
      if (active) {
        const burstsPerSecond =
          THREE.MathUtils.lerp(MIN_BURSTS_PER_SECOND, MAX_BURSTS_PER_SECOND, intensity01) +
          (electroshocked ? ELECTROSHOCKED_EXTRA_BURSTS_PER_SECOND : 0);
        const interval = 1 / Math.max(0.001, burstsPerSecond);
        emissionAccumulator += dt;
        while (emissionAccumulator >= interval) {
          emissionAccumulator -= interval;
          spawnBurst(intensity01, electroshocked);
        }
      } else {
        emissionAccumulator = 0;
      }

      updateBursts(dt);
    },
    dispose: (): void => {
      for (const burst of bursts) {
        burst.points.removeFromParent();
        burst.points.geometry.dispose();
        burst.material.dispose();
      }
      bursts.length = 0;
      emitterRoot.removeFromParent();
    }
  };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function randomUnitVector(out: THREE.Vector3): THREE.Vector3 {
  const z = randomRange(-1, 1);
  const theta = randomRange(0, Math.PI * 2);
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return out.set(radial * Math.cos(theta), radial * Math.sin(theta), z);
}
