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

const ION_VERTEX_SHADER = `
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

const ION_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uArcColor;
uniform vec3 uRimColor;
uniform float uIntensity;
uniform float uArcSpeed;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.15);

  float stream = 0.5 + 0.5 * sin(vLocalPos.z * 8.5 - uTime * (3.8 * uArcSpeed));
  float arcA = smoothstep(
    0.84,
    0.995,
    abs(sin(vLocalPos.z * 42.0 - uTime * (15.5 * uArcSpeed) + vLocalPos.x * 10.0))
  );
  float arcB = smoothstep(
    0.86,
    0.998,
    abs(sin((vLocalPos.z * 34.0 + vLocalPos.y * 11.0) + uTime * (12.6 * uArcSpeed)))
  );
  float arcMask = clamp(arcA + arcB * 0.9, 0.0, 1.0);

  vec3 baseColor = uCoreColor * (0.72 + stream * 0.28);
  vec3 emissive = mix(baseColor, uArcColor, arcMask);
  emissive *= uIntensity * (0.58 + stream * 0.26 + arcMask * 1.08);
  emissive += uRimColor * fresnel * (uIntensity * 0.62);

  gl_FragColor = vec4(emissive, 1.0);
}
`;

export type IonBoltFactoryOptions = LaserBoltFactoryOptions & {
  modelUrl?: string;
  coreColor?: number;
  arcColor?: number;
  rimColor?: number;
  innerGlowColor?: number;
  outerGlowColor?: number;
  innerGlowScale?: number;
  outerGlowScale?: number;
  glowOpacity?: number;
  outerGlowOpacity?: number;
  arcSpeed?: number;
  orbitShardCount?: number;
  orbitShardOpacity?: number;
  orbitShardRadius?: number;
  orbitShardSpeed?: number;
  trailEnergyCount?: number;
  trailEnergyOpacity?: number;
  trailEnergyLifetimeSeconds?: number;
  trailEnergySpawnIntervalSeconds?: number;
  trailEnergySpeed?: number;
};

type OrbitShard = {
  axialAmplitude: number;
  axialPhase: number;
  axialSpeed: number;
  baseRadiusScale: number;
  baseLengthScale: number;
  flickerOpacityScale: number;
  flickerTimer: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  orbitAxis: THREE.Vector3;
  orbitBasisU: THREE.Vector3;
  orbitBasisV: THREE.Vector3;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  pulsePhase: number;
  spinSpeed: number;
  trailPhaseOffset: number;
  trailStrength: number;
};

type TrailEnergyArc = {
  active: boolean;
  age: number;
  endLengthScale: number;
  endRadiusScale: number;
  flickerSpeed: number;
  lifetime: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  phase: number;
  spinSpeed: number;
  startLengthScale: number;
  startRadiusScale: number;
  velocity: THREE.Vector3;
};

export function createIonBoltFactory(options: IonBoltFactoryOptions = {}): ProjectileFactory {
  const speed = options.speed ?? 28;
  const lifetimeSeconds = options.lifetimeSeconds ?? 2;
  const length = options.length ?? 0.44;
  const thickness = options.thickness ?? 0.06;
  const damage = Math.max(0, options.damage ?? 8);
  const damageType: DamageType = options.damageType ?? "Ion";
  const collisionRadius = Math.max(
    0.01,
    options.collisionRadius ?? Math.max(0.08, thickness * 0.9)
  );
  const faction = options.faction ?? null;

  const coreColor = new THREE.Color(options.coreColor ?? options.color ?? 0x73bcff);
  const arcColor = new THREE.Color(options.arcColor ?? options.emissive ?? 0xf0fbff);
  const rimColor = new THREE.Color(options.rimColor ?? 0x5ca6ff);
  const innerGlowColor = new THREE.Color(options.innerGlowColor ?? 0xd8f1ff);
  const outerGlowColor = new THREE.Color(options.outerGlowColor ?? 0x3d9bff);
  const modelScale = 0.72;
  const modelYawOffsetRadians = Math.PI;
  const ionIntensity = Math.max(0.001, options.emissiveIntensity ?? 3.1);
  const innerGlowScale = Math.max(1.01, options.innerGlowScale ?? 1.45);
  const outerGlowScale = Math.max(innerGlowScale + 0.02, options.outerGlowScale ?? 3.4);
  const outerGlowRadiusScaleMultiplier = 0.8;
  const glowOpacity = THREE.MathUtils.clamp(options.glowOpacity ?? 0.65, 0.01, 1);
  const outerGlowOpacity = THREE.MathUtils.clamp(options.outerGlowOpacity ?? 0.5, 0.01, 1);
  const arcSpeed = Math.max(0.1, options.arcSpeed ?? 1);
  const orbitShardCount = Math.max(3, Math.floor(options.orbitShardCount ?? 10));
  const orbitShardOpacity = THREE.MathUtils.clamp(options.orbitShardOpacity ?? 0.82, 0.01, 1);
  const orbitShardRadius = Math.max(0.004, options.orbitShardRadius ?? thickness * 1.55);
  const orbitShardSpeed = Math.max(0.1, options.orbitShardSpeed ?? 8.6);
  const orbitStartLengthOffset = length * 0.32;
  const orbitShardSizeMultiplier = 1.21;
  const orbitShardThicknessMultiplier = 1.3;
  const trailEnergyCount = Math.max(6, Math.floor(options.trailEnergyCount ?? 20));
  const trailEnergyOpacity = THREE.MathUtils.clamp(options.trailEnergyOpacity ?? 0.68, 0.01, 1);
  const trailEnergyLifetimeSeconds = Math.max(0.015, options.trailEnergyLifetimeSeconds ?? 0.24);
  const trailEnergySpawnIntervalSeconds = Math.max(
    0.002,
    options.trailEnergySpawnIntervalSeconds ?? 0.01
  );
  const trailEnergySpeed = Math.max(0.05, options.trailEnergySpeed ?? 1.25);

  const fallbackGeometry = new THREE.BoxGeometry(thickness, thickness, length);
  const orbitShardGeometry = new THREE.ConeGeometry(
    Math.max(0.0026, thickness * 0.165),
    Math.max(0.012, length * 0.24),
    3,
    1
  );
  const trailEnergyGeometry = new THREE.ConeGeometry(
    Math.max(0.0018, thickness * 0.1),
    Math.max(0.015, length * 0.27),
    3,
    1
  );
  const ionMaterial = new THREE.ShaderMaterial({
    vertexShader: ION_VERTEX_SHADER,
    fragmentShader: ION_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uCoreColor: { value: new THREE.Vector3(coreColor.r, coreColor.g, coreColor.b) },
      uArcColor: { value: new THREE.Vector3(arcColor.r, arcColor.g, arcColor.b) },
      uRimColor: { value: new THREE.Vector3(rimColor.r, rimColor.g, rimColor.b) },
      uIntensity: { value: ionIntensity },
      uArcSpeed: { value: arcSpeed }
    },
    transparent: false,
    depthWrite: true,
    blending: THREE.NormalBlending,
    toneMapped: false
  });

  const innerGlowMaterialTemplate = new THREE.MeshBasicMaterial({
    color: innerGlowColor,
    transparent: true,
    opacity: glowOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const outerGlowMaterialTemplate = new THREE.MeshBasicMaterial({
    color: outerGlowColor,
    transparent: true,
    opacity: outerGlowOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const orbitShardMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0x2f8fff,
    transparent: true,
    opacity: orbitShardOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const trailEnergyMaterialTemplate = new THREE.MeshBasicMaterial({
    color: 0xd6eeff,
    transparent: true,
    opacity: trailEnergyOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });

  const loader = new GLTFLoader();
  const shotQuaternion = new THREE.Quaternion();
  const shardOutwardDirection = new THREE.Vector3();
  const shardBaseAxis = new THREE.Vector3(0, 1, 0);
  const shardFallbackDirection = new THREE.Vector3(1, 0, 0);
  const shardQuaternion = new THREE.Quaternion();
  const shardHelperAxisA = new THREE.Vector3(0, 1, 0);
  const shardHelperAxisB = new THREE.Vector3(1, 0, 0);
  const shardOrbitPlanar = new THREE.Vector3();
  const shardOrbitPosition = new THREE.Vector3();
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
        console.warn("Ionbolt model failed to load, using fallback ion mesh.", error);
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
      : new THREE.Mesh(fallbackGeometry, ionMaterial);
    assignMaterialToMeshes(coreVisual, ionMaterial);
    coreVisual.scale.multiplyScalar(modelScale);
    coreVisual.rotateY(modelYawOffsetRadians);
    projectileGroup.add(coreVisual);

    const innerGlowMaterial = innerGlowMaterialTemplate.clone();
    const innerGlowVisual = coreVisual.clone(true);
    assignMaterialToMeshes(innerGlowVisual, innerGlowMaterial);
    innerGlowVisual.scale.multiplyScalar(innerGlowScale);
    setRenderOrderRecursive(innerGlowVisual, 2);
    projectileGroup.add(innerGlowVisual);

    const outerGlowMaterial = outerGlowMaterialTemplate.clone();
    const outerGlowVisual = coreVisual.clone(true);
    assignMaterialToMeshes(outerGlowVisual, outerGlowMaterial);
    const outerGlowBaseLengthScale = outerGlowVisual.scale.z;
    const outerGlowBaseRadiusScale =
      outerGlowVisual.scale.x * outerGlowScale * outerGlowRadiusScaleMultiplier;
    outerGlowVisual.scale.set(
      outerGlowBaseRadiusScale,
      outerGlowBaseRadiusScale,
      outerGlowBaseLengthScale
    );
    setRenderOrderRecursive(outerGlowVisual, 1);
    projectileGroup.add(outerGlowVisual);

    const orbitShardRoot = new THREE.Group();
    projectileGroup.add(orbitShardRoot);
    const orbitShards: OrbitShard[] = [];
    for (let i = 0; i < orbitShardCount; i += 1) {
      const orbitShardMaterial = orbitShardMaterialTemplate.clone();
      const shard = new THREE.Mesh(orbitShardGeometry, orbitShardMaterial);
      orbitShardRoot.add(shard);
      const orbitAxis = randomUnitVector();
      const helperAxis = Math.abs(orbitAxis.y) < 0.92 ? shardHelperAxisA : shardHelperAxisB;
      const orbitBasisU = helperAxis.clone().cross(orbitAxis).normalize();
      const orbitBasisV = orbitAxis.clone().cross(orbitBasisU).normalize();
      orbitShards.push({
        axialAmplitude: randomRange(thickness * 0.08, thickness * 0.22),
        axialPhase: Math.random() * Math.PI * 2,
        axialSpeed: randomRange(8.0, 14.5),
        baseRadiusScale: randomRange(0.98, 1.5),
        baseLengthScale: randomRange(0.62, 1.08),
        flickerOpacityScale: randomRange(0.65, 1),
        flickerTimer: randomRange(0.015, 0.085),
        material: orbitShardMaterial,
        mesh: shard,
        orbitAxis,
        orbitBasisU,
        orbitBasisV,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: orbitShardRadius * randomRange(1.25, 2.05),
        orbitSpeed: orbitShardSpeed * randomRange(0.75, 1.32),
        pulsePhase: Math.random() * Math.PI * 2,
        spinSpeed: randomRange(5.0, 12.0),
        trailPhaseOffset: Math.random(),
        trailStrength: randomRange(0.82, 1.25)
      });
    }
    const trailEnergyRoot = new THREE.Group();
    projectileGroup.add(trailEnergyRoot);
    const trailEnergyArcs: TrailEnergyArc[] = [];
    for (let i = 0; i < trailEnergyCount; i += 1) {
      const material = trailEnergyMaterialTemplate.clone();
      material.opacity = 0;
      const arc = new THREE.Mesh(trailEnergyGeometry, material);
      arc.visible = false;
      trailEnergyRoot.add(arc);
      trailEnergyArcs.push({
        active: false,
        age: 0,
        endLengthScale: 0.01,
        endRadiusScale: 0.01,
        flickerSpeed: randomRange(16, 36),
        lifetime: trailEnergyLifetimeSeconds,
        material,
        mesh: arc,
        phase: Math.random() * Math.PI * 2,
        spinSpeed: randomRange(-10, 10),
        startLengthScale: 0.01,
        startRadiusScale: 0.01,
        velocity: new THREE.Vector3()
      });
    }
    let trailSpawnCursor = 0;
    let trailSpawnAccumulator = Math.random() * trailEnergySpawnIntervalSeconds;

    const velocity = projectileDirection.multiplyScalar(speed);
    const pulseOffset = Math.random() * Math.PI * 2;
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
        const timeSeconds = performance.now() * 0.001;
        ionMaterial.uniforms.uTime.value = timeSeconds;

        const innerPulse = 0.84 + 0.24 * Math.sin(timeSeconds * 13.5 + pulseOffset);
        const outerPulse = 0.78 + 0.28 * Math.sin(timeSeconds * 9.8 + pulseOffset * 1.31);
        innerGlowMaterial.opacity = glowOpacity * innerPulse;
        outerGlowMaterial.opacity = outerGlowOpacity * outerPulse;
        innerGlowVisual.scale.setScalar(innerGlowScale * (0.95 + innerPulse * 0.08));
        const outerRadiusPulse = outerGlowBaseRadiusScale * (0.94 + outerPulse * 0.1);
        outerGlowVisual.scale.set(
          outerRadiusPulse,
          outerRadiusPulse,
          outerGlowBaseLengthScale
        );
        const nextTrailState = updateTrailEnergyArcs(
          trailEnergyArcs,
          deltaTime,
          thickness,
          length,
          trailEnergySpeed,
          trailEnergyOpacity,
          trailEnergyLifetimeSeconds,
          trailEnergySpawnIntervalSeconds,
          trailSpawnAccumulator,
          trailSpawnCursor
        );
        trailSpawnAccumulator = nextTrailState.spawnAccumulator;
        trailSpawnCursor = nextTrailState.spawnCursor;
        const projectileSpeed = velocity.length();
        const velocityTrailBase =
          length * (0.45 + 1.35 * THREE.MathUtils.clamp(projectileSpeed / 18, 0, 2));
        for (const orbitShard of orbitShards) {
          orbitShard.orbitAngle += orbitShard.orbitSpeed * deltaTime;
          const radialCos = Math.cos(orbitShard.orbitAngle) * orbitShard.orbitRadius;
          const radialSin = Math.sin(orbitShard.orbitAngle) * orbitShard.orbitRadius;
          const axial =
            Math.sin(timeSeconds * orbitShard.axialSpeed + orbitShard.axialPhase) *
            orbitShard.axialAmplitude;

          shardOrbitPlanar
            .copy(orbitShard.orbitBasisU)
            .multiplyScalar(radialCos)
            .addScaledVector(orbitShard.orbitBasisV, radialSin);
          shardOrbitPosition
            .copy(shardOrbitPlanar)
            .addScaledVector(orbitShard.orbitAxis, axial);
          shardOrbitPosition.z += orbitStartLengthOffset;
          const spiral01 = THREE.MathUtils.euclideanModulo(
            orbitShard.orbitAngle / (Math.PI * 2) + orbitShard.trailPhaseOffset,
            1
          );
          shardOrbitPosition.z -= velocityTrailBase * spiral01 * orbitShard.trailStrength;
          orbitShard.mesh.position.copy(shardOrbitPosition);

          shardOutwardDirection.copy(shardOrbitPosition);
          if (shardOutwardDirection.lengthSq() <= 0.000001) {
            shardOutwardDirection.copy(shardFallbackDirection);
          } else {
            shardOutwardDirection.normalize();
          }
          shardQuaternion.setFromUnitVectors(shardBaseAxis, shardOutwardDirection);
          orbitShard.mesh.quaternion.copy(shardQuaternion);
          orbitShard.mesh.rotateY(timeSeconds * orbitShard.spinSpeed + orbitShard.pulsePhase);

          orbitShard.flickerTimer -= deltaTime;
          if (orbitShard.flickerTimer <= 0) {
            orbitShard.flickerTimer = randomRange(0.015, 0.085);
            orbitShard.flickerOpacityScale =
              Math.random() > 0.35 ? randomRange(0.6, 1.0) : randomRange(0.0, 0.18);
          }

          const shardPulse = 0.55 + 0.45 * Math.abs(Math.sin(timeSeconds * 16 + orbitShard.pulsePhase));
          const radialScale =
            orbitShard.baseRadiusScale *
            (0.98 + shardPulse * 0.66) *
            orbitShardSizeMultiplier *
            orbitShardThicknessMultiplier;
          const lengthScale =
            orbitShard.baseLengthScale * (0.68 + shardPulse * 0.56) * orbitShardSizeMultiplier;
          orbitShard.mesh.scale.set(radialScale, lengthScale, radialScale);
          orbitShard.material.opacity = orbitShardOpacity * orbitShard.flickerOpacityScale;
        }

        return lifeRemaining > 0;
      },
      dispose: () => {
        innerGlowMaterial.dispose();
        outerGlowMaterial.dispose();
        for (const orbitShard of orbitShards) {
          orbitShard.material.dispose();
        }
        for (const trailEnergyArc of trailEnergyArcs) {
          trailEnergyArc.material.dispose();
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
      orbitShardGeometry.dispose();
      trailEnergyGeometry.dispose();
      ionMaterial.dispose();
      innerGlowMaterialTemplate.dispose();
      outerGlowMaterialTemplate.dispose();
      orbitShardMaterialTemplate.dispose();
      trailEnergyMaterialTemplate.dispose();
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

function setRenderOrderRecursive(object: THREE.Object3D, renderOrder: number): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    node.renderOrder = renderOrder;
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

function updateTrailEnergyArcs(
  arcs: TrailEnergyArc[],
  deltaTime: number,
  thickness: number,
  length: number,
  trailEnergySpeed: number,
  baseOpacity: number,
  baseLifetimeSeconds: number,
  spawnIntervalSeconds: number,
  spawnAccumulator: number,
  spawnCursor: number
): { spawnAccumulator: number; spawnCursor: number } {
  let localSpawnAccumulator = spawnAccumulator + deltaTime;
  let localSpawnCursor = spawnCursor;

  while (localSpawnAccumulator >= spawnIntervalSeconds) {
    localSpawnAccumulator -= spawnIntervalSeconds;
    const arc = arcs[localSpawnCursor];
    localSpawnCursor = (localSpawnCursor + 1) % arcs.length;

    arc.active = true;
    arc.age = 0;
    arc.lifetime = randomRange(baseLifetimeSeconds * 0.8, baseLifetimeSeconds * 1.3);
    arc.startRadiusScale = randomRange(thickness * 0.2, thickness * 0.34);
    arc.endRadiusScale = Math.max(0.001, arc.startRadiusScale * randomRange(0.35, 0.7));
    arc.startLengthScale = randomRange(length * 0.18, length * 0.34);
    arc.endLengthScale = Math.max(0.001, arc.startLengthScale * randomRange(0.24, 0.58));
    arc.flickerSpeed = randomRange(16, 36);
    arc.phase = randomRange(0, Math.PI * 2);
    arc.spinSpeed = randomRange(-10, 10);
    arc.mesh.visible = true;
    arc.mesh.position.set(
      randomRange(-thickness * 0.16, thickness * 0.16),
      randomRange(-thickness * 0.16, thickness * 0.16),
      randomRange(-length * 0.34, -length * 0.12)
    );
    arc.mesh.rotation.set(
      Math.PI * 0.5 + randomRange(-0.35, 0.35),
      randomRange(0, Math.PI * 2),
      randomRange(-0.55, 0.55)
    );
    arc.mesh.scale.set(arc.startRadiusScale, arc.startLengthScale, arc.startRadiusScale);
    arc.material.opacity = baseOpacity * randomRange(0.82, 1);
    arc.velocity.set(
      randomRange(-0.16, 0.16),
      randomRange(-0.16, 0.16),
      -randomRange(trailEnergySpeed * 1.25, trailEnergySpeed * 2.5)
    );
  }

  for (const arc of arcs) {
    if (!arc.active) {
      continue;
    }
    arc.age += deltaTime;
    const t = THREE.MathUtils.clamp(arc.age / Math.max(0.0001, arc.lifetime), 0, 1);
    if (t >= 1) {
      arc.active = false;
      arc.mesh.visible = false;
      arc.material.opacity = 0;
      continue;
    }

    arc.mesh.position.addScaledVector(arc.velocity, deltaTime);
    arc.mesh.rotateY(arc.spinSpeed * deltaTime);

    const radiusScale = THREE.MathUtils.lerp(arc.startRadiusScale, arc.endRadiusScale, t);
    const lengthScale = THREE.MathUtils.lerp(arc.startLengthScale, arc.endLengthScale, t);
    arc.mesh.scale.set(radiusScale, lengthScale, radiusScale);

    const fade = 1 - THREE.MathUtils.smoothstep(t, 0.15, 1);
    const flicker = 0.55 + 0.45 * Math.abs(Math.sin(arc.age * arc.flickerSpeed + arc.phase));
    arc.material.opacity = baseOpacity * fade * flicker;
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

function randomUnitVector(): THREE.Vector3 {
  const z = randomRange(-1, 1);
  const theta = randomRange(0, Math.PI * 2);
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(radial * Math.cos(theta), radial * Math.sin(theta), z);
}
