import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHitboxComponent } from "../../components/combat/HitboxComponent";
import { type DamageType } from "../../components/combat/DamageTypes";
import type { LaserBoltFactoryOptions } from "./LaserBoltFactory";
import type {
  ProjectileFactory,
  ProjectileInstance,
  ProjectileSpawnParams
} from "./ProjectileTypes";

const PROJECTILE_FORWARD = new THREE.Vector3(0, 0, 1);

const PLASMA_VERTEX_SHADER = `
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vLocalPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLASMA_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uHotColor;
uniform vec3 uRimColor;
uniform float uIntensity;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.1);

  // Subtle procedural plasma movement without transparency flicker.
  float longitudinal = 0.5 + 0.5 * sin(vLocalPos.z * 18.0 - uTime * 4.2);
  float transverse = 0.5 + 0.5 * sin((vLocalPos.x + vLocalPos.y) * 8.0 + uTime * 1.8);
  float plasma = mix(longitudinal, transverse, 0.22);
  plasma = smoothstep(0.2, 0.94, plasma);

  float heatMix = plasma * 0.62;
  vec3 baseColor = mix(uCoreColor, uHotColor, heatMix);
  vec3 emissive = baseColor * (uIntensity * (0.74 + plasma * 0.46));
  emissive += uRimColor * fresnel * (uIntensity * 0.9);

  gl_FragColor = vec4(emissive, 1.0);
}
`;

export type PlasmaBoltFactoryOptions = LaserBoltFactoryOptions & {
  modelUrl?: string;
  coreColor?: number;
  hotColor?: number;
  rimColor?: number;
  glowColor?: number;
  glowOpacity?: number;
  glowScale?: number;
  trailGlobColor?: number;
  trailGlobOpacity?: number;
  trailGlobCount?: number;
  trailGlobSpawnIntervalSeconds?: number;
  trailGlobLifetimeSeconds?: number;
};

type TrailGlob = {
  active: boolean;
  age: number;
  endScale: number;
  lifetime: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startScale: number;
  velocity: THREE.Vector3;
};

export function createPlasmaBoltFactory(
  options: PlasmaBoltFactoryOptions = {}
): ProjectileFactory {
  const speed = options.speed ?? 28;
  const lifetimeSeconds = options.lifetimeSeconds ?? 2;
  const length = options.length ?? 0.44;
  const thickness = options.thickness ?? 0.06;
  const damage = Math.max(0, options.damage ?? 8);
  const damageType: DamageType = options.damageType ?? "Plasma";
  const collisionRadius = Math.max(
    0.01,
    options.collisionRadius ?? Math.max(0.08, thickness * 0.9)
  );
  const faction = options.faction ?? null;

  const coreColor = new THREE.Color(options.coreColor ?? options.color ?? 0xff2b3d);
  const hotColor = new THREE.Color(options.hotColor ?? 0xff4f58);
  const rimColor = new THREE.Color(options.rimColor ?? 0xb10d2b);
  const glowColor = new THREE.Color(options.glowColor ?? 0xff2b2b);
  const plasmaIntensity = Math.max(0.001, options.emissiveIntensity ?? 3.2);
  const glowOpacity = THREE.MathUtils.clamp(options.glowOpacity ?? 0.18, 0.01, 1);
  const glowScale = Math.max(1.01, options.glowScale ?? 1.18);
  const trailGlobColor =
    options.trailGlobColor !== undefined
      ? new THREE.Color(options.trailGlobColor)
      : glowColor.clone();
  const trailGlobOpacity = THREE.MathUtils.clamp(options.trailGlobOpacity ?? 0.82, 0.05, 1);
  const trailGlobCount = Math.max(2, Math.floor(options.trailGlobCount ?? 9));
  const trailGlobSpawnIntervalSeconds = Math.max(
    0.003,
    options.trailGlobSpawnIntervalSeconds ?? 0.01
  );
  const trailGlobLifetimeSeconds = Math.max(0.001, options.trailGlobLifetimeSeconds ?? 0.04);

  const fallbackGeometry = new THREE.BoxGeometry(thickness, thickness, length);
  const trailGlobGeometry = new THREE.SphereGeometry(1, 14, 12);
  const plasmaMaterial = new THREE.ShaderMaterial({
    vertexShader: PLASMA_VERTEX_SHADER,
    fragmentShader: PLASMA_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uCoreColor: { value: new THREE.Vector3(coreColor.r, coreColor.g, coreColor.b) },
      uHotColor: { value: new THREE.Vector3(hotColor.r, hotColor.g, hotColor.b) },
      uRimColor: { value: new THREE.Vector3(rimColor.r, rimColor.g, rimColor.b) },
      uIntensity: { value: plasmaIntensity }
    },
    transparent: false,
    depthWrite: true,
    blending: THREE.NormalBlending,
    toneMapped: false
  });

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: glowOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const trailGlobMaterial = new THREE.MeshBasicMaterial({
    color: trailGlobColor,
    transparent: true,
    opacity: trailGlobOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  const loader = new GLTFLoader();
  const shotQuaternion = new THREE.Quaternion();
  let modelTemplate: THREE.Object3D | null = null;
  let disposed = false;

  if (options.modelUrl) {
    loader.load(
      options.modelUrl,
      (gltf) => {
        if (disposed) {
          disposeObjectResources(gltf.scene);
          return;
        }
        modelTemplate = normalizeTemplateForwardAndScale(gltf.scene, length);
      },
      undefined,
      (error) => {
        console.warn("Plasmabolt model failed to load, using fallback plasma mesh.", error);
      }
    );
  }

  const spawn = ({ direction, origin }: ProjectileSpawnParams): ProjectileInstance => {
    const projectileGroup = new THREE.Group();
    const projectileDirection = direction.clone();

    if (projectileDirection.lengthSq() <= 0.000001) {
      projectileDirection.copy(PROJECTILE_FORWARD);
    } else {
      projectileDirection.normalize();
    }

    projectileGroup.position.copy(origin);
    shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, projectileDirection);
    projectileGroup.quaternion.copy(shotQuaternion);

    const coreVisual = modelTemplate
      ? modelTemplate.clone(true)
      : new THREE.Mesh(fallbackGeometry, plasmaMaterial);
    assignMaterialToMeshes(coreVisual, plasmaMaterial);
    projectileGroup.add(coreVisual);

    const glowVisual = coreVisual.clone(true);
    assignMaterialToMeshes(glowVisual, glowMaterial);
    glowVisual.scale.multiplyScalar(glowScale);
    projectileGroup.add(glowVisual);

    const trailRoot = new THREE.Group();
    projectileGroup.add(trailRoot);
    const trailGlobs: TrailGlob[] = [];
    for (let i = 0; i < trailGlobCount; i += 1) {
      const material = trailGlobMaterial.clone();
      material.opacity = 0;
      const mesh = new THREE.Mesh(trailGlobGeometry, material);
      mesh.visible = false;
      trailRoot.add(mesh);
      trailGlobs.push({
        active: false,
        age: 0,
        endScale: 0.01,
        lifetime: trailGlobLifetimeSeconds,
        material,
        mesh,
        startScale: 0.01,
        velocity: new THREE.Vector3()
      });
    }
    let trailSpawnCursor = 0;
    let trailSpawnAccumulator = Math.random() * trailGlobSpawnIntervalSeconds;

    const velocity = projectileDirection.multiplyScalar(speed);
    const hitbox = createHitboxComponent({
      owner: projectileGroup,
      collisionArea: { radius: collisionRadius },
      damageAmount: damage,
      damageType,
      sourceFaction: faction
    });
    let lifeRemaining = lifetimeSeconds;

    return {
      object: projectileGroup,
      hitbox,
      update: (deltaTime: number): boolean => {
        lifeRemaining -= deltaTime;
        projectileGroup.position.addScaledVector(velocity, deltaTime);
        plasmaMaterial.uniforms.uTime.value = performance.now() * 0.001;
        const nextTrailState = updateTrailGlobs(
          trailGlobs,
          deltaTime,
          length,
          thickness,
          speed,
          trailGlobOpacity,
          trailGlobLifetimeSeconds,
          trailGlobSpawnIntervalSeconds,
          trailSpawnAccumulator,
          trailSpawnCursor
        );
        trailSpawnAccumulator = nextTrailState.spawnAccumulator;
        trailSpawnCursor = nextTrailState.spawnCursor;
        return lifeRemaining > 0;
      },
      dispose: () => {
        for (const glob of trailGlobs) {
          glob.material.dispose();
        }
      }
    };
  };

  return {
    spawn,
    dispose: () => {
      disposed = true;
      if (modelTemplate) {
        disposeObjectResources(modelTemplate);
      }
      fallbackGeometry.dispose();
      trailGlobGeometry.dispose();
      plasmaMaterial.dispose();
      glowMaterial.dispose();
      trailGlobMaterial.dispose();
    }
  };
}

function normalizeTemplateForwardAndScale(
  template: THREE.Object3D,
  targetLength: number
): THREE.Object3D {
  const bounds = new THREE.Box3().setFromObject(template);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  let longestAxisIndex = 0;
  if (size.y > size.x && size.y >= size.z) {
    longestAxisIndex = 1;
  } else if (size.z > size.x && size.z > size.y) {
    longestAxisIndex = 2;
  }

  const positiveExtent =
    longestAxisIndex === 0
      ? bounds.max.x - center.x
      : longestAxisIndex === 1
        ? bounds.max.y - center.y
        : bounds.max.z - center.z;
  const negativeExtent =
    longestAxisIndex === 0
      ? center.x - bounds.min.x
      : longestAxisIndex === 1
        ? center.y - bounds.min.y
        : center.z - bounds.min.z;
  const forwardSign = positiveExtent >= negativeExtent ? 1 : -1;

  const modelForward = new THREE.Vector3();
  if (longestAxisIndex === 0) {
    modelForward.set(forwardSign, 0, 0);
  } else if (longestAxisIndex === 1) {
    modelForward.set(0, forwardSign, 0);
  } else {
    modelForward.set(0, 0, forwardSign);
  }

  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(modelForward, PROJECTILE_FORWARD);
  template.applyQuaternion(alignQuaternion);

  const alignedBounds = new THREE.Box3().setFromObject(template);
  const alignedSize = alignedBounds.getSize(new THREE.Vector3());
  const sourceLength = Math.max(0.0001, alignedSize.z);
  const uniformScale = targetLength / sourceLength;
  template.scale.setScalar(uniformScale);

  const centeredBounds = new THREE.Box3().setFromObject(template);
  const centered = centeredBounds.getCenter(new THREE.Vector3());
  template.position.sub(centered);
  return template;
}

function assignMaterialToMeshes(object: THREE.Object3D, material: THREE.Material): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.material = material;
  });
}

function disposeObjectResources(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.geometry.dispose();
    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        material.dispose();
      }
    } else {
      node.material.dispose();
    }
  });
}

function updateTrailGlobs(
  globs: TrailGlob[],
  deltaTime: number,
  length: number,
  thickness: number,
  projectileSpeed: number,
  maxOpacity: number,
  lifetimeSeconds: number,
  spawnIntervalSeconds: number,
  spawnAccumulator: number,
  spawnCursor: number
): { spawnAccumulator: number; spawnCursor: number } {
  let localSpawnAccumulator = spawnAccumulator + deltaTime;
  let localSpawnCursor = spawnCursor;

  while (localSpawnAccumulator >= spawnIntervalSeconds) {
    localSpawnAccumulator -= spawnIntervalSeconds;
    const glob = globs[localSpawnCursor];
    localSpawnCursor = (localSpawnCursor + 1) % globs.length;

    glob.active = true;
    glob.age = 0;
    glob.lifetime = randomRange(0.075, 0.095);
    glob.startScale = randomRange(thickness * 0.63, thickness * 1.008);
    glob.endScale = Math.max(0.001, glob.startScale * randomRange(0.42, 0.7));
    glob.mesh.visible = true;
    glob.mesh.position.set(
      randomRange(-thickness * 0.2, thickness * 0.2),
      randomRange(-thickness * 0.2, thickness * 0.2),
      randomRange(-length * 0.06, length * 0.06)
    );
    glob.mesh.scale.setScalar(glob.startScale);
    glob.material.opacity = maxOpacity;
    glob.velocity.set(
      randomRange(-0.18, 0.18),
      randomRange(-0.18, 0.18),
      -randomRange(projectileSpeed * 0.28, projectileSpeed * 0.55)
    );
  }

  for (const glob of globs) {
    if (!glob.active) {
      continue;
    }
    glob.age += deltaTime;
    const t = THREE.MathUtils.clamp(glob.age / Math.max(0.0001, glob.lifetime), 0, 1);
    if (t >= 1) {
      glob.active = false;
      glob.mesh.visible = false;
      glob.material.opacity = 0;
      continue;
    }

    glob.mesh.position.addScaledVector(glob.velocity, deltaTime);
    const scale = THREE.MathUtils.lerp(glob.startScale, glob.endScale, t);
    glob.mesh.scale.setScalar(scale);
    glob.material.opacity = maxOpacity;
  }

  return {
    spawnAccumulator: localSpawnAccumulator,
    spawnCursor: localSpawnCursor
  };
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
