import * as THREE from "three";

type GlobBurst = {
  age: number;
  lifetime: number;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
};

export type PlasmaMuzzleGlobBurstSystem = {
  spawnBurst: (origin: THREE.Vector3, direction: THREE.Vector3) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type PlasmaMuzzleGlobBurstSystemConfig = {
  globCountPerBurst?: number;
  burstLifetimeSeconds?: number;
  speedMin?: number;
  speedMax?: number;
  spreadRadians?: number;
};

const DEFAULT_GLOB_COUNT = 20;
const DEFAULT_BURST_LIFETIME_SECONDS = 0.22;
const DEFAULT_SPEED_MIN = 0.4;
const DEFAULT_SPEED_MAX = 1.8;
const DEFAULT_SPREAD_RADIANS = THREE.MathUtils.degToRad(16);

const GLOB_VERTEX_SHADER = `
attribute vec3 aVelocity;
attribute float aSeed;

uniform float uAge;
uniform float uLifetime;
uniform float uViewportHeight;

varying float vLife;
varying float vSeed;

void main() {
  float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
  vec3 displaced = position + aVelocity * uAge;
  displaced.y += (1.0 - t) * 0.03;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float baseSize = mix(19.8, 9.0, t);
  gl_PointSize = baseSize * (uViewportHeight / max(330.0, -mvPosition.z * 170.0));

  vLife = 1.0 - t;
  vSeed = aSeed;
}
`;

const GLOB_FRAGMENT_SHADER = `
varying float vLife;
varying float vSeed;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float distanceToCenter = length(centered);
  float blob = smoothstep(0.5, 0.0, distanceToCenter);
  float halo = smoothstep(0.72, 0.0, distanceToCenter);
  float noise = 0.97 + 0.03 * sin(vSeed * 13.0);
  float alpha = (blob * 1.28 + halo * 0.48) * vLife * noise;

  vec3 deepRed = vec3(0.88, 0.03, 0.12);
  vec3 warmCore = vec3(1.0, 0.16, 0.17);
  vec3 color = mix(deepRed, warmCore, pow(blob, 0.8));
  gl_FragColor = vec4(color, alpha);
}
`;

export function createPlasmaMuzzleGlobBurstSystem(
  scene: THREE.Scene,
  config: PlasmaMuzzleGlobBurstSystemConfig = {}
): PlasmaMuzzleGlobBurstSystem {
  const globCountPerBurst = Math.max(
    1,
    Math.floor(config.globCountPerBurst ?? DEFAULT_GLOB_COUNT)
  );
  const burstLifetimeSeconds = Math.max(
    0.01,
    config.burstLifetimeSeconds ?? DEFAULT_BURST_LIFETIME_SECONDS
  );
  const speedMin = Math.max(0, config.speedMin ?? DEFAULT_SPEED_MIN);
  const speedMax = Math.max(speedMin, config.speedMax ?? DEFAULT_SPEED_MAX);
  const spreadRadians = THREE.MathUtils.clamp(
    config.spreadRadians ?? DEFAULT_SPREAD_RADIANS,
    0,
    Math.PI
  );

  const bursts: GlobBurst[] = [];
  const root = new THREE.Group();
  scene.add(root);

  const forwardAxis = new THREE.Vector3(0, 0, 1);
  const burstDirection = new THREE.Vector3();
  const directionQuaternion = new THREE.Quaternion();
  const localDirection = new THREE.Vector3();
  const velocity = new THREE.Vector3();

  const spawnBurst = (origin: THREE.Vector3, direction: THREE.Vector3): void => {
    burstDirection.copy(direction);
    if (burstDirection.lengthSq() <= 0.000001) {
      burstDirection.copy(forwardAxis);
    } else {
      burstDirection.normalize();
    }
    directionQuaternion.setFromUnitVectors(forwardAxis, burstDirection);

    const positions = new Float32Array(globCountPerBurst * 3);
    const velocities = new Float32Array(globCountPerBurst * 3);
    const seeds = new Float32Array(globCountPerBurst);

    for (let i = 0; i < globCountPerBurst; i += 1) {
      const index = i * 3;
      positions[index] = origin.x;
      positions[index + 1] = origin.y;
      positions[index + 2] = origin.z;

      const theta = Math.random() * Math.PI * 2;
      const cosSpread = THREE.MathUtils.lerp(Math.cos(spreadRadians), 1, Math.random());
      const sinSpread = Math.sqrt(Math.max(0, 1 - cosSpread * cosSpread));
      localDirection.set(Math.cos(theta) * sinSpread, Math.sin(theta) * sinSpread, cosSpread);
      localDirection.applyQuaternion(directionQuaternion).normalize();

      const speed = randomRange(speedMin, speedMax);
      velocity.copy(localDirection).multiplyScalar(speed);
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
      vertexShader: GLOB_VERTEX_SHADER,
      fragmentShader: GLOB_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: burstLifetimeSeconds },
        uViewportHeight: { value: window.innerHeight || 1080 }
      }
    });

    const points = new THREE.Points(geometry, material);
    root.add(points);
    bursts.push({ age: 0, lifetime: burstLifetimeSeconds, material, points });
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
