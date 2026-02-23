import * as THREE from "three";

type ActiveVortex = {
  age: number;
  baseScale: number;
  coreMaterial: THREE.MeshBasicMaterial;
  coreMesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  group: THREE.Group;
  lifetime: number;
  swirlMaterial: THREE.ShaderMaterial;
  swirlMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  swirlSpinDirection: number;
};

export type VoidHitVortexSystem = {
  spawnVortex: (origin: THREE.Vector3, forwardHint?: THREE.Vector3, boltRadius?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type VoidHitVortexConfig = {
  lifetimeSeconds?: number;
  radius?: number;
};

const DEFAULT_LIFETIME_SECONDS = 0.34;
const DEFAULT_RADIUS = 0.08;

const PLANE_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANE_FRAGMENT_SHADER = `
uniform float uAge;
uniform float uLifetime;
uniform float uSeed;

varying vec2 vUv;

void main() {
  float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);
  vec2 p = (vUv - vec2(0.5)) * 2.0;
  float r = length(p);
  if (r > 1.0) {
    discard;
  }

  float angle = atan(p.y, p.x);
  float swirlPhaseA = angle * 5.0 - r * 22.0 - t * 13.5 + uSeed;
  float swirlPhaseB = angle * 3.0 - r * 15.0 - t * 9.0 - uSeed * 0.7;
  float armA = pow(0.5 + 0.5 * sin(swirlPhaseA), 2.4);
  float armB = pow(0.5 + 0.5 * sin(swirlPhaseB), 2.0);
  float arm = max(armA, armB * 0.7);

  float bodyMask = smoothstep(1.0, 0.12, r);
  float centerHole = 1.0 - smoothstep(0.05, 0.18, r);
  float rimFade = 1.0 - smoothstep(0.72, 1.0, r);
  float spiralMask = arm * bodyMask * rimFade;

  vec3 deepPurple = vec3(0.07, 0.05, 0.19);
  vec3 midPurple = vec3(0.23, 0.13, 0.39);
  vec3 lightPurple = vec3(0.84, 0.74, 0.95);
  vec3 vortexColor = mix(deepPurple, midPurple, spiralMask * 0.95 + bodyMask * 0.06);
  vortexColor = mix(vortexColor, lightPurple, spiralMask * 0.2);

  float pulse = 0.88 + 0.12 * sin(uSeed * 0.7 + t * 21.0);
  float fade = 1.0 - smoothstep(0.62, 1.0, t);
  float alpha = (spiralMask * 0.92 + bodyMask * 0.06) * fade * pulse;
  alpha *= (1.0 - centerHole * 0.94);
  if (alpha <= 0.01) {
    discard;
  }

  gl_FragColor = vec4(vortexColor * (0.8 + spiralMask * 0.85), alpha);
}
`;

export function createVoidHitVortexSystem(
  scene: THREE.Scene,
  config: VoidHitVortexConfig = {}
): VoidHitVortexSystem {
  const lifetimeSeconds = Math.max(0.01, config.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS);
  const radius = Math.max(0.01, config.radius ?? DEFAULT_RADIUS);

  const root = new THREE.Group();
  scene.add(root);

  const planeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const coreGeometry = new THREE.CircleGeometry(1, 28);
  const activeVortices: ActiveVortex[] = [];

  const defaultForward = new THREE.Vector3(0, 0, 1);
  const impactForward = new THREE.Vector3();
  const alignQuat = new THREE.Quaternion();

  const spawnVortex = (origin: THREE.Vector3, forwardHint?: THREE.Vector3, boltRadius?: number): void => {
    impactForward.copy(forwardHint ?? defaultForward);
    if (impactForward.lengthSq() <= 0.000001) {
      impactForward.copy(defaultForward);
    } else {
      impactForward.normalize();
    }

    const group = new THREE.Group();
    group.position.copy(origin);
    alignQuat.setFromUnitVectors(defaultForward, impactForward);
    group.quaternion.copy(alignQuat);

    const swirlMaterial = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX_SHADER,
      fragmentShader: PLANE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetimeSeconds },
        uSeed: { value: Math.random() * Math.PI * 2 }
      }
    });
    const swirlMesh = new THREE.Mesh(planeGeometry, swirlMaterial);
    swirlMesh.rotation.z = Math.random() * Math.PI * 2;
    group.add(swirlMesh);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0x2a2360,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
    coreMesh.position.z = 0.001;
    group.add(coreMesh);

    const baseScale = Math.max(0.01, (boltRadius ?? radius) * 6.8);
    group.scale.setScalar(baseScale);
    root.add(group);

    activeVortices.push({
      age: 0,
      baseScale,
      coreMaterial,
      coreMesh,
      group,
      lifetime: lifetimeSeconds,
      swirlMaterial,
      swirlMesh,
      swirlSpinDirection: Math.random() < 0.5 ? -1 : 1
    });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = activeVortices.length - 1; i >= 0; i -= 1) {
      const vortex = activeVortices[i];
      vortex.age += deltaTime;
      const t = THREE.MathUtils.clamp(vortex.age / Math.max(0.0001, vortex.lifetime), 0, 1);
      vortex.swirlMaterial.uniforms.uAge.value = vortex.age;

      const shrinkEase = THREE.MathUtils.smoothstep(t, 0, 1);
      const scale = THREE.MathUtils.lerp(vortex.baseScale, vortex.baseScale * 0.12, shrinkEase);
      vortex.group.scale.setScalar(scale);

      const spinRate = THREE.MathUtils.lerp(10, 26, shrinkEase);
      vortex.swirlMesh.rotation.z += deltaTime * spinRate * vortex.swirlSpinDirection;

      const fade = 1 - THREE.MathUtils.smoothstep(t, 0.42, 1);
      vortex.coreMaterial.opacity = 0.9 * (1 - THREE.MathUtils.smoothstep(t, 0.2, 0.9));
      vortex.coreMesh.scale.setScalar(THREE.MathUtils.lerp(0.42, 0.1, shrinkEase));
      vortex.swirlMesh.scale.setScalar(THREE.MathUtils.lerp(1.04, 0.28, shrinkEase));
      vortex.swirlMaterial.opacity = 0.95 * fade;

      if (t < 1) {
        continue;
      }

      vortex.group.removeFromParent();
      vortex.swirlMaterial.dispose();
      vortex.coreMaterial.dispose();
      activeVortices.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const vortex of activeVortices) {
      vortex.group.removeFromParent();
      vortex.swirlMaterial.dispose();
      vortex.coreMaterial.dispose();
    }
    activeVortices.length = 0;
    planeGeometry.dispose();
    coreGeometry.dispose();
    root.removeFromParent();
  };

  return { spawnVortex, update, dispose };
}
