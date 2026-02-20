import * as THREE from "three";

type ImplosionGlob = {
  endScale: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startScale: number;
  velocity: THREE.Vector3;
};

type ActiveImplosion = {
  age: number;
  baseScale: number;
  globMaterial: THREE.MeshBasicMaterial;
  globs: ImplosionGlob[];
  glowMaterial: THREE.MeshBasicMaterial;
  glowMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  lifetime: number;
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
};

export type PlasmaHitImplosionSystem = {
  spawnImplosion: (origin: THREE.Vector3, boltRadius?: number) => void;
  update: (deltaTime: number) => void;
  dispose: () => void;
};

type PlasmaHitImplosionConfig = {
  globCount?: number;
  lifetimeSeconds?: number;
  radius?: number;
};

const DEFAULT_LIFETIME_SECONDS = 0.28;
const DEFAULT_RADIUS = 0.08;
const DEFAULT_GLOB_COUNT = 16;

const IMPLOSION_VERTEX_SHADER = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vLocalPos = position;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const IMPLOSION_FRAGMENT_SHADER = `
uniform float uAge;
uniform float uLifetime;
uniform float uSeed;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  float t = clamp(uAge / max(uLifetime, 0.0001), 0.0, 1.0);

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.1);
  float shellMask = smoothstep(0.62, 1.0, length(vLocalPos));
  float pulse = 0.5 + 0.5 * sin(vLocalPos.z * 6.0 + uSeed * 3.0);
  float plasma = shellMask * (0.8 + pulse * 0.2);

  vec3 deepRed = vec3(0.4, 0.03, 0.05);
  vec3 brightRed = vec3(1.0, 0.14, 0.12);
  vec3 color = mix(deepRed, brightRed, plasma * 0.58);
  float fade = 1.0 - smoothstep(0.72, 1.0, t);
  vec3 emissive = color * (0.72 + fresnel * 0.9) * fade * 1.35;

  float alpha = (shellMask * 0.56 + fresnel * 0.1) * fade;
  if (alpha <= 0.01) {
    discard;
  }
  gl_FragColor = vec4(emissive, alpha);
}
`;

export function createPlasmaHitImplosionSystem(
  scene: THREE.Scene,
  config: PlasmaHitImplosionConfig = {}
): PlasmaHitImplosionSystem {
  const lifetimeSeconds = Math.max(0.01, config.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS);
  const radius = Math.max(0.01, config.radius ?? DEFAULT_RADIUS);
  const globCount = Math.max(0, Math.floor(config.globCount ?? DEFAULT_GLOB_COUNT));
  const root = new THREE.Group();
  scene.add(root);

  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const globGeometry = new THREE.SphereGeometry(1, 20, 16);
  const activeImplosions: ActiveImplosion[] = [];
  const globDirection = new THREE.Vector3();

  const spawnImplosion = (origin: THREE.Vector3, boltRadius?: number): void => {
    const material = new THREE.ShaderMaterial({
      vertexShader: IMPLOSION_VERTEX_SHADER,
      fragmentShader: IMPLOSION_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uAge: { value: 0 },
        uLifetime: { value: lifetimeSeconds },
        uSeed: { value: Math.random() * 1000 }
      }
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    const baseScale = Math.max(0.01, (boltRadius ?? radius) * 1.15);
    mesh.scale.setScalar(baseScale);
    root.add(mesh);

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff1f18,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const glowMesh = new THREE.Mesh(geometry, glowMaterial);
    glowMesh.position.copy(origin);
    glowMesh.scale.setScalar(baseScale * 1.28);
    root.add(glowMesh);

    const globMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2e1f,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    });
    const globs: ImplosionGlob[] = [];
    for (let i = 0; i < globCount; i += 1) {
      const mesh = new THREE.Mesh(globGeometry, globMaterial);
      const startScale = baseScale * randomRange(0.864, 1.512);
      const endScale = startScale * randomRange(0.34, 0.66);
      globDirection.set(randomRange(-1, 1), randomRange(-1, 1), randomRange(-1, 1));
      if (globDirection.lengthSq() < 0.0001) {
        globDirection.set(0, 1, 0);
      } else {
        globDirection.normalize();
      }
      mesh.position.copy(origin).addScaledVector(globDirection, baseScale * randomRange(0.05, 0.18));
      mesh.scale.setScalar(startScale);
      root.add(mesh);
      globs.push({
        endScale,
        mesh,
        startScale,
        velocity: globDirection.clone().multiplyScalar(randomRange(1.0, 2.4))
      });
    }

    activeImplosions.push({
      age: 0,
      baseScale,
      globMaterial,
      globs,
      glowMaterial,
      glowMesh,
      lifetime: lifetimeSeconds,
      material,
      mesh
    });
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    for (let i = activeImplosions.length - 1; i >= 0; i -= 1) {
      const implosion = activeImplosions[i];
      implosion.age += deltaTime;
      implosion.material.uniforms.uAge.value = implosion.age;

      const t = THREE.MathUtils.clamp(implosion.age / implosion.lifetime, 0, 1);
      const shrinkPhaseEnd = 0.32;
      const shrinkScale = implosion.baseScale * 0.62;
      const expandScale = implosion.baseScale * 2.35;
      const radialScale =
        t <= shrinkPhaseEnd
          ? THREE.MathUtils.lerp(implosion.baseScale, shrinkScale, t / shrinkPhaseEnd)
          : THREE.MathUtils.lerp(
              shrinkScale,
              expandScale,
              (t - shrinkPhaseEnd) / Math.max(0.0001, 1 - shrinkPhaseEnd)
            );
      implosion.mesh.scale.setScalar(radialScale);
      implosion.glowMesh.scale.setScalar(radialScale * 1.28);
      const glowFade = 1 - THREE.MathUtils.smoothstep(t, 0.6, 1);
      implosion.glowMaterial.opacity = 0.14 * glowFade;
      const globFade = 1 - THREE.MathUtils.smoothstep(t, 0.42, 1);
      implosion.globMaterial.opacity = 0.42 * globFade;
      for (const glob of implosion.globs) {
        glob.mesh.position.addScaledVector(glob.velocity, deltaTime);
        const drag = Math.max(0, 1 - deltaTime * 6.2);
        glob.velocity.multiplyScalar(drag);
        glob.mesh.scale.setScalar(THREE.MathUtils.lerp(glob.startScale, glob.endScale, t));
      }

      if (t < 1) {
        continue;
      }

      implosion.mesh.removeFromParent();
      implosion.glowMesh.removeFromParent();
      for (const glob of implosion.globs) {
        glob.mesh.removeFromParent();
      }
      implosion.material.dispose();
      implosion.glowMaterial.dispose();
      implosion.globMaterial.dispose();
      activeImplosions.splice(i, 1);
    }
  };

  const dispose = (): void => {
    for (const implosion of activeImplosions) {
      implosion.mesh.removeFromParent();
      implosion.glowMesh.removeFromParent();
      for (const glob of implosion.globs) {
        glob.mesh.removeFromParent();
      }
      implosion.material.dispose();
      implosion.glowMaterial.dispose();
      implosion.globMaterial.dispose();
    }
    activeImplosions.length = 0;
    geometry.dispose();
    globGeometry.dispose();
    root.removeFromParent();
  };

  return { spawnImplosion, update, dispose };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
