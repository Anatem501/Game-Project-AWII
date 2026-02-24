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
uniform float uAlpha;

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

  if (uAlpha <= 0.001) {
    discard;
  }
  gl_FragColor = vec4(emissive, uAlpha);
}
`;

export type IonArcFactoryOptions = LaserBoltFactoryOptions & {
  modelUrl?: string;
  coreColor?: number;
  arcColor?: number;
  rimColor?: number;
  shadowGlowColor?: number;
  shadowGlowOpacity?: number;
  surfaceOpacity?: number;
  arcSpeed?: number;
  maxPierceHits?: number;
  pierceOnCollision?: boolean;
  baseForwardScale?: number;
  baseHeightScale?: number;
  baseWidthScale?: number;
  widthGrowMax?: number;
  heightGrowMax?: number;
  lengthScaleEnd?: number;
  socketTrailLengthMultiplier?: number;
  socketTrailParticleSizeMultiplier?: number;
  socketTrailParticlesPerSocket?: number;
  socketTrailFlowSpeedMin?: number;
  socketTrailFlowSpeedMax?: number;
  socketTrailMirrorSeeds?: boolean;
  enableSpiralBridgeParticles?: boolean;
  surfacePulseStrength?: number;
  outlineLayerColor?: number;
  outlineLayerOpacity?: number;
  outlineLayerScale?: number;
  glowLayerColor?: number;
  glowLayerOpacity?: number;
  glowLayerScale?: number;
  useIndexedParticleTrailSockets?: boolean;
  indexedParticleTrailSocketIds?: readonly number[];
  indexedParticleTrailSocketLengthMultipliers?: Partial<Record<number, number>>;
  indexedParticleTrailSocketSizeMultipliers?: Partial<Record<number, number>>;
  includePrimaryMarkerTrails?: boolean;
  autoCenterByWidth?: boolean;
  startAtFullScale?: boolean;
  fadeStartT?: number;
  fadeEndT?: number;
};

type TrailSeed = {
  phase: number;
  radial: number;
  spin: number;
  flowOffset: number;
  flowRate: number;
};

const SIZE_SEQUENCE = [1, 1, 1] as const;
const ARC_BASE_FORWARD_SCALE = 0.66;
const ARC_BASE_HEIGHT_SCALE = 1.02;
const ARC_BASE_WIDTH_SCALE = 1.24;

export function createIonArcFactory(options: IonArcFactoryOptions = {}): ProjectileFactory {
  const speed = options.speed ?? 15;
  const lifetimeSeconds = options.lifetimeSeconds ?? 0.7;
  const length = options.length ?? 0.8;
  const thickness = options.thickness ?? 0.12;
  const damage = Math.max(0, options.damage ?? 8);
  const damageType: DamageType = options.damageType ?? "Ion";
  const collisionRadiusBase = Math.max(0.01, options.collisionRadius ?? thickness);
  const faction = options.faction ?? null;
  const pierceOnCollision = options.pierceOnCollision ?? true;
  const maxPierceHits = Math.max(1, Math.floor(options.maxPierceHits ?? (pierceOnCollision ? 16 : 1)));

  const coreColor = new THREE.Color(options.coreColor ?? options.color ?? 0x73bcff);
  const arcColor = new THREE.Color(options.arcColor ?? options.emissive ?? 0xf0fbff);
  const rimColor = new THREE.Color(options.rimColor ?? 0x5ca6ff);
  const surfaceOpacity = THREE.MathUtils.clamp(options.surfaceOpacity ?? 0.62, 0.05, 1);
  const baseForwardScale = Math.max(0.05, options.baseForwardScale ?? ARC_BASE_FORWARD_SCALE);
  const baseHeightScale = Math.max(0.05, options.baseHeightScale ?? ARC_BASE_HEIGHT_SCALE);
  const baseWidthScale = Math.max(0.05, options.baseWidthScale ?? ARC_BASE_WIDTH_SCALE);
  const widthGrowMax = Math.max(0.1, options.widthGrowMax ?? 2.15);
  const heightGrowMax = Math.max(0.1, options.heightGrowMax ?? 1.18);
  const lengthScaleEnd = Math.max(0.1, options.lengthScaleEnd ?? 0.88);
  const socketTrailLengthMultiplier = Math.max(0.1, options.socketTrailLengthMultiplier ?? 1);
  const socketTrailParticleSizeMultiplier = Math.max(0.1, options.socketTrailParticleSizeMultiplier ?? 1);
  const socketTrailParticlesPerSocket = Math.max(
    1,
    Math.floor(options.socketTrailParticlesPerSocket ?? 7)
  );
  const socketTrailFlowSpeedMin = Math.max(0.1, options.socketTrailFlowSpeedMin ?? 2.4);
  const socketTrailFlowSpeedMax = Math.max(
    socketTrailFlowSpeedMin,
    options.socketTrailFlowSpeedMax ?? 3.2
  );
  const socketTrailMirrorSeeds = options.socketTrailMirrorSeeds ?? false;
  const enableSpiralBridgeParticles = options.enableSpiralBridgeParticles ?? true;
  const surfacePulseStrength = THREE.MathUtils.clamp(options.surfacePulseStrength ?? 0.2, 0, 1);
  const outlineLayerColor = new THREE.Color(options.outlineLayerColor ?? 0x1f4fa0);
  const outlineLayerOpacity = THREE.MathUtils.clamp(options.outlineLayerOpacity ?? 0, 0, 1);
  const outlineLayerScale = Math.max(1, options.outlineLayerScale ?? 1.02);
  const glowLayerColor = new THREE.Color(options.glowLayerColor ?? rimColor);
  const glowLayerOpacity = THREE.MathUtils.clamp(options.glowLayerOpacity ?? 0, 0, 1);
  const glowLayerScale = Math.max(1, options.glowLayerScale ?? 1.06);
  const useIndexedParticleTrailSockets = options.useIndexedParticleTrailSockets ?? false;
  const indexedParticleTrailSocketIds =
    options.indexedParticleTrailSocketIds
      ?.map((value) => Math.floor(value))
      .filter((value, index, array) => Number.isFinite(value) && value >= 0 && array.indexOf(value) === index) ??
    null;
  const indexedParticleTrailSocketSizeMultipliers =
    options.indexedParticleTrailSocketSizeMultipliers ?? null;
  const indexedParticleTrailSocketLengthMultipliers =
    options.indexedParticleTrailSocketLengthMultipliers ?? null;
  const includePrimaryMarkerTrails = options.includePrimaryMarkerTrails ?? true;
  const autoCenterByWidth = options.autoCenterByWidth ?? false;
  const startAtFullScale = options.startAtFullScale ?? false;
  const fadeStartT = THREE.MathUtils.clamp(options.fadeStartT ?? 0.18, 0, 1);
  const fadeEndT = THREE.MathUtils.clamp(
    Math.max(fadeStartT + 0.001, options.fadeEndT ?? 0.7),
    0,
    1
  );
  const fallbackGeometry = new THREE.BoxGeometry(thickness, thickness * 0.5, length);
  const socketTrailParticleGeometry = new THREE.SphereGeometry(1, 8, 6);
  const spiralGeometry = new THREE.BufferGeometry();
  const spiralCount = 28;
  const spiralPositions = new Float32Array(spiralCount * 3);
  spiralGeometry.setAttribute("position", new THREE.Float32BufferAttribute(spiralPositions, 3));
  const spiralMaterialTemplate = new THREE.PointsMaterial({
    color: arcColor,
    size: Math.max(0.02, thickness * 0.28),
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    sizeAttenuation: true
  });
  const trailParticleMaterialTemplate = new THREE.MeshBasicMaterial({
    color: rimColor,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const loader = new GLTFLoader();
  const shotQuaternion = new THREE.Quaternion();
  const tmpWorld = new THREE.Vector3();
  const tmpLocal = new THREE.Vector3();
  const socketA = new THREE.Vector3();
  const socketB = new THREE.Vector3();
  const helixCenter = new THREE.Vector3();
  const helixDir = new THREE.Vector3();
  const helixBasisU = new THREE.Vector3();
  const helixBasisV = new THREE.Vector3();
  const fallbackAxis = new THREE.Vector3(0, 1, 0);
  const fallbackAxisB = new THREE.Vector3(1, 0, 0);
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
        console.warn("Ion arc model failed to load, using fallback arc mesh.", error);
      }
    );
  }

  const spawn = ({ direction, origin, patternStepIndex = 0 }: ProjectileSpawnParams): ProjectileInstance => {
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

    const sizeScale = SIZE_SEQUENCE[Math.abs(patternStepIndex) % SIZE_SEQUENCE.length] ?? 1;
    const surfaceMaterial = createIonSurfaceMaterial(coreColor, arcColor, rimColor);

    const coreVisual = modelTemplate
      ? modelTemplate.clone(true)
      : new THREE.Mesh(fallbackGeometry, surfaceMaterial);
    assignMaterialToMeshes(coreVisual, surfaceMaterial);
    coreVisual.rotateY(-Math.PI * 0.5);
    coreVisual.scale.multiplyScalar(sizeScale);
    coreVisual.scale.set(
      coreVisual.scale.x * baseForwardScale,
      coreVisual.scale.y * baseHeightScale,
      coreVisual.scale.z * baseWidthScale
    );
    projectileGroup.add(coreVisual);

    const baseCoreScale = coreVisual.scale.clone();
    const visualLocalCenter = new THREE.Vector3();
    const widthCenterLocal = (() => {
      projectileGroup.updateMatrixWorld(true);
      computeRenderableLocalCenterExcludingParticleHelpers(coreVisual, visualLocalCenter);
      return visualLocalCenter.z;
    })();
    const widthCenterOffset = new THREE.Vector3();
    const applyWidthCenterOffset = (): void => {
      if (!autoCenterByWidth) {
        coreVisual.position.set(0, 0, 0);
        return;
      }
      widthCenterOffset.set(0, 0, -widthCenterLocal * coreVisual.scale.z).applyQuaternion(coreVisual.quaternion);
      coreVisual.position.copy(widthCenterOffset);
    };
    applyWidthCenterOffset();

    const outlineMaterial =
      outlineLayerOpacity > 0
        ? new THREE.MeshBasicMaterial({
            color: outlineLayerColor,
            opacity: outlineLayerOpacity,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.NormalBlending,
            toneMapped: false
          })
        : null;
    const outlineVisual =
      outlineMaterial !== null
        ? (() => {
            const visual = modelTemplate
              ? modelTemplate.clone(true)
              : new THREE.Mesh(fallbackGeometry, outlineMaterial);
            assignMaterialToMeshes(visual, outlineMaterial);
            visual.rotateY(-Math.PI * 0.5);
            visual.scale.multiplyScalar(sizeScale);
            visual.scale.set(
              visual.scale.x * baseForwardScale,
              visual.scale.y * baseHeightScale,
              visual.scale.z * baseWidthScale
            );
            visual.position.copy(coreVisual.position);
            visual.quaternion.copy(coreVisual.quaternion);
            projectileGroup.add(visual);
            return visual;
          })()
        : null;

    const glowMaterial =
      glowLayerOpacity > 0
        ? new THREE.MeshBasicMaterial({
            color: glowLayerColor,
            opacity: glowLayerOpacity,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            toneMapped: false
          })
        : null;
    const glowVisual =
      glowMaterial !== null
        ? (() => {
            const visual = modelTemplate
              ? modelTemplate.clone(true)
              : new THREE.Mesh(fallbackGeometry, glowMaterial);
            assignMaterialToMeshes(visual, glowMaterial);
            visual.rotateY(-Math.PI * 0.5);
            visual.scale.multiplyScalar(sizeScale);
            visual.scale.set(
              visual.scale.x * baseForwardScale,
              visual.scale.y * baseHeightScale,
              visual.scale.z * baseWidthScale
            );
            visual.position.copy(coreVisual.position);
            visual.quaternion.copy(coreVisual.quaternion);
            projectileGroup.add(visual);
            return visual;
          })()
        : null;

    const spiralPointsMaterial = enableSpiralBridgeParticles ? spiralMaterialTemplate.clone() : null;
    const spiralPointsGeometry = enableSpiralBridgeParticles ? spiralGeometry.clone() : null;
    const spiralPoints =
      spiralPointsGeometry && spiralPointsMaterial
        ? new THREE.Points(spiralPointsGeometry, spiralPointsMaterial)
        : null;
    if (spiralPoints) {
      spiralPoints.renderOrder = 2;
      projectileGroup.add(spiralPoints);
    }

    const socketTrailRoot = new THREE.Group();
    projectileGroup.add(socketTrailRoot);
    const extraTrailSockets: THREE.Vector3[] = [];
    const extraTrailSocketIds: number[] = [];
    const trailSockets: THREE.Vector3[] = [];
    const trailSocketLengthMultipliers: number[] = [];
    const trailSocketSizeMultipliers: number[] = [];
    const socketTrailParticles: Array<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>> = [];
    const trailSeedGroups: TrailSeed[][] = [];

    projectileGroup.updateMatrixWorld(true);
    resolveParticleSocketsLocal(coreVisual, projectileGroup, socketA, socketB, length, thickness, sizeScale);
    if (includePrimaryMarkerTrails) {
      trailSockets.push(socketA, socketB);
      trailSocketLengthMultipliers.push(1, 1);
      trailSocketSizeMultipliers.push(1, 1);
    }
    if (useIndexedParticleTrailSockets) {
      resolveIndexedParticleTrailSocketsLocal(
        coreVisual,
        projectileGroup,
        extraTrailSockets,
        indexedParticleTrailSocketIds,
        extraTrailSocketIds
      );
    }
    for (let i = 0; i < extraTrailSockets.length; i += 1) {
      const socket = extraTrailSockets[i];
      if (!socket) {
        continue;
      }
      trailSockets.push(socket);
      const socketId = extraTrailSocketIds[i] ?? -1;
      const perSocketSizeMultiplier =
        indexedParticleTrailSocketSizeMultipliers?.[socketId] ?? 1;
      const perSocketLengthMultiplier =
        indexedParticleTrailSocketLengthMultipliers?.[socketId] ?? 1;
      trailSocketLengthMultipliers.push(Math.max(0.05, perSocketLengthMultiplier));
      trailSocketSizeMultipliers.push(Math.max(0.05, perSocketSizeMultiplier));
    }
    for (let socketIndex = 0; socketIndex < trailSockets.length; socketIndex += 1) {
      const seedList: TrailSeed[] = [];
      trailSeedGroups.push(seedList);
      for (let i = 0; i < socketTrailParticlesPerSocket; i += 1) {
        const mirroredSource =
          socketTrailMirrorSeeds && socketIndex === 1 ? trailSeedGroups[0]?.[i] : undefined;
        seedList.push(
          mirroredSource
            ? {
                phase: mirroredSource.phase,
                radial: mirroredSource.radial,
                spin: mirroredSource.spin,
                flowOffset: mirroredSource.flowOffset,
                flowRate: mirroredSource.flowRate
              }
            : {
                phase: Math.random() * Math.PI * 2,
                radial: randomRange(0.2, 1),
                spin: randomRange(6, 14) * (Math.random() < 0.5 ? -1 : 1),
                flowOffset: Math.random(),
                flowRate:
                  randomRange(socketTrailFlowSpeedMin, socketTrailFlowSpeedMax) *
                  (Math.random() < 0.5 ? -1 : 1)
              }
        );
        const material = trailParticleMaterialTemplate.clone();
        const mesh = new THREE.Mesh(socketTrailParticleGeometry, material);
        mesh.renderOrder = 3;
        mesh.visible = true;
        socketTrailParticles.push(mesh);
        socketTrailRoot.add(mesh);
      }
    }

    const velocity = projectileDirection.multiplyScalar(speed);
    const hitbox = createHitboxComponent({
      owner: projectileGroup,
      collisionArea: { radius: collisionRadiusBase * sizeScale },
      damageAmount: damage,
      damageType,
      sourceFaction: faction,
      maxHits: maxPierceHits
    });

    let ageSeconds = 0;
    let lifeRemaining = lifetimeSeconds;
    const helixSpinDirection = Math.random() < 0.5 ? -1 : 1;

    return {
      object: projectileGroup,
      hitbox,
      effectScale: sizeScale,
      beginDestroy: (reason) => (reason === "collision" ? !pierceOnCollision : true),
      update: (deltaTime: number): boolean => {
        lifeRemaining -= deltaTime;
        ageSeconds += deltaTime;
        projectileGroup.position.addScaledVector(velocity, deltaTime);

        const t = 1 - Math.max(0, lifeRemaining) / Math.max(0.0001, lifetimeSeconds);
        const travelScale = startAtFullScale
          ? 1
          : THREE.MathUtils.lerp(0.12, 1, THREE.MathUtils.smoothstep(t, 0, 0.28));
        const widthGrow = THREE.MathUtils.lerp(1, widthGrowMax, THREE.MathUtils.smoothstep(t, 0, 0.7));
        const heightGrow = THREE.MathUtils.lerp(1, heightGrowMax, THREE.MathUtils.smoothstep(t, 0, 0.72));
        const lengthScale = THREE.MathUtils.lerp(1, lengthScaleEnd, THREE.MathUtils.smoothstep(t, 0, 0.55));
        coreVisual.scale.set(
          baseCoreScale.x * lengthScale * travelScale,
          baseCoreScale.y * heightGrow * travelScale,
          baseCoreScale.z * widthGrow * travelScale
        );
        applyWidthCenterOffset();
        if (outlineVisual) {
          outlineVisual.scale.set(
            baseCoreScale.x * lengthScale * travelScale * outlineLayerScale,
            baseCoreScale.y * heightGrow * travelScale * outlineLayerScale,
            baseCoreScale.z * widthGrow * travelScale * outlineLayerScale
          );
          outlineVisual.position.copy(coreVisual.position);
          outlineVisual.quaternion.copy(coreVisual.quaternion);
        }
        if (glowVisual) {
          glowVisual.scale.set(
            baseCoreScale.x * lengthScale * travelScale * glowLayerScale,
            baseCoreScale.y * heightGrow * travelScale * glowLayerScale,
            baseCoreScale.z * widthGrow * travelScale * glowLayerScale
          );
          glowVisual.position.copy(coreVisual.position);
          glowVisual.quaternion.copy(coreVisual.quaternion);
        }
        resolveParticleSocketsLocal(
          coreVisual,
          projectileGroup,
          socketA,
          socketB,
          length,
          thickness,
          sizeScale * travelScale
        );
        if (useIndexedParticleTrailSockets) {
          resolveIndexedParticleTrailSocketsLocal(
            coreVisual,
            projectileGroup,
            extraTrailSockets,
            indexedParticleTrailSocketIds,
            extraTrailSocketIds
          );
        }
        const fade = 1 - THREE.MathUtils.smoothstep(t, fadeStartT, fadeEndT);
        const alpha = THREE.MathUtils.clamp(fade * surfaceOpacity, 0, 1);
        surfaceMaterial.opacity = alpha;
        if (surfacePulseStrength > 0.001) {
          surfaceMaterial.color
            .copy(coreColor)
            .lerp(arcColor, 0.45 + surfacePulseStrength * Math.sin(ageSeconds * 14));
        }
        if (outlineMaterial) {
          outlineMaterial.opacity = outlineLayerOpacity * alpha;
        }
        if (glowMaterial) {
          glowMaterial.opacity = glowLayerOpacity * alpha;
        }
        if (spiralPointsMaterial) {
          spiralPointsMaterial.opacity = 0.82 * alpha;
        }
        if (spiralPointsGeometry) {
          updateSpiralParticles(
            spiralPointsGeometry,
            socketA,
            socketB,
            ageSeconds,
            sizeScale * travelScale,
            widthGrow,
            helixSpinDirection
          );
        }
        updateSocketTrails(
          socketTrailParticles,
          trailSeedGroups,
          trailSockets,
          ageSeconds,
          t,
          sizeScale * travelScale,
          alpha,
          thickness,
          socketTrailLengthMultiplier,
          socketTrailParticleSizeMultiplier,
          trailSocketLengthMultipliers,
          trailSocketSizeMultipliers
        );

        return lifeRemaining > 0;
      },
      dispose: () => {
        surfaceMaterial.dispose();
        spiralPointsGeometry?.dispose();
        spiralPointsMaterial?.dispose();
        outlineMaterial?.dispose();
        glowMaterial?.dispose();
        for (const particle of socketTrailParticles) {
          particle.material.dispose();
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
      socketTrailParticleGeometry.dispose();
      spiralGeometry.dispose();
      spiralMaterialTemplate.dispose();
      trailParticleMaterialTemplate.dispose();
    }
  };
}

function createIonSurfaceMaterial(
  coreColor: THREE.Color,
  arcColor: THREE.Color,
  rimColor: THREE.Color
): THREE.MeshBasicMaterial {
  const surfaceColor = coreColor.clone().lerp(arcColor, 0.55).lerp(rimColor, 0.1);
  return new THREE.MeshBasicMaterial({
    color: surfaceColor,
    opacity: 1,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

function updateSpiralParticles(
  geometry: THREE.BufferGeometry,
  socketA: THREE.Vector3,
  socketB: THREE.Vector3,
  ageSeconds: number,
  sizeScale: number,
  widthGrow: number,
  spinDirection: number
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
    const angle = ageSeconds * (14 + sizeScale * 1.6) * spinDirection + u * Math.PI * 10.5;
    const radius =
      (0.02 + u * 0.085) * sizeScale * widthGrow * (0.8 + 0.2 * Math.sin(ageSeconds * 9 + i * 0.7));
    center
      .addScaledVector(basisU, Math.cos(angle) * radius)
      .addScaledVector(basisV, Math.sin(angle) * radius);
    positions.setXYZ(i, center.x, center.y, center.z);
  }
  positions.needsUpdate = true;
}

function updateSocketTrails(
  particles: Array<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>,
  seedGroups: TrailSeed[][],
  sockets: THREE.Vector3[],
  ageSeconds: number,
  lifeT: number,
  sizeScale: number,
  alpha: number,
  thickness: number,
  trailLengthMultiplier: number,
  trailParticleSizeMultiplier: number,
  socketLengthMultipliers: readonly number[] = [],
  socketSizeMultipliers: readonly number[] = []
): void {
  let particleIndex = 0;
  for (let socketIndex = 0; socketIndex < sockets.length; socketIndex += 1) {
    const socket = sockets[socketIndex];
    const seeds = seedGroups[socketIndex];
    const socketLengthMultiplier = Math.max(0.05, socketLengthMultipliers[socketIndex] ?? 1);
    const socketSizeMultiplier = Math.max(0.05, socketSizeMultipliers[socketIndex] ?? 1);
    for (let i = 0; i < seeds.length; i += 1) {
      const mesh = particles[particleIndex++];
      const seed = seeds[i];
      const trailU = THREE.MathUtils.euclideanModulo(
        (i / Math.max(1, seeds.length)) + seed.flowOffset + ageSeconds * seed.flowRate,
        1
      );
      const radius = thickness * sizeScale * 0.22 * seed.radial * (1 - lifeT * 0.55);
      const spinAngle = seed.phase + ageSeconds * seed.spin;
      mesh.position.copy(socket);
      mesh.position.x += Math.cos(spinAngle) * radius;
      mesh.position.y += Math.sin(spinAngle) * radius;
      mesh.position.z -=
        trailU *
        (0.42 * sizeScale + lifeT * 0.32 * sizeScale) *
        trailLengthMultiplier *
        socketLengthMultiplier;
      const particleScale =
        THREE.MathUtils.lerp(0.02, 0.006, trailU) *
        sizeScale *
        trailParticleSizeMultiplier *
        socketSizeMultiplier;
      mesh.scale.setScalar(Math.max(0.001, particleScale));
      mesh.material.opacity = alpha * (0.22 + (1 - trailU) * 0.38);
      mesh.visible = alpha > 0.01;
    }
  }
}

function resolveParticleSocketsLocal(
  coreVisual: THREE.Object3D,
  projectileGroup: THREE.Group,
  outA: THREE.Vector3,
  outB: THREE.Vector3,
  length: number,
  thickness: number,
  sizeScale: number
): void {
  const sockets: THREE.Vector3[] = [];
  let exactParticleAEmpty: THREE.Object3D | null = null;
  let exactParticleBEmpty: THREE.Object3D | null = null;
  let exactParticleAAny: THREE.Object3D | null = null;
  let exactParticleBAny: THREE.Object3D | null = null;
  const emptyNamesWithParticleSocket: Array<{ name: string; node: THREE.Object3D }> = [];
  const emptyNamesWithSocket: Array<{ name: string; node: THREE.Object3D }> = [];
  const namesWithParticleSocket: Array<{ name: string; node: THREE.Object3D }> = [];
  const namesWithSocket: Array<{ name: string; node: THREE.Object3D }> = [];
  coreVisual.traverse((node) => {
    const name = `${node.name ?? ""}`.toLowerCase();
    if (!name) {
      return;
    }
    const isRenderableNode =
      node instanceof THREE.Mesh ||
      node instanceof THREE.Line ||
      node instanceof THREE.Points ||
      node instanceof THREE.Sprite;
    const isSocketEmpty = !isRenderableNode;
    const normalizedExactName = normalizeHelperNodeName(name);
    const isParticleAName =
      normalizedExactName === "particle-a" ||
      normalizedExactName.startsWith("particle-a-") ||
      normalizedExactName === "particle-marker-a" ||
      normalizedExactName.startsWith("particle-marker-a-");
    const isParticleBName =
      normalizedExactName === "particle-b" ||
      normalizedExactName.startsWith("particle-b-") ||
      normalizedExactName === "particle-marker-b" ||
      normalizedExactName.startsWith("particle-marker-b-");
    if (isParticleAName) {
      exactParticleAAny ??= node;
      if (isSocketEmpty) {
        exactParticleAEmpty ??= node;
      }
    } else if (isParticleBName) {
      exactParticleBAny ??= node;
      if (isSocketEmpty) {
        exactParticleBEmpty ??= node;
      }
    }
    if (name.includes("particle") && name.includes("socket")) {
      if (isSocketEmpty) {
        emptyNamesWithParticleSocket.push({ name, node });
      }
      namesWithParticleSocket.push({ name, node });
      return;
    }
    if (name.includes("socket")) {
      if (isSocketEmpty) {
        emptyNamesWithSocket.push({ name, node });
      }
      namesWithSocket.push({ name, node });
    }
  });

  const candidates =
    emptyNamesWithParticleSocket.length >= 2
      ? emptyNamesWithParticleSocket
      : emptyNamesWithSocket.length >= 2
        ? emptyNamesWithSocket
        : namesWithParticleSocket.length >= 2
          ? namesWithParticleSocket
        : namesWithSocket;
  projectileGroup.updateMatrixWorld(true);

  const exactA = exactParticleAEmpty ?? exactParticleAAny;
  const exactB = exactParticleBEmpty ?? exactParticleBAny;
  if (exactA && exactB) {
    exactA.getWorldPosition(outA);
    projectileGroup.worldToLocal(outA);
    exactB.getWorldPosition(outB);
    projectileGroup.worldToLocal(outB);
    return;
  }

  for (const candidate of candidates) {
    candidate.node.getWorldPosition(outA);
    projectileGroup.worldToLocal(outA);
    sockets.push(outA.clone());
  }

  if (sockets.length >= 2) {
    let axis: "x" | "y" | "z" = "z";
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const socket of sockets) {
      minX = Math.min(minX, socket.x);
      minY = Math.min(minY, socket.y);
      minZ = Math.min(minZ, socket.z);
      maxX = Math.max(maxX, socket.x);
      maxY = Math.max(maxY, socket.y);
      maxZ = Math.max(maxZ, socket.z);
    }
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const rangeZ = maxZ - minZ;
    if (rangeX >= rangeY && rangeX >= rangeZ) {
      axis = "x";
    } else if (rangeY >= rangeX && rangeY >= rangeZ) {
      axis = "y";
    }
    sockets.sort((a, b) => a[axis] - b[axis]);
    outA.copy(sockets[0] ?? outA);
    outB.copy(sockets[sockets.length - 1] ?? outB);
    return;
  }

  outA.set(0, 0, -length * 0.25 * sizeScale);
  outB.set(0, 0, length * 0.25 * sizeScale);
  outA.x -= thickness * 0.18 * sizeScale;
  outB.x += thickness * 0.18 * sizeScale;
}

function resolveIndexedParticleTrailSocketsLocal(
  coreVisual: THREE.Object3D,
  projectileGroup: THREE.Group,
  outSockets: THREE.Vector3[],
  allowedIds: readonly number[] | null = null,
  outSocketIds: number[] | null = null
): void {
  const emptyMatches: Array<{ order: number; node: THREE.Object3D }> = [];
  const anyMatches: Array<{ order: number; node: THREE.Object3D }> = [];
  coreVisual.traverse((node) => {
    const rawName = `${node.name ?? ""}`;
    if (!rawName) {
      return;
    }
    const name = normalizeHelperNodeName(rawName);
    const match = /^(?:particles|partcles)(\d+)(?:-.+)?$/.exec(name);
    if (!match) {
      return;
    }
    const order = Number.parseInt(match[1] ?? "0", 10);
    if (!Number.isFinite(order)) {
      return;
    }
    if (allowedIds && !allowedIds.includes(order)) {
      return;
    }
    const isRenderableNode =
      node instanceof THREE.Mesh ||
      node instanceof THREE.Line ||
      node instanceof THREE.Points ||
      node instanceof THREE.Sprite;
    anyMatches.push({ order, node });
    if (!isRenderableNode) {
      emptyMatches.push({ order, node });
    }
  });
  const selected = (emptyMatches.length > 0 ? emptyMatches : anyMatches)
    .sort((a, b) => a.order - b.order)
    .sort((a, b) => {
      if (!allowedIds) {
        return 0;
      }
      const ai = allowedIds.indexOf(a.order);
      const bi = allowedIds.indexOf(b.order);
      return ai - bi;
    });
  projectileGroup.updateMatrixWorld(true);
  while (outSockets.length < selected.length) {
    outSockets.push(new THREE.Vector3());
  }
  while (outSockets.length > selected.length) {
    outSockets.pop();
  }
  if (outSocketIds) {
    while (outSocketIds.length > selected.length) {
      outSocketIds.pop();
    }
    while (outSocketIds.length < selected.length) {
      outSocketIds.push(0);
    }
  }
  const tmp = new THREE.Vector3();
  for (let i = 0; i < selected.length; i += 1) {
    const entry = selected[i];
    const out = outSockets[i];
    if (!entry || !out) {
      continue;
    }
    entry.node.getWorldPosition(tmp);
    projectileGroup.worldToLocal(tmp);
    out.copy(tmp);
    if (outSocketIds) {
      outSocketIds[i] = entry.order;
    }
  }
}

function normalizeTemplateForwardAndScale(
  template: THREE.Object3D,
  targetLength: number
): THREE.Object3D {
  hideParticleHelperVisuals(template);
  const bounds = computeRenderableBoundsExcludingParticleHelpers(template);
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

  const alignedBounds = computeRenderableBoundsExcludingParticleHelpers(template);
  const alignedSize = alignedBounds.getSize(new THREE.Vector3());
  const sourceLength = Math.max(0.0001, alignedSize.z);
  const uniformScale = targetLength / sourceLength;
  template.scale.setScalar(uniformScale);

  const centeredBounds = computeRenderableBoundsExcludingParticleHelpers(template);
  const centered = centeredBounds.getCenter(new THREE.Vector3());
  template.position.sub(centered);
  return template;
}

function assignMaterialToMeshes(object: THREE.Object3D, material: THREE.Material): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    if (isParticleHelperNodeName(node.name ?? "")) {
      node.visible = false;
      return;
    }
    node.material = material;
  });
}

function normalizeHelperNodeName(value: string): string {
  return `${value ?? ""}`
    .toLowerCase()
    .replace(/\.\d+$/g, "")
    .replace(/[_\s]+/g, "-");
}

function isParticleHelperNodeName(value: string): boolean {
  const name = normalizeHelperNodeName(value);
  if (!name) {
    return false;
  }
  if (
    name === "particle-a" ||
    name.startsWith("particle-a-") ||
    name === "particle-b" ||
    name.startsWith("particle-b-") ||
    name === "particle-marker-a" ||
    name.startsWith("particle-marker-a-") ||
    name === "particle-marker-b" ||
    name.startsWith("particle-marker-b-")
  ) {
    return true;
  }
  return name.includes("particle") && (name.includes("marker") || name.includes("socket"));
}

function hideParticleHelperVisuals(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (!isParticleHelperNodeName(node.name ?? "")) {
      return;
    }
    if (
      node instanceof THREE.Mesh ||
      node instanceof THREE.Line ||
      node instanceof THREE.Points ||
      node instanceof THREE.Sprite
    ) {
      node.visible = false;
    }
  });
}

function computeRenderableBoundsExcludingParticleHelpers(object: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let hasMeshBounds = false;
  object.updateMatrixWorld(true);
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }
    if (isParticleHelperNodeName(node.name ?? "")) {
      return;
    }
    const geometry = node.geometry;
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    if (!geometry.boundingBox) {
      return;
    }
    meshBounds.copy(geometry.boundingBox).applyMatrix4(node.matrixWorld);
    if (!hasMeshBounds) {
      bounds.copy(meshBounds);
      hasMeshBounds = true;
    } else {
      bounds.union(meshBounds);
    }
  });
  if (hasMeshBounds) {
    return bounds;
  }
  return bounds.setFromObject(object);
}

function computeRenderableLocalCenterExcludingParticleHelpers(
  object: THREE.Object3D,
  out: THREE.Vector3
): THREE.Vector3 {
  const bounds = computeRenderableBoundsExcludingParticleHelpers(object);
  bounds.getCenter(out);
  return object.worldToLocal(out);
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

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
