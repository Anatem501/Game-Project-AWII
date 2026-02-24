import * as THREE from "three";

type FrostBurst = {
  age: number;
  lifetime: number;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
};

export type FrostHitCrystalBurstSystem = {
  spawnBurst: (origin: THREE.Vector3, forwardHint?: THREE.Vector3, effectScale?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type FrostHitCrystalBurstConfig = {
  burstCount?: number;
  lifetimeSeconds?: number;
  speedMin?: number;
  speedMax?: number;
};

const DEFAULT_BURST_COUNT = 28;
const DEFAULT_LIFETIME_SECONDS = 0.26;
const DEFAULT_SPEED_MIN = 0.8;
const DEFAULT_SPEED_MAX = 3.5;
const DEFAULT_DIRECTIONAL_SPREAD_RADIANS = THREE.MathUtils.degToRad(34);

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
  float drift = (1.0 - t) * 0.035;
  vec3 wobble = vec3(
    sin(aSeed * 23.0 + uAge * 8.0),
    cos(aSeed * 17.0 - uAge * 9.0),
    sin(aSeed * 29.0 + uAge * 7.0)
  ) * drift;
  vec3 displaced = position + aVelocity * uAge + wobble;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float baseSize = mix(18.0, 2.2, t) * uScale;
  float sparkle = 0.82 + 0.18 * abs(sin(aSeed * 41.0 + uAge * 24.0));
  gl_PointSize = baseSize * sparkle * (uViewportHeight / max(340.0, -mvPosition.z * 205.0));

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

  float shardAxis = abs(cos(angle * 3.0 + vSeed * 9.0));
  float shard = smoothstep(0.95, 0.15, d) * smoothstep(0.18, 0.95, shardAxis);
  float core = smoothstep(0.26, 0.0, d);
  float halo = smoothstep(0.75, 0.18, d) * (1.0 - core);
  float twinkle = 0.72 + 0.28 * abs(sin((1.0 - vLife) * 30.0 + vSeed * 37.0));
  float alpha = (core * 0.55 + shard * 1.1 + halo * 0.35) * vLife * twinkle;

  if (alpha <= 0.001) {
    discard;
  }

  vec3 deepIce = vec3(0.18, 0.56, 0.95);
  vec3 frost = vec3(0.72, 0.93, 1.0);
  vec3 whiteIce = vec3(0.96, 1.0, 1.0);
  float mixT = clamp(core * 0.75 + shard * 0.65 + halo * 0.25, 0.0, 1.0);
  vec3 color = mix(deepIce, frost, mixT);
  color = mix(color, whiteIce, core * 0.65 + shard * 0.22);
  gl_FragColor = vec4(color, alpha);
}
`;

export function createFrostHitCrystalBurstSystem(
  scene: THREE.Scene,
  config: FrostHitCrystalBurstConfig = {}
): FrostHitCrystalBurstSystem {
  const burstCount = Math.max(1, Math.floor(config.burstCount ?? DEFAULT_BURST_COUNT));
  const lifetimeSeconds = Math.max(0.01, config.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS);
  const speedMin = Math.max(0, config.speedMin ?? DEFAULT_SPEED_MIN);
  const speedMax = Math.max(speedMin, config.speedMax ?? DEFAULT_SPEED_MAX);

  const root = new THREE.Group();
  scene.add(root);
  const bursts: FrostBurst[] = [];

  const forward = new THREE.Vector3(0, 0, 1);
  const spawnDirection = new THREE.Vector3();
  const baseQuat = new THREE.Quaternion();
  const localDir = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const coneSpreadCos = Math.cos(DEFAULT_DIRECTIONAL_SPREAD_RADIANS);

  const spawnBurst = (
    origin: THREE.Vector3,
    forwardHint?: THREE.Vector3,
    effectScale = 1
  ): void => {
    const clampedScale = Math.max(0.1, effectScale);
    spawnDirection.copy(forwardHint ?? forward);
    if (spawnDirection.lengthSq() <= 0.000001) {
      spawnDirection.copy(forward);
    } else {
      spawnDirection.normalize();
    }
    baseQuat.setFromUnitVectors(forward, spawnDirection);

    const positions = new Float32Array(burstCount * 3);
    const velocities = new Float32Array(burstCount * 3);
    const seeds = new Float32Array(burstCount);
    for (let i = 0; i < burstCount; i += 1) {
      const index = i * 3;
      positions[index] = origin.x;
      positions[index + 1] = origin.y;
      positions[index + 2] = origin.z;

      const theta = Math.random() * Math.PI * 2;
      const cosSpread = THREE.MathUtils.lerp(coneSpreadCos, 1, Math.pow(Math.random(), 1.6));
      const sinSpread = Math.sqrt(Math.max(0, 1 - cosSpread * cosSpread));
      localDir.set(Math.cos(theta) * sinSpread, Math.sin(theta) * sinSpread, cosSpread);
      localDir.applyQuaternion(baseQuat).normalize();

      const speed = randomRange(speedMin, speedMax) * Math.sqrt(clampedScale);
      velocity.copy(localDir).multiplyScalar(speed);
      velocities[index] = velocity.x;
      velocities[index + 1] = velocity.y;
      velocities[index + 2] = velocity.z;
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
        uLifetime: { value: lifetimeSeconds },
        uViewportHeight: { value: window.innerHeight || 1080 },
        uScale: { value: clampedScale }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });

    const points = new THREE.Points(geometry, material);
    root.add(points);
    bursts.push({ age: 0, lifetime: lifetimeSeconds, material, points });
  };

  const update = (deltaTime: number): void => {
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

  const dispose = (): void => {
    for (const burst of bursts) {
      burst.points.removeFromParent();
      burst.points.geometry.dispose();
      burst.material.dispose();
    }
    bursts.length = 0;
    root.removeFromParent();
  };

  return { spawnBurst, update, dispose };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
