import * as THREE from "three";

type ActiveConcussiveBlastRing = {
  age: number;
  lifetime: number;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  radius: number;
};

export type ConcussiveBlastRingSystem = {
  spawnRing: (origin: THREE.Vector3, radius: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type ConcussiveBlastRingSystemConfig = {
  lifetimeSeconds?: number;
  color?: number;
  opacity?: number;
};

const DEFAULT_RING_LIFETIME_SECONDS = 0.28;

const RING_VERTEX_SHADER = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const RING_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float ndv = abs(dot(normalize(vWorldNormal), viewDir));
  float rim = pow(clamp(1.0 - ndv, 0.0, 1.0), 1.55);
  float softRim = smoothstep(0.02, 0.92, rim);
  float alpha = softRim * uOpacity;
  if (alpha <= 0.002) {
    discard;
  }

  vec3 color = uColor * (0.7 + softRim * 0.45);
  gl_FragColor = vec4(color, alpha);
}
`;

export function createConcussiveBlastRingSystem(
  scene: THREE.Scene,
  config: ConcussiveBlastRingSystemConfig = {}
): ConcussiveBlastRingSystem {
  const lifetimeSeconds = Math.max(0.05, config.lifetimeSeconds ?? DEFAULT_RING_LIFETIME_SECONDS);
  const baseOpacity = THREE.MathUtils.clamp(config.opacity ?? 0.85, 0, 1);
  const ringColor = config.color ?? 0xffb35a;

  const root = new THREE.Group();
  scene.add(root);

  const ringGeometry = new THREE.SphereGeometry(1, 22, 16);
  const activeRings: ActiveConcussiveBlastRing[] = [];
  const ringColorVec = new THREE.Color(ringColor);

  const spawnRing = (origin: THREE.Vector3, radius: number): void => {
    const clampedRadius = Math.max(0.01, radius);
    const material = new THREE.ShaderMaterial({
      vertexShader: RING_VERTEX_SHADER,
      fragmentShader: RING_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uColor: { value: new THREE.Vector3(ringColorVec.r, ringColorVec.g, ringColorVec.b) },
        uOpacity: { value: baseOpacity }
      }
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.position.copy(origin);
    mesh.scale.setScalar(clampedRadius);
    mesh.renderOrder = 24;
    mesh.frustumCulled = false;
    root.add(mesh);

    activeRings.push({
      age: 0,
      lifetime: lifetimeSeconds,
      material,
      mesh,
      radius: clampedRadius
    });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = activeRings.length - 1; i >= 0; i -= 1) {
      const ring = activeRings[i];
      ring.age += deltaTime;
      const t = THREE.MathUtils.clamp(ring.age / Math.max(0.0001, ring.lifetime), 0, 1);
      ring.mesh.scale.setScalar(ring.radius);
      ring.material.uniforms.uOpacity.value = baseOpacity * (1 - t) * (1 - t);

      if (t < 1) {
        continue;
      }

      ring.mesh.removeFromParent();
      ring.material.dispose();
      activeRings.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const ring of activeRings) {
      ring.mesh.removeFromParent();
      ring.material.dispose();
    }
    activeRings.length = 0;
    ringGeometry.dispose();
    root.removeFromParent();
  };

  return { spawnRing, update, dispose };
}
