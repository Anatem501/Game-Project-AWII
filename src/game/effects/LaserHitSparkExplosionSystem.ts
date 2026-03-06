import * as THREE from "three";

type SparkExplosion = {
  age: number;
  lifetime: number;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
};

export type LaserHitSparkExplosionSystem = {
  spawnExplosion: (origin: THREE.Vector3, forwardHint?: THREE.Vector3) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type LaserHitSparkExplosionConfig = {
  sparkCount?: number;
  lifetimeSeconds?: number;
  speedMin?: number;
  speedMax?: number;
  color?: number;
  coreColor?: number;
  glowColor?: number;
  spreadRadians?: number;
  pointSizeScale?: number;
  opacityScale?: number;
  upwardDriftScale?: number;
  verticalScale?: number;
  blobiness?: number;
};

const DEFAULT_SPARK_COUNT = 48;
const DEFAULT_LIFETIME_SECONDS = 0.22;
const DEFAULT_SPEED_MIN = 4;
const DEFAULT_SPEED_MAX = 14;
const DEFAULT_DIRECTIONAL_SPREAD_RADIANS = THREE.MathUtils.degToRad(42);

const VERTEX_SHADER = `
attribute vec3 aVelocity;
attribute float aSeed;

uniform float uAge;
uniform float uLifetime;
uniform float uViewportHeight;
uniform float uPointSizeScale;
uniform float uVerticalDriftScale;

varying float vLife;
varying float vSeed;

void main() {
  float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
  vec3 displaced = position + aVelocity * uAge;
  displaced.y += (1.0 - t) * 0.08 * uVerticalDriftScale;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = mix(22.0, 2.4, t) * uPointSizeScale;
  gl_PointSize = size * (uViewportHeight / max(360.0, -mvPosition.z * 210.0));

  vLife = 1.0 - t;
  vSeed = aSeed;
}
`;

const FRAGMENT_SHADER = `
varying float vLife;
varying float vSeed;
uniform vec3 uCoreColor;
uniform vec3 uGlowColor;
uniform float uOpacityScale;
uniform float uBlobiness;

void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  float angle = atan(p.y, p.x);
  float radiusWarp = sin(angle * 5.0 + vSeed * 19.0 + (1.0 - vLife) * 8.0) * 0.065 * uBlobiness;
  radiusWarp += sin(angle * 9.0 - vSeed * 31.0 + (1.0 - vLife) * 12.0) * 0.038 * uBlobiness;
  float d = length(p) - radiusWarp;
  float core = smoothstep(mix(0.45, 0.56, clamp(uBlobiness, 0.0, 1.0)), 0.0, d);
  float glow = smoothstep(mix(0.65, 0.82, clamp(uBlobiness, 0.0, 1.0)), 0.0, d);
  float flicker = 0.7 + 0.3 * sin((1.0 - vLife) * 28.0 + vSeed * 17.0);
  float alpha = (core * 1.2 + glow * 0.5) * vLife * flicker * uOpacityScale;

  vec3 paletteColor = mix(uGlowColor, uCoreColor, clamp(core * 1.15, 0.0, 1.0));
  vec3 color = paletteColor * (0.75 + flicker * 0.7);
  if (alpha <= 0.001) {
    discard;
  }
  gl_FragColor = vec4(color, alpha);
}
`;

export function createLaserHitSparkExplosionSystem(
  scene: THREE.Scene,
  config: LaserHitSparkExplosionConfig = {}
): LaserHitSparkExplosionSystem {
  const sparkCount = Math.max(1, Math.floor(config.sparkCount ?? DEFAULT_SPARK_COUNT));
  const lifetimeSeconds = Math.max(0.01, config.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS);
  const speedMin = Math.max(0, config.speedMin ?? DEFAULT_SPEED_MIN);
  const speedMax = Math.max(speedMin, config.speedMax ?? DEFAULT_SPEED_MAX);
  const spreadRadians = THREE.MathUtils.clamp(
    config.spreadRadians ?? DEFAULT_DIRECTIONAL_SPREAD_RADIANS,
    0,
    Math.PI
  );
  const pointSizeScale = Math.max(0.1, config.pointSizeScale ?? 1);
  const opacityScale = THREE.MathUtils.clamp(config.opacityScale ?? 1, 0, 1);
  const upwardDriftScale = THREE.MathUtils.clamp(config.upwardDriftScale ?? 1, 0, 2);
  const verticalScale = THREE.MathUtils.clamp(config.verticalScale ?? 1, 0.05, 1);
  const blobiness = THREE.MathUtils.clamp(config.blobiness ?? 0, 0, 1.5);
  const fallbackColor = config.color ?? 0x40ff6b;
  const sparkCoreColor = new THREE.Color(config.coreColor ?? 0xf6fffb);
  const sparkGlowColor = new THREE.Color(config.glowColor ?? fallbackColor);

  const root = new THREE.Group();
  scene.add(root);
  const explosions: SparkExplosion[] = [];

  const forward = new THREE.Vector3(0, 0, 1);
  const spawnDirection = new THREE.Vector3();
  const baseQuat = new THREE.Quaternion();
  const localDir = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const coneSpreadCos = Math.cos(spreadRadians);

  const spawnExplosion = (origin: THREE.Vector3, forwardHint?: THREE.Vector3): void => {
    spawnDirection.copy(forwardHint ?? forward);
    if (spawnDirection.lengthSq() <= 0.000001) {
      spawnDirection.copy(forward);
    } else {
      spawnDirection.normalize();
    }
    baseQuat.setFromUnitVectors(forward, spawnDirection);

    const positions = new Float32Array(sparkCount * 3);
    const velocities = new Float32Array(sparkCount * 3);
    const seeds = new Float32Array(sparkCount);

    for (let i = 0; i < sparkCount; i += 1) {
      const index = i * 3;
      positions[index] = origin.x;
      positions[index + 1] = origin.y;
      positions[index + 2] = origin.z;

      const theta = Math.random() * Math.PI * 2;
      const cosSpread = THREE.MathUtils.lerp(coneSpreadCos, 1, Math.random());
      const sinSpread = Math.sqrt(Math.max(0, 1 - cosSpread * cosSpread));
      localDir.set(
        Math.cos(theta) * sinSpread,
        Math.sin(theta) * sinSpread,
        cosSpread
      );
      localDir.applyQuaternion(baseQuat);
      localDir.y *= verticalScale;
      if (localDir.lengthSq() <= 0.000001) {
        localDir.copy(spawnDirection);
      } else {
        localDir.normalize();
      }

      const speed = randomRange(speedMin, speedMax);
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
        uPointSizeScale: { value: pointSizeScale },
        uVerticalDriftScale: { value: upwardDriftScale },
        uOpacityScale: { value: opacityScale },
        uBlobiness: { value: blobiness },
        uCoreColor: { value: new THREE.Vector3(sparkCoreColor.r, sparkCoreColor.g, sparkCoreColor.b) },
        uGlowColor: { value: new THREE.Vector3(sparkGlowColor.r, sparkGlowColor.g, sparkGlowColor.b) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    root.add(points);
    explosions.push({ age: 0, lifetime: lifetimeSeconds, material, points });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    const viewportHeight = window.innerHeight || 1080;
    for (let i = explosions.length - 1; i >= 0; i -= 1) {
      const explosion = explosions[i];
      explosion.age += deltaTime;
      explosion.material.uniforms.uAge.value = explosion.age;
      explosion.material.uniforms.uViewportHeight.value = viewportHeight;
      if (explosion.age < explosion.lifetime) {
        continue;
      }

      explosion.points.removeFromParent();
      explosion.points.geometry.dispose();
      explosion.material.dispose();
      explosions.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const explosion of explosions) {
      explosion.points.removeFromParent();
      explosion.points.geometry.dispose();
      explosion.material.dispose();
    }
    explosions.length = 0;
    root.removeFromParent();
  };

  return { spawnExplosion, update, dispose };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
