import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHitboxComponent } from "../../components/combat/HitboxComponent";
import { type DamageType } from "../../components/combat/DamageTypes";
import type { LaserBoltFactoryOptions } from "./LaserBoltFactory";
import type {
  ProjectileFactory,
  ProjectileInstance,
  ProjectileSelfMergePayload,
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
uniform vec3 uShellColor;
uniform float uIntensity;
uniform float uVoidVariant;
uniform float uPatternScale;
uniform float uStripeStrength;
uniform float uAlpha;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.1);

  // Subtle procedural plasma movement without transparency flicker.
  float longitudinal = 0.5 + 0.5 * sin(vLocalPos.z * (18.0 * uPatternScale) - uTime * 4.2);
  float transverse = 0.5 + 0.5 * sin((vLocalPos.x + vLocalPos.y) * (8.0 * uPatternScale) + uTime * 1.8);
  float plasma = mix(longitudinal, transverse, 0.22);
  plasma = mix(0.7, plasma, uStripeStrength);
  float lowEdge = mix(0.42, 0.2, uStripeStrength);
  float highEdge = mix(0.82, 0.94, uStripeStrength);
  plasma = smoothstep(lowEdge, highEdge, plasma);

  vec3 emissive;
  if (uVoidVariant > 0.5) {
    float innerVoid = 1.0 - smoothstep(0.10, 0.70, plasma);
    float shellPulse = smoothstep(0.72, 0.97, plasma);
    float rimMask = pow(fresnel, 1.8);
    float shellMask = max(rimMask, shellPulse * rimMask * 0.75);
    vec3 voidCore = mix(uHotColor, uCoreColor, innerVoid);
    emissive = voidCore * (uIntensity * (0.006 + plasma * 0.02));
    emissive += uRimColor * shellPulse * (uIntensity * 0.08);
    emissive += uShellColor * shellMask * (uIntensity * (0.26 + plasma * 0.08));
  } else {
    float heatMix = plasma * 0.62;
    vec3 baseColor = mix(uCoreColor, uHotColor, heatMix);
    emissive = baseColor * (uIntensity * (0.74 + plasma * 0.46));
    emissive += uRimColor * fresnel * (uIntensity * 0.9);
  }

  gl_FragColor = vec4(emissive, uAlpha);
}
`;

export type PlasmaBoltShaderVariant = "plasma" | "void";

export type PlasmaBoltFactoryOptions = LaserBoltFactoryOptions & {
  modelUrl?: string;
  reverseModelForward?: boolean;
  modelYawRadians?: number;
  pierceOnCollision?: boolean;
  maxPierceHits?: number;
  shaderVariant?: PlasmaBoltShaderVariant;
  surfacePatternScale?: number;
  surfaceStripeStrength?: number;
  fadeStartSeconds?: number;
  fadeDurationSeconds?: number;
  trailingModelCount?: number;
  trailingModelSpacing?: number;
  trailingModelScaleStep?: number;
  trailingModelOpacity?: number;
  hitEffectId?: string;
  muzzleEffectId?: string;
  selfMergeGroupId?: string;
  maxSelfMergeScaleMultiplier?: number;
  selfMergeScaleStepMultiplier?: number;
  selfMergeForwardVisualScaleStepMultiplier?: number;
  selfMergeRadialVisualScaleStepMultiplier?: number;
  visualForwardScaleMultiplier?: number;
  visualRadialScaleMultiplier?: number;
  glowLayerStyle?: "shell" | "outline" | "none";
  coreColor?: number;
  hotColor?: number;
  rimColor?: number;
  shellColor?: number;
  glowColor?: number;
  glowOpacity?: number;
  glowScale?: number;
  trailGlobColor?: number;
  trailGlobOpacity?: number;
  trailGlobOutlineColor?: number;
  trailGlobOutlineOpacity?: number;
  trailGlobOutlineScale?: number;
  trailGlobCount?: number;
  trailGlobSpawnIntervalSeconds?: number;
  trailGlobLifetimeSeconds?: number;
  trailGlobUseParticleSockets?: boolean;
  bridgeParticleCount?: number;
  bridgeParticleColor?: number;
  bridgeParticleOpacity?: number;
  bridgeParticleSizeMultiplier?: number;
  bridgeParticleSpreadMultiplier?: number;
  orbitShardCount?: number;
  orbitShardColor?: number;
  orbitShardOpacity?: number;
  orbitShardRadius?: number;
  orbitShardSpeed?: number;
  orbitShardTrailLengthMultiplier?: number;
};

type TrailGlob = {
  active: boolean;
  age: number;
  endScale: number;
  lifetime: number;
  material: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  outlineMaterial?: THREE.MeshBasicMaterial;
  outlineMesh?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  outlineMaxOpacity: number;
  startScale: number;
  velocity: THREE.Vector3;
};

type GhostTrailSample = {
  ageSeconds: number;
  worldPosition: THREE.Vector3;
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
  const pierceOnCollision = options.pierceOnCollision ?? false;
  const maxPierceHits = Math.max(1, Math.floor(options.maxPierceHits ?? (pierceOnCollision ? 12 : 1)));

  const coreColor = new THREE.Color(options.coreColor ?? options.color ?? 0xff2b3d);
  const hotColor = new THREE.Color(options.hotColor ?? 0xff4f58);
  const rimColor = new THREE.Color(options.rimColor ?? 0xb10d2b);
  const shellColor = new THREE.Color(options.shellColor ?? options.hotColor ?? 0xffc2cb);
  const glowColor = new THREE.Color(options.glowColor ?? 0xff2b2b);
  const shaderVariant = options.shaderVariant ?? "plasma";
  const surfacePatternScale = Math.max(0.1, options.surfacePatternScale ?? 1);
  const surfaceStripeStrength = THREE.MathUtils.clamp(options.surfaceStripeStrength ?? 1, 0, 1);
  const fadeStartSeconds = Math.max(0, options.fadeStartSeconds ?? lifetimeSeconds);
  const fadeDurationSeconds = Math.max(0.01, options.fadeDurationSeconds ?? 0.25);
  const usesVisualFade = fadeStartSeconds < lifetimeSeconds;
  const trailingModelCount = Math.max(0, Math.floor(options.trailingModelCount ?? 0));
  const trailingModelSpacing = Math.max(0.001, options.trailingModelSpacing ?? (length * 0.28));
  const trailingModelScaleStep = Math.max(0.01, options.trailingModelScaleStep ?? 0.12);
  const trailingModelOpacity = THREE.MathUtils.clamp(options.trailingModelOpacity ?? 0.12, 0.01, 1);
  const reverseModelForward = Boolean(options.reverseModelForward);
  const modelYawRadians = options.modelYawRadians ?? 0;
  const glowLayerStyle = options.glowLayerStyle ?? "shell";
  const hasGlowLayer = glowLayerStyle !== "none";
  const plasmaIntensity = Math.max(0.001, options.emissiveIntensity ?? 3.2);
  const glowOpacity = THREE.MathUtils.clamp(options.glowOpacity ?? 0.18, 0.01, 1);
  const glowScale = Math.max(1.01, options.glowScale ?? 1.18);
  const trailGlobColor =
    options.trailGlobColor !== undefined
      ? new THREE.Color(options.trailGlobColor)
      : glowColor.clone();
  const trailGlobOpacity = THREE.MathUtils.clamp(options.trailGlobOpacity ?? 0.82, 0.05, 1);
  const trailGlobOutlineColor =
    options.trailGlobOutlineColor !== undefined
      ? new THREE.Color(options.trailGlobOutlineColor)
      : null;
  const trailGlobOutlineOpacity = THREE.MathUtils.clamp(
    options.trailGlobOutlineOpacity ?? Math.min(1, trailGlobOpacity * 0.8),
    0.01,
    1
  );
  const trailGlobOutlineScale = Math.max(1.01, options.trailGlobOutlineScale ?? 1.22);
  const trailGlobCount = Math.max(0, Math.floor(options.trailGlobCount ?? 9));
  const trailGlobSpawnIntervalSeconds = Math.max(
    0.003,
    options.trailGlobSpawnIntervalSeconds ?? 0.01
  );
  const trailGlobLifetimeSeconds = Math.max(0.001, options.trailGlobLifetimeSeconds ?? 0.04);
  const trailGlobUseParticleSockets = options.trailGlobUseParticleSockets ?? false;
  const bridgeParticleCount = Math.max(0, Math.floor(options.bridgeParticleCount ?? 0));
  const bridgeParticleColor = new THREE.Color(options.bridgeParticleColor ?? options.shellColor ?? options.hotColor ?? 0xffc2cb);
  const bridgeParticleOpacity = THREE.MathUtils.clamp(options.bridgeParticleOpacity ?? 0.55, 0.01, 1);
  const bridgeParticleSizeMultiplier = Math.max(0.1, options.bridgeParticleSizeMultiplier ?? 1);
  const bridgeParticleSpreadMultiplier = Math.max(0.1, options.bridgeParticleSpreadMultiplier ?? 1);
  const orbitShardCount = Math.max(0, Math.floor(options.orbitShardCount ?? 0));
  const orbitShardColor = new THREE.Color(options.orbitShardColor ?? glowColor);
  const orbitShardOpacity = THREE.MathUtils.clamp(options.orbitShardOpacity ?? 0.82, 0.01, 1);
  const orbitShardRadius = Math.max(0.004, options.orbitShardRadius ?? thickness * 1.45);
  const orbitShardSpeed = Math.max(0.1, options.orbitShardSpeed ?? 8.2);
  const orbitShardTrailLengthMultiplier = Math.max(
    0,
    options.orbitShardTrailLengthMultiplier ?? 1
  );
  const selfMergeGroupId = options.selfMergeGroupId?.trim() || null;
  const maxSelfMergeScaleMultiplier = Math.max(
    1,
    options.maxSelfMergeScaleMultiplier ?? 4
  );
  const selfMergeScaleStepMultiplier = Math.max(
    1,
    options.selfMergeScaleStepMultiplier ?? 2
  );
  const selfMergeForwardVisualScaleStepMultiplier = Math.max(
    1,
    options.selfMergeForwardVisualScaleStepMultiplier ?? selfMergeScaleStepMultiplier
  );
  const selfMergeRadialVisualScaleStepMultiplier = Math.max(
    1,
    options.selfMergeRadialVisualScaleStepMultiplier ?? selfMergeScaleStepMultiplier
  );
  const visualForwardScaleMultiplier = Math.max(0.01, options.visualForwardScaleMultiplier ?? 1);
  const visualRadialScaleMultiplier = Math.max(0.01, options.visualRadialScaleMultiplier ?? 1);
  const orbitStartLengthOffset = length * 0.3;
  const orbitShardSizeMultiplier = 1.14;
  const orbitShardThicknessMultiplier = 1.2;

  const fallbackGeometry = new THREE.BoxGeometry(thickness, thickness, length);
  const trailGlobGeometry = new THREE.SphereGeometry(1, 14, 12);
  const orbitShardGeometry = new THREE.ConeGeometry(
    Math.max(0.003, thickness * 0.18),
    Math.max(0.01, length * 0.13),
    5,
    1
  );
  const bridgeParticleGeometry = new THREE.BufferGeometry();
  const bridgeParticlePositions = new Float32Array(Math.max(1, bridgeParticleCount) * 3);
  bridgeParticleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(bridgeParticlePositions, 3));
  const plasmaMaterial = new THREE.ShaderMaterial({
    vertexShader: PLASMA_VERTEX_SHADER,
    fragmentShader: PLASMA_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uCoreColor: { value: new THREE.Vector3(coreColor.r, coreColor.g, coreColor.b) },
      uHotColor: { value: new THREE.Vector3(hotColor.r, hotColor.g, hotColor.b) },
      uRimColor: { value: new THREE.Vector3(rimColor.r, rimColor.g, rimColor.b) },
      uShellColor: { value: new THREE.Vector3(shellColor.r, shellColor.g, shellColor.b) },
      uIntensity: { value: plasmaIntensity },
      uVoidVariant: { value: shaderVariant === "void" ? 1 : 0 },
      uPatternScale: { value: surfacePatternScale },
      uStripeStrength: { value: surfaceStripeStrength },
      uAlpha: { value: 1 }
    },
    transparent: usesVisualFade,
    depthWrite: !usesVisualFade,
    blending: THREE.NormalBlending,
    toneMapped: false
  });

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: glowOpacity,
    blending: THREE.AdditiveBlending,
    side: glowLayerStyle === "outline" ? THREE.BackSide : THREE.FrontSide,
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
  const trailGlobOutlineMaterial = trailGlobOutlineColor
    ? new THREE.MeshBasicMaterial({
        color: trailGlobOutlineColor,
        transparent: true,
        opacity: trailGlobOutlineOpacity,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false
      })
    : null;
  const bridgeParticleMaterial = new THREE.PointsMaterial({
    color: bridgeParticleColor,
    size: Math.max(0.02, thickness * 0.34) * bridgeParticleSizeMultiplier,
    transparent: true,
    opacity: bridgeParticleOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    sizeAttenuation: true
  });
  const orbitShardMaterialTemplate = new THREE.MeshBasicMaterial({
    color: orbitShardColor,
    transparent: true,
    opacity: orbitShardOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });

  const loader = new GLTFLoader();
  const shotQuaternion = new THREE.Quaternion();
  const socketA = new THREE.Vector3();
  const socketB = new THREE.Vector3();
  const tmpWorld = new THREE.Vector3();
  const shardOutwardDirection = new THREE.Vector3();
  const shardBaseAxis = new THREE.Vector3(0, 1, 0);
  const shardFallbackDirection = new THREE.Vector3(1, 0, 0);
  const shardQuaternion = new THREE.Quaternion();
  const shardHelperAxisA = new THREE.Vector3(0, 1, 0);
  const shardHelperAxisB = new THREE.Vector3(1, 0, 0);
  const shardOrbitPlanar = new THREE.Vector3();
  const shardOrbitPosition = new THREE.Vector3();
  const currentMergeDirection = new THREE.Vector3();
  const incomingMergeDirection = new THREE.Vector3();
  const mergedDirection = new THREE.Vector3();
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

    const corePlasmaMaterial = plasmaMaterial.clone();
    const coreVisual = modelTemplate
      ? modelTemplate.clone(true)
      : new THREE.Mesh(fallbackGeometry, corePlasmaMaterial);
    if (reverseModelForward) {
      coreVisual.rotateY(Math.PI);
    }
    if (Math.abs(modelYawRadians) > 0.000001) {
      coreVisual.rotateY(modelYawRadians);
    }
    if (
      Math.abs(visualForwardScaleMultiplier - 1) > 0.000001 ||
      Math.abs(visualRadialScaleMultiplier - 1) > 0.000001
    ) {
      coreVisual.scale.multiply(
        new THREE.Vector3(
          visualRadialScaleMultiplier,
          visualRadialScaleMultiplier,
          visualForwardScaleMultiplier
        )
      );
    }
    assignMaterialToMeshes(coreVisual, corePlasmaMaterial);
    projectileGroup.add(coreVisual);

    let glowVisualMaterial: THREE.MeshBasicMaterial | null = null;
    let glowVisual: THREE.Object3D | null = null;
    if (hasGlowLayer) {
      glowVisualMaterial = glowMaterial.clone();
      glowVisual = coreVisual.clone(true);
      assignMaterialToMeshes(glowVisual, glowVisualMaterial);
      glowVisual.scale.multiplyScalar(glowScale);
      projectileGroup.add(glowVisual);
    }

    const trailingModelMaterials: Array<{
      material: THREE.MeshBasicMaterial;
      baseOpacity: number;
      mesh: THREE.Object3D;
      baseScale: THREE.Vector3;
      targetDelaySeconds: number;
    }> = [];
    if (trailingModelCount > 0) {
      for (let i = 0; i < trailingModelCount; i += 1) {
        const t = trailingModelCount <= 1 ? 0 : i / (trailingModelCount - 1);
        const scaleFactor = Math.max(0.03, Math.pow(Math.max(0.05, 1 - trailingModelScaleStep), i + 1));
        const opacityFactor = THREE.MathUtils.lerp(1, 0.35, t);
        const trailMaterial = glowMaterial.clone();
        trailMaterial.opacity = trailingModelOpacity * opacityFactor;
        trailMaterial.depthTest = false;
        const trailVisual = coreVisual.clone(true);
        assignMaterialToMeshes(trailVisual, trailMaterial);
        trailVisual.scale.multiplyScalar(scaleFactor);
        trailVisual.visible = false;
        setRenderOrderRecursive(trailVisual, -1);
        projectileGroup.add(trailVisual);
        trailingModelMaterials.push({
          material: trailMaterial,
          baseOpacity: trailingModelOpacity * opacityFactor,
          mesh: trailVisual,
          baseScale: trailVisual.scale.clone(),
          targetDelaySeconds: (trailingModelSpacing * (i + 1)) / Math.max(0.001, speed)
        });
      }
    }
    const ghostTrailSamples: GhostTrailSample[] = [];
    const ghostSampleWorld = new THREE.Vector3();
    const ghostLocalPosition = new THREE.Vector3();
    const ghostInterpWorld = new THREE.Vector3();

    const trailRoot = new THREE.Group();
    projectileGroup.add(trailRoot);
    const trailGlobs: TrailGlob[] = [];
    for (let i = 0; i < trailGlobCount; i += 1) {
      const material = trailGlobMaterial.clone();
      material.opacity = 0;
      const mesh = new THREE.Mesh(trailGlobGeometry, material);
      mesh.visible = false;
      let outlineMaterial: THREE.MeshBasicMaterial | undefined;
      let outlineMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | undefined;
      if (trailGlobOutlineMaterial) {
        outlineMaterial = trailGlobOutlineMaterial.clone();
        outlineMaterial.opacity = 0;
        outlineMesh = new THREE.Mesh(trailGlobGeometry, outlineMaterial);
        outlineMesh.visible = false;
        outlineMesh.scale.setScalar(trailGlobOutlineScale);
        mesh.add(outlineMesh);
      }
      trailRoot.add(mesh);
      trailGlobs.push({
        active: false,
        age: 0,
        endScale: 0.01,
        lifetime: trailGlobLifetimeSeconds,
        material,
        mesh,
        outlineMaterial,
        outlineMesh,
        outlineMaxOpacity: outlineMaterial ? trailGlobOutlineOpacity : 0,
        startScale: 0.01,
        velocity: new THREE.Vector3()
      });
    }
    let trailSpawnCursor = 0;
    let trailSpawnAccumulator = Math.random() * trailGlobSpawnIntervalSeconds;

    const orbitShardRoot = new THREE.Group();
    projectileGroup.add(orbitShardRoot);
    const orbitShards: OrbitShard[] = [];
    if (orbitShardCount > 0) {
      for (let i = 0; i < orbitShardCount; i += 1) {
        const orbitShardMaterial = orbitShardMaterialTemplate.clone();
        const shard = new THREE.Mesh(orbitShardGeometry, orbitShardMaterial);
        shard.renderOrder = 3;
        orbitShardRoot.add(shard);
        const orbitAxis = randomUnitVector();
        const helperAxis = Math.abs(orbitAxis.y) < 0.92 ? shardHelperAxisA : shardHelperAxisB;
        const orbitBasisU = helperAxis.clone().cross(orbitAxis).normalize();
        const orbitBasisV = orbitAxis.clone().cross(orbitBasisU).normalize();
        orbitShards.push({
          axialAmplitude: randomRange(thickness * 0.06, thickness * 0.18),
          axialPhase: Math.random() * Math.PI * 2,
          axialSpeed: randomRange(7.5, 13.5),
          baseRadiusScale: randomRange(1.0, 1.7),
          baseLengthScale: randomRange(0.42, 0.86),
          flickerOpacityScale: randomRange(0.65, 1),
          flickerTimer: randomRange(0.015, 0.085),
          material: orbitShardMaterial,
          mesh: shard,
          orbitAxis,
          orbitBasisU,
          orbitBasisV,
          orbitAngle: Math.random() * Math.PI * 2,
          orbitRadius: orbitShardRadius * randomRange(1.15, 1.95),
          orbitSpeed: orbitShardSpeed * randomRange(0.75, 1.3),
          pulsePhase: Math.random() * Math.PI * 2,
          spinSpeed: randomRange(5, 12),
          trailPhaseOffset: Math.random(),
          trailStrength: randomRange(1.0, 1.55)
        });
      }
    }

    let bridgePoints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
    let bridgePointsGeometry: THREE.BufferGeometry | null = null;
    let bridgePointsMaterial: THREE.PointsMaterial | null = null;
    const trailSocketAnchorsLocal: THREE.Vector3[] = [];
    if (bridgeParticleCount > 0 || trailGlobUseParticleSockets) {
      projectileGroup.updateMatrixWorld(true);
      resolveBridgeParticleSocketsLocal(
        coreVisual,
        projectileGroup,
        socketA,
        socketB,
        length,
        thickness,
        tmpWorld
      );
      if (trailGlobUseParticleSockets) {
        trailSocketAnchorsLocal.push(socketA.clone(), socketB.clone());
      }
    }
    if (bridgeParticleCount > 0) {
      bridgePointsGeometry = bridgeParticleGeometry.clone();
      bridgePointsMaterial = bridgeParticleMaterial.clone();
      bridgePoints = new THREE.Points(bridgePointsGeometry, bridgePointsMaterial);
      bridgePoints.renderOrder = 2;
      projectileGroup.add(bridgePoints);
    }

    const velocity = projectileDirection.multiplyScalar(speed);
    const baseCollisionRadius = collisionRadius;
    const hitbox = createHitboxComponent({
      owner: projectileGroup,
      collisionArea: { radius: baseCollisionRadius },
      damageAmount: damage,
      damageType,
      additionalDamageSegments: options.additionalDamageSegments,
      statusPayloads: options.statusPayloads,
      sourceFaction: faction,
      maxHits: maxPierceHits
    });
    let lifeRemaining = lifetimeSeconds;
    let elapsedSeconds = 0;
    let currentDamageAmount = damage;
    let currentScaleMultiplier = 1;
    let currentVisualForwardScaleMultiplier = 1;
    let currentVisualRadialScaleMultiplier = 1;
    const coreVisualBaseScale = coreVisual.scale.clone();
    const glowVisualBaseScale = glowVisual?.scale.clone() ?? null;

    const setMergedScaleMultiplier = (nextScaleMultiplier: number): void => {
      currentScaleMultiplier = THREE.MathUtils.clamp(nextScaleMultiplier, 1, maxSelfMergeScaleMultiplier);
      hitbox.setCollisionRadius(baseCollisionRadius * currentScaleMultiplier);
      projectileInstance.effectScale = currentScaleMultiplier;
    };

    const setMergedVisualScaleMultipliers = (
      nextRadialScaleMultiplier: number,
      nextForwardScaleMultiplier: number
    ): void => {
      currentVisualRadialScaleMultiplier = THREE.MathUtils.clamp(
        nextRadialScaleMultiplier,
        1,
        maxSelfMergeScaleMultiplier
      );
      currentVisualForwardScaleMultiplier = THREE.MathUtils.clamp(
        nextForwardScaleMultiplier,
        1,
        maxSelfMergeScaleMultiplier
      );
      const mergedScale = new THREE.Vector3(
        currentVisualRadialScaleMultiplier,
        currentVisualRadialScaleMultiplier,
        currentVisualForwardScaleMultiplier
      );
      coreVisual.scale.copy(coreVisualBaseScale).multiply(mergedScale);
      if (glowVisual && glowVisualBaseScale) {
        glowVisual.scale.copy(glowVisualBaseScale).multiply(mergedScale);
      }
    };

    const projectileInstance: ProjectileInstance = {
      object: projectileGroup,
      hitbox,
      hitEffectId: options.hitEffectId,
      muzzleEffectId: options.muzzleEffectId,
      effectScale: 1,
      selfMergeGroupId: selfMergeGroupId ?? undefined,
      getSelfMergeWorldCenter: selfMergeGroupId
        ? (out) => hitbox.getWorldCenter(out)
        : undefined,
      getSelfMergeRadius: selfMergeGroupId
        ? () => Math.max(0, hitbox.collisionArea.radius)
        : undefined,
      getSelfMergePayload: selfMergeGroupId
        ? (): ProjectileSelfMergePayload => ({
            damageAmount: currentDamageAmount,
            scaleMultiplier: currentScaleMultiplier,
            velocity: velocity.clone()
          })
        : undefined,
      absorbSelfMergePayload: selfMergeGroupId
        ? (payload: ProjectileSelfMergePayload): boolean => {
            if (!payload || payload.damageAmount <= 0) {
              return false;
            }

            const incomingVelocity = payload.velocity;
            if (incomingVelocity.lengthSq() > 0.000001) {
              currentMergeDirection.copy(velocity);
              if (currentMergeDirection.lengthSq() <= 0.000001) {
                currentMergeDirection.copy(PROJECTILE_FORWARD);
              } else {
                currentMergeDirection.normalize();
              }
              incomingMergeDirection.copy(incomingVelocity);
              if (incomingMergeDirection.lengthSq() <= 0.000001) {
                incomingMergeDirection.copy(currentMergeDirection);
              } else {
                incomingMergeDirection.normalize();
              }
              mergedDirection.copy(currentMergeDirection).add(incomingMergeDirection);
              if (mergedDirection.lengthSq() <= 0.000001) {
                mergedDirection.copy(currentMergeDirection);
              } else {
                mergedDirection.normalize();
              }
              velocity.copy(mergedDirection).multiplyScalar(speed);
              shotQuaternion.setFromUnitVectors(PROJECTILE_FORWARD, mergedDirection);
              projectileGroup.quaternion.copy(shotQuaternion);
            }

            currentDamageAmount += Math.max(0, payload.damageAmount);
            hitbox.setDamageAmount(currentDamageAmount);
            setMergedScaleMultiplier(currentScaleMultiplier * selfMergeScaleStepMultiplier);
            setMergedVisualScaleMultipliers(
              currentVisualRadialScaleMultiplier * selfMergeRadialVisualScaleStepMultiplier,
              currentVisualForwardScaleMultiplier * selfMergeForwardVisualScaleStepMultiplier
            );
            return true;
          }
        : undefined,
      beginDestroy: (reason) => (reason === "collision" ? !pierceOnCollision : true),
      update: (deltaTime: number): boolean => {
        lifeRemaining -= deltaTime;
        projectileGroup.position.addScaledVector(velocity, deltaTime);
        elapsedSeconds += Math.max(0, deltaTime);
        const ageSeconds = elapsedSeconds;
        const nowSeconds = ageSeconds;
        let visualAlpha = 1;
        if (usesVisualFade && ageSeconds > fadeStartSeconds) {
          const fadeT = THREE.MathUtils.clamp(
            (ageSeconds - fadeStartSeconds) / fadeDurationSeconds,
            0,
            1
          );
          visualAlpha = 1 - fadeT;
        }
        corePlasmaMaterial.uniforms.uTime.value = ageSeconds;
        corePlasmaMaterial.uniforms.uAlpha.value = visualAlpha;
        if (glowVisualMaterial) {
          glowVisualMaterial.opacity = glowOpacity * visualAlpha;
        }
        if (orbitShards.length > 0) {
          const projectileSpeed = velocity.length();
          const velocityTrailBase =
            length *
            (0.56 + 1.95 * THREE.MathUtils.clamp(projectileSpeed / 18, 0, 2)) *
            orbitShardTrailLengthMultiplier;
          for (const orbitShard of orbitShards) {
            orbitShard.orbitAngle += orbitShard.orbitSpeed * deltaTime;
            const radialCos = Math.cos(orbitShard.orbitAngle) * orbitShard.orbitRadius;
            const radialSin = Math.sin(orbitShard.orbitAngle) * orbitShard.orbitRadius;
            const axial =
              Math.sin(nowSeconds * orbitShard.axialSpeed + orbitShard.axialPhase) *
              orbitShard.axialAmplitude;

            shardOrbitPlanar
              .copy(orbitShard.orbitBasisU)
              .multiplyScalar(radialCos)
              .addScaledVector(orbitShard.orbitBasisV, radialSin);
            shardOrbitPosition.copy(shardOrbitPlanar).addScaledVector(orbitShard.orbitAxis, axial);
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
            orbitShard.mesh.rotateY(nowSeconds * orbitShard.spinSpeed + orbitShard.pulsePhase);

            orbitShard.flickerTimer -= deltaTime;
            if (orbitShard.flickerTimer <= 0) {
              orbitShard.flickerTimer = randomRange(0.015, 0.085);
              orbitShard.flickerOpacityScale =
                Math.random() > 0.35 ? randomRange(0.62, 1.0) : randomRange(0.08, 0.3);
            }

            const shardPulse =
              0.55 + 0.45 * Math.abs(Math.sin(nowSeconds * 15.5 + orbitShard.pulsePhase));
            const radialScale =
              orbitShard.baseRadiusScale *
              (1.02 + shardPulse * 0.78) *
              orbitShardSizeMultiplier *
              (orbitShardThicknessMultiplier * 1.18);
            const lengthScale =
              orbitShard.baseLengthScale *
              (0.58 + shardPulse * 0.38) *
              (orbitShardSizeMultiplier * 0.92);
            orbitShard.mesh.scale.set(radialScale, lengthScale, radialScale);
            orbitShard.material.opacity =
              orbitShardOpacity * orbitShard.flickerOpacityScale * visualAlpha;
          }
        }
        if (trailingModelMaterials.length > 0) {
          projectileGroup.getWorldPosition(ghostSampleWorld);
          ghostTrailSamples.push({
            ageSeconds,
            worldPosition: ghostSampleWorld.clone()
          });
          const maxDelaySeconds =
            trailingModelMaterials[trailingModelMaterials.length - 1]?.targetDelaySeconds ?? 0;
          const minSampleAge = ageSeconds - Math.max(0.05, maxDelaySeconds + 0.2);
          while (ghostTrailSamples.length > 2 && ghostTrailSamples[1].ageSeconds < minSampleAge) {
            ghostTrailSamples.shift();
          }
        }
        for (const trailing of trailingModelMaterials) {
          const sampleAge = ageSeconds - trailing.targetDelaySeconds;
          const hasSample = sampleAge >= 0 && sampleGhostTrailWorldPosition(
            ghostTrailSamples,
            sampleAge,
            ghostInterpWorld
          );
          trailing.mesh.visible = hasSample && visualAlpha > 0.001;
          if (!trailing.mesh.visible) {
            continue;
          }
          ghostLocalPosition.copy(ghostInterpWorld);
          projectileGroup.worldToLocal(ghostLocalPosition);
          trailing.mesh.position.copy(ghostLocalPosition);
          trailing.material.opacity = trailing.baseOpacity * visualAlpha;
          const shrinkAlpha = Math.max(0.001, visualAlpha);
          trailing.mesh.scale.copy(trailing.baseScale).multiplyScalar(shrinkAlpha);
        }
        if (bridgePointsGeometry && bridgeParticleCount > 0) {
          if (bridgePointsMaterial) {
            bridgePointsMaterial.opacity = bridgeParticleOpacity * visualAlpha;
          }
          updateBridgeParticles(
            bridgePointsGeometry,
            socketA,
            socketB,
            nowSeconds,
            thickness,
            bridgeParticleSpreadMultiplier
          );
        }
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
          trailSpawnCursor,
          trailSocketAnchorsLocal.length >= 2 ? trailSocketAnchorsLocal : null,
          visualAlpha
        );
        trailSpawnAccumulator = nextTrailState.spawnAccumulator;
        trailSpawnCursor = nextTrailState.spawnCursor;
        return lifeRemaining > 0 && visualAlpha > 0.001;
      },
      dispose: () => {
        corePlasmaMaterial.dispose();
        glowVisualMaterial?.dispose();
        for (const trailing of trailingModelMaterials) {
          trailing.material.dispose();
        }
        for (const glob of trailGlobs) {
          glob.material.dispose();
          glob.outlineMaterial?.dispose();
        }
        for (const orbitShard of orbitShards) {
          orbitShard.material.dispose();
        }
        bridgePointsGeometry?.dispose();
        bridgePointsMaterial?.dispose();
      }
    };
    return projectileInstance;
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
      orbitShardGeometry.dispose();
      plasmaMaterial.dispose();
      glowMaterial.dispose();
      trailGlobMaterial.dispose();
      trailGlobOutlineMaterial?.dispose();
      bridgeParticleGeometry.dispose();
      bridgeParticleMaterial.dispose();
      orbitShardMaterialTemplate.dispose();
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
  spawnCursor: number,
  socketAnchorsLocal: readonly THREE.Vector3[] | null,
  opacityMultiplier = 1
): { spawnAccumulator: number; spawnCursor: number } {
  if (globs.length <= 0) {
    return {
      spawnAccumulator,
      spawnCursor
    };
  }

  let localSpawnAccumulator = spawnAccumulator + deltaTime;
  let localSpawnCursor = spawnCursor;

  while (localSpawnAccumulator >= spawnIntervalSeconds) {
    localSpawnAccumulator -= spawnIntervalSeconds;
    const spawnIndex = localSpawnCursor;
    const glob = globs[spawnIndex];
    localSpawnCursor = (localSpawnCursor + 1) % globs.length;

    glob.active = true;
    glob.age = 0;
    glob.lifetime = randomRange(0.075, 0.095);
    glob.startScale = randomRange(thickness * 0.63, thickness * 1.008);
    glob.endScale = Math.max(0.001, glob.startScale * randomRange(0.42, 0.7));
    glob.mesh.visible = true;
    if (socketAnchorsLocal && socketAnchorsLocal.length > 0) {
      const anchor = socketAnchorsLocal[spawnIndex % socketAnchorsLocal.length];
      glob.mesh.position.copy(anchor);
      // Keep socket-anchored trails visually locked to the marker positions.
      glob.mesh.position.x += randomRange(-thickness * 0.025, thickness * 0.025);
      glob.mesh.position.y += randomRange(-thickness * 0.025, thickness * 0.025);
      glob.mesh.position.z += randomRange(-length * 0.01, length * 0.01);
    } else {
      glob.mesh.position.set(
        randomRange(-thickness * 0.2, thickness * 0.2),
        randomRange(-thickness * 0.2, thickness * 0.2),
        randomRange(-length * 0.06, length * 0.06)
      );
    }
    glob.mesh.scale.setScalar(glob.startScale);
    glob.material.opacity = maxOpacity * opacityMultiplier;
    if (glob.outlineMaterial) {
      glob.outlineMaterial.opacity = glob.outlineMaxOpacity * opacityMultiplier;
    }
    if (glob.outlineMesh) {
      glob.outlineMesh.visible = true;
    }
    if (socketAnchorsLocal && socketAnchorsLocal.length > 0) {
      glob.velocity.set(
        randomRange(-0.05, 0.05),
        randomRange(-0.05, 0.05),
        -randomRange(projectileSpeed * 0.3, projectileSpeed * 0.52)
      );
    } else {
      glob.velocity.set(
        randomRange(-0.18, 0.18),
        randomRange(-0.18, 0.18),
        -randomRange(projectileSpeed * 0.28, projectileSpeed * 0.55)
      );
    }
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
      if (glob.outlineMaterial) {
        glob.outlineMaterial.opacity = 0;
      }
      if (glob.outlineMesh) {
        glob.outlineMesh.visible = false;
      }
      continue;
    }

    glob.mesh.position.addScaledVector(glob.velocity, deltaTime);
    const scale = THREE.MathUtils.lerp(glob.startScale, glob.endScale, t);
    glob.mesh.scale.setScalar(scale);
    glob.material.opacity = maxOpacity * opacityMultiplier;
    if (glob.outlineMaterial) {
      glob.outlineMaterial.opacity = glob.outlineMaxOpacity * opacityMultiplier;
    }
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

function updateBridgeParticles(
  geometry: THREE.BufferGeometry,
  socketA: THREE.Vector3,
  socketB: THREE.Vector3,
  timeSeconds: number,
  thickness: number,
  spreadMultiplier: number
): void {
  const positions = geometry.getAttribute("position");
  if (!(positions instanceof THREE.BufferAttribute)) {
    return;
  }

  const center = new THREE.Vector3();
  const dir = new THREE.Vector3().subVectors(socketB, socketA);
  if (dir.lengthSq() <= 0.000001) {
    dir.set(0, 0, 1);
  } else {
    dir.normalize();
  }
  const helper = Math.abs(dir.y) < 0.92 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const basisU = helper.clone().cross(dir).normalize();
  const basisV = dir.clone().cross(basisU).normalize();
  const count = positions.count;
  for (let i = 0; i < count; i += 1) {
    const u = count <= 1 ? 0 : i / (count - 1);
    center.lerpVectors(socketA, socketB, u);
    const angle = timeSeconds * 10.5 + u * Math.PI * 8 + i * 0.24;
    const radius =
      (thickness * (0.18 + u * 0.95) * spreadMultiplier) *
      (0.82 + 0.18 * Math.sin(timeSeconds * 7 + i * 0.65));
    center
      .addScaledVector(basisU, Math.cos(angle) * radius)
      .addScaledVector(basisV, Math.sin(angle) * radius);
    positions.setXYZ(i, center.x, center.y, center.z);
  }
  positions.needsUpdate = true;
}

function resolveBridgeParticleSocketsLocal(
  coreVisual: THREE.Object3D,
  projectileGroup: THREE.Group,
  outA: THREE.Vector3,
  outB: THREE.Vector3,
  length: number,
  thickness: number,
  tmpWorld: THREE.Vector3
): void {
  let particleA: THREE.Object3D | null = null;
  let particleB: THREE.Object3D | null = null;
  coreVisual.traverse((node) => {
    const rawName = `${node.name ?? ""}`;
    if (!rawName) {
      return;
    }
    const name = normalizeHelperNodeName(rawName);
    if (
      name === "particle-marker-a" ||
      name.startsWith("particle-marker-a-") ||
      name === "particle-a" ||
      name.startsWith("particle-a-")
    ) {
      particleA = node;
      return;
    }
    if (
      name === "particle-marker-b" ||
      name.startsWith("particle-marker-b-") ||
      name === "particle-b" ||
      name.startsWith("particle-b-")
    ) {
      particleB = node;
    }
  });

  projectileGroup.updateMatrixWorld(true);
  if (particleA && particleB) {
    particleA.getWorldPosition(tmpWorld);
    projectileGroup.worldToLocal(tmpWorld);
    outA.copy(tmpWorld);
    particleB.getWorldPosition(tmpWorld);
    projectileGroup.worldToLocal(tmpWorld);
    outB.copy(tmpWorld);
    return;
  }

  outA.set(-thickness * 0.16, 0, -length * 0.18);
  outB.set(thickness * 0.16, 0, length * 0.18);
}

function normalizeHelperNodeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.\d+$/g, "")
    .replace(/[_\s]+/g, "-");
}

function setRenderOrderRecursive(object: THREE.Object3D, renderOrder: number): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line) {
      node.renderOrder = renderOrder;
    }
  });
}

function sampleGhostTrailWorldPosition(
  samples: readonly GhostTrailSample[],
  targetAgeSeconds: number,
  outWorldPosition: THREE.Vector3
): boolean {
  if (samples.length <= 0) {
    return false;
  }
  if (targetAgeSeconds <= samples[0].ageSeconds) {
    outWorldPosition.copy(samples[0].worldPosition);
    return true;
  }
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const next = samples[i];
    if (targetAgeSeconds > next.ageSeconds) {
      continue;
    }
    const dt = Math.max(0.0001, next.ageSeconds - prev.ageSeconds);
    const t = THREE.MathUtils.clamp((targetAgeSeconds - prev.ageSeconds) / dt, 0, 1);
    outWorldPosition.lerpVectors(prev.worldPosition, next.worldPosition, t);
    return true;
  }
  outWorldPosition.copy(samples[samples.length - 1].worldPosition);
  return true;
}
