import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DamagePacket } from "../components/combat/CombatTypes";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { createLaserHitSparkExplosionSystem } from "../effects/LaserHitSparkExplosionSystem";
import { createPlasmaHitImplosionSystem } from "../effects/PlasmaHitImplosionSystem";
import { createPlasmaMuzzleGlobBurstSystem } from "../effects/PlasmaMuzzleGlobBurstSystem";
import type { TorpedoComponentDefinition } from "../weapons/WeaponComponentCatalog";
import torpedoModelUrl from "../../assets/models/Torpedo-v01.glb?url";

const TORPEDO_FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const TORPEDO_TRIGGER_MOUSE_BUTTON = 2;
const DEFAULT_HIT_RADIUS = 0.34;
const DEFAULT_SEEK_PADDING = 0.34;
const DEFAULT_TORPEDO_SCALE = 0.533;
const DETONATION_EXPLOSION_DELAY_SECONDS = 0.26;
const DETONATION_TOTAL_LIFETIME_SECONDS = 1.36;
const DETONATION_EXPLOSION_SHELL_LIFETIME_SECONDS = 0.52;
const DETONATION_VISUAL_SIZE_SCALE = 0.42;
const TORPEDO_TRAIL_SPAWN_INTERVAL_SECONDS = 0.03;
const TORPEDO_MAX_TRAIL_SPAWNS_PER_FRAME = 4;
const TORPEDO_TRAIL_DIRECTION_VARIANCE_RADIANS = THREE.MathUtils.degToRad(30);

export type TorpedoLauncherInstanceConfig = {
  id: string;
  mount: THREE.Object3D;
  payload: TorpedoComponentDefinition;
};

type TorpedoLauncherControllerParams = {
  canvas: HTMLCanvasElement;
  playerRoot: THREE.Object3D;
  scene: THREE.Scene;
  launchers?: readonly TorpedoLauncherInstanceConfig[];
  targetHurtboxes?: readonly HurtboxComponent[];
  consumeLauncherFireCost?: (payload: TorpedoComponentDefinition) => boolean;
  getWeaponFireIntervalMultiplier?: () => number;
  triggerFireInputActiveResolver?: () => boolean;
  disableDefaultTriggerInput?: boolean;
  canLauncherFire?: (launcherId: string) => boolean;
};

type ActiveTorpedo = {
  ageSeconds: number;
  disposableMaterials: THREE.Material[];
  object: THREE.Group;
  payload: TorpedoComponentDefinition;
  seeking: boolean;
  targetHurtboxId: string | null;
  trailSpawnSeconds: number;
  velocity: THREE.Vector3;
};

type ActiveTorpedoDetonation = {
  ageSeconds: number;
  direction: THREE.Vector3;
  explosionDamageApplied: boolean;
  explosionStarted: boolean;
  justSpawned: boolean;
  origin: THREE.Vector3;
  payload: TorpedoComponentDefinition;
};

export type TorpedoLauncherController = {
  update: (deltaTime: number, shipForward: THREE.Vector3, aimTargetWorldPosition?: THREE.Vector3) => void;
  setEnabled: (enabled: boolean) => void;
  setLaunchers: (launchers: readonly TorpedoLauncherInstanceConfig[]) => void;
  dispose: () => void;
};

export function createTorpedoLauncherController({
  canvas,
  playerRoot,
  scene,
  launchers = [],
  targetHurtboxes = [],
  consumeLauncherFireCost,
  getWeaponFireIntervalMultiplier,
  triggerFireInputActiveResolver,
  disableDefaultTriggerInput = false,
  canLauncherFire
}: TorpedoLauncherControllerParams): TorpedoLauncherController {
  const root = new THREE.Group();
  scene.add(root);

  const modelLoader = new GLTFLoader();
  const torpedoGeometry = new THREE.SphereGeometry(0.18, 10, 8);
  const torpedoMaterial = new THREE.MeshStandardMaterial({
    color: 0x692226,
    emissive: 0x601112,
    emissiveIntensity: 0.95,
    roughness: 0.46,
    metalness: 0.34
  });

  const launchBurstPlasma = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 26,
    pointSizeScale: 2,
    speedMin: 0.25,
    speedMax: 1.45,
    spreadRadians: THREE.MathUtils.degToRad(20),
    forwardVelocityBias: 0.9,
    motionHoldSeconds: 0.015,
    deepColor: 0xe0081f,
    coreColor: 0xff292b
  });
  const detonationImplosion = createPlasmaHitImplosionSystem(scene, {
    radius: 0.16,
    globCount: 26,
    lifetimeSeconds: 0.48,
    opacityScale: 1
  });
  const detonationExplosion = createPlasmaHitImplosionSystem(scene, {
    animationProfile: "expand",
    expandStartScaleMultiplier: 0.08,
    introFadeInSeconds: 0.14,
    radius: 0.3,
    globCount: 38,
    lifetimeSeconds: 0.68,
    opacityScale: 1
  });
  const detonationPlasmaBursts = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 42,
    burstLifetimeSeconds: 0.44,
    speedMin: 0.2,
    speedMax: 1.55,
    spreadRadians: THREE.MathUtils.degToRad(74),
    forwardVelocityBias: 0.2,
    motionHoldSeconds: 0.02,
    pointSizeScale: 1.96,
    deepColor: 0xe0081f,
    coreColor: 0xff292b,
    opacityScale: 0.96
  });
  const detonationSparks = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 72,
    lifetimeSeconds: 0.3,
    speedMin: 1.8,
    speedMax: 7.2,
    spreadRadians: THREE.MathUtils.degToRad(78),
    pointSizeScale: 1.5,
    coreColor: 0xfff3e7,
    glowColor: 0xff2d24
  });
  const torpedoTrailPlasma = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 16,
    burstLifetimeSeconds: 0.07,
    speedMin: 0.06,
    speedMax: 0.64,
    spreadRadians: THREE.MathUtils.degToRad(36),
    forwardVelocityBias: 0.12,
    motionHoldSeconds: 0.01,
    pointSizeScale: 2.953125,
    deepColor: 0xb10e1f,
    coreColor: 0xff6d66,
    opacityScale: 0.84
  });

  const scratchAimDirection = new THREE.Vector3();
  const scratchTargetCenter = new THREE.Vector3();
  const scratchHurtboxCenter = new THREE.Vector3();
  const scratchCurrentDirection = new THREE.Vector3();
  const scratchDesiredDirection = new THREE.Vector3();
  const scratchShipOffset = new THREE.Vector3();
  const scratchShipWorldOffset = new THREE.Vector3();
  const scratchExplosionDirection = new THREE.Vector3(0, 0, -1);
  const scratchTrailDirection = new THREE.Vector3(0, 0, -1);
  const scratchTrailJitterAxis = new THREE.Vector3(0, 1, 0);
  const scratchTorpedoSize = new THREE.Vector3();
  const scratchTorpedoCenter = new THREE.Vector3();
  const scratchTorpedoForward = new THREE.Vector3();
  const homingQuaternion = new THREE.Quaternion();
  const modelAlignQuaternion = new THREE.Quaternion();
  const trailJitterQuaternion = new THREE.Quaternion();

  const activeTorpedoes: ActiveTorpedo[] = [];
  const activeDetonations: ActiveTorpedoDetonation[] = [];
  let launcherConfigs = launchers.map((launcher) => ({ ...launcher }));
  let modelTemplate: THREE.Object3D | null = null;
  let queuedShots = 0;
  let triggerCooldownSeconds = 0;
  let enabled = true;
  let customTriggerHeldLastFrame = false;

  modelLoader.load(
    torpedoModelUrl,
    (gltf) => {
      const template = gltf.scene;
      const box = new THREE.Box3().setFromObject(template);
      box.getSize(scratchTorpedoSize);
      box.getCenter(scratchTorpedoCenter);

      let longestAxisIndex = 0;
      if (scratchTorpedoSize.y > scratchTorpedoSize.x && scratchTorpedoSize.y >= scratchTorpedoSize.z) {
        longestAxisIndex = 1;
      } else if (scratchTorpedoSize.z > scratchTorpedoSize.x && scratchTorpedoSize.z > scratchTorpedoSize.y) {
        longestAxisIndex = 2;
      }

      const positiveExtent =
        longestAxisIndex === 0
          ? box.max.x - scratchTorpedoCenter.x
          : longestAxisIndex === 1
            ? box.max.y - scratchTorpedoCenter.y
            : box.max.z - scratchTorpedoCenter.z;
      const negativeExtent =
        longestAxisIndex === 0
          ? scratchTorpedoCenter.x - box.min.x
          : longestAxisIndex === 1
            ? scratchTorpedoCenter.y - box.min.y
            : scratchTorpedoCenter.z - box.min.z;
      const forwardSign = positiveExtent >= negativeExtent ? 1 : -1;

      scratchTorpedoForward.set(0, 0, 0);
      if (longestAxisIndex === 0) {
        scratchTorpedoForward.x = forwardSign;
      } else if (longestAxisIndex === 1) {
        scratchTorpedoForward.y = forwardSign;
      } else {
        scratchTorpedoForward.z = forwardSign;
      }
      modelAlignQuaternion.setFromUnitVectors(scratchTorpedoForward, TORPEDO_FORWARD_AXIS);
      template.applyQuaternion(modelAlignQuaternion);

      const alignedBox = new THREE.Box3().setFromObject(template);
      const alignedSize = alignedBox.getSize(scratchTorpedoSize);
      const maxDimension = Math.max(alignedSize.x, alignedSize.y, alignedSize.z) || 1;
      const normalizedScale = (0.58 / maxDimension) * DEFAULT_TORPEDO_SCALE;
      template.scale.setScalar(normalizedScale);

      const scaledBox = new THREE.Box3().setFromObject(template);
      scaledBox.getCenter(scratchTorpedoCenter);
      template.position.sub(scratchTorpedoCenter);
      modelTemplate = template;
    },
    undefined,
    (error) => {
      console.warn("Failed to load torpedo model, using fallback torpedo mesh.", error);
    }
  );

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button !== TORPEDO_TRIGGER_MOUSE_BUTTON) {
      return;
    }
    if (!enabled) {
      return;
    }
    queuedShots = Math.max(queuedShots, 1);
    event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  if (!disableDefaultTriggerInput) {
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("contextmenu", onContextMenu);
  }

  const findReticleSeekTarget = (
    aimTargetWorldPosition: THREE.Vector3,
    payload: TorpedoComponentDefinition
  ): HurtboxComponent | null => {
    let bestTarget: HurtboxComponent | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const padding = Math.max(DEFAULT_SEEK_PADDING, payload.reticleSeekRadiusPadding);

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(scratchHurtboxCenter);
      scratchHurtboxCenter.y = aimTargetWorldPosition.y;
      const radius = Math.max(0, hurtbox.collisionArea.radius + padding);
      const distanceSq = aimTargetWorldPosition.distanceToSquared(scratchHurtboxCenter);
      if (distanceSq > radius * radius || distanceSq >= bestDistanceSq) {
        continue;
      }
      bestDistanceSq = distanceSq;
      bestTarget = hurtbox;
    }

    return bestTarget;
  };

  const applyRadialDamage = (
    origin: THREE.Vector3,
    payload: TorpedoComponentDefinition,
    damageAmount: number,
    radius: number
  ): void => {
    const blastRadius = Math.max(0, radius);
    const finalDamage = Math.max(0, damageAmount);
    if (blastRadius <= 0 || finalDamage <= 0) {
      return;
    }
    const damagePacket: DamagePacket = {
      amount: finalDamage,
      damageType: payload.damageType,
      sourceFaction: "player"
    };
    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(scratchHurtboxCenter);
      const combinedRadius = blastRadius + Math.max(0, hurtbox.collisionArea.radius);
      if (origin.distanceToSquared(scratchHurtboxCenter) > combinedRadius * combinedRadius) {
        continue;
      }
      hurtbox.receiveDamage(damagePacket);
    }
  };

  const spawnDetonationExplosionLeadInVisuals = (
    origin: THREE.Vector3,
    payload: TorpedoComponentDefinition
  ): void => {
    const explosionVisualRadius = Math.max(
      0.34,
      payload.explosionRadius * 0.42 * DETONATION_VISUAL_SIZE_SCALE
    );
    detonationExplosion.spawnImplosion(origin, explosionVisualRadius);
  };

  const spawnDetonationExplosionBurstVisuals = (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    _payload: TorpedoComponentDefinition
  ): void => {
    scratchExplosionDirection.copy(direction).multiplyScalar(-1);
    detonationPlasmaBursts.spawnBurst(origin, direction);
    detonationPlasmaBursts.spawnBurst(origin, scratchExplosionDirection);
    detonationSparks.spawnExplosion(origin, direction);
  };

  const disposeActiveTorpedo = (torpedo: ActiveTorpedo): void => {
    torpedo.object.removeFromParent();
    for (const material of torpedo.disposableMaterials) {
      material.dispose();
    }
  };

  const detonateTorpedo = (torpedoIndex: number, torpedo: ActiveTorpedo): void => {
    const origin = torpedo.object.position.clone();
    const direction = torpedo.velocity.clone().setY(0);
    if (direction.lengthSq() <= 0.000001) {
      direction.copy(TORPEDO_FORWARD_AXIS);
    } else {
      direction.normalize();
    }
    applyRadialDamage(origin, torpedo.payload, torpedo.payload.implosionDamage, torpedo.payload.implosionRadius);
    activeDetonations.push({
      ageSeconds: 0,
      direction,
      explosionDamageApplied: false,
      explosionStarted: false,
      justSpawned: true,
      origin,
      payload: torpedo.payload
    });
    disposeActiveTorpedo(torpedo);
    activeTorpedoes.splice(torpedoIndex, 1);
  };

  const updateDetonations = (deltaTime: number): void => {
    for (let i = activeDetonations.length - 1; i >= 0; i -= 1) {
      const detonation = activeDetonations[i];
      if (detonation.justSpawned) {
        detonation.justSpawned = false;
        continue;
      }
      detonation.ageSeconds += deltaTime;
      if (!detonation.explosionStarted && detonation.ageSeconds >= DETONATION_EXPLOSION_DELAY_SECONDS) {
        detonation.explosionStarted = true;
        spawnDetonationExplosionLeadInVisuals(detonation.origin, detonation.payload);
      }
      if (
        detonation.explosionStarted &&
        !detonation.explosionDamageApplied &&
        detonation.ageSeconds >=
          DETONATION_EXPLOSION_DELAY_SECONDS + DETONATION_EXPLOSION_SHELL_LIFETIME_SECONDS
      ) {
        detonation.explosionDamageApplied = true;
        applyRadialDamage(
          detonation.origin,
          detonation.payload,
          detonation.payload.explosionDamage,
          detonation.payload.explosionRadius
        );
        spawnDetonationExplosionBurstVisuals(detonation.origin, detonation.direction, detonation.payload);
      }
      if (detonation.ageSeconds >= DETONATION_TOTAL_LIFETIME_SECONDS) {
        activeDetonations.splice(i, 1);
      }
    }
  };

  const resolveTargetById = (hurtboxId: string | null): HurtboxComponent | null => {
    if (!hurtboxId) {
      return null;
    }
    for (const hurtbox of targetHurtboxes) {
      if (hurtbox.id === hurtboxId && hurtbox.canReceiveDamage()) {
        return hurtbox;
      }
    }
    return null;
  };

  const hasTorpedoImpact = (torpedo: ActiveTorpedo): boolean => {
    const hitRadius = Math.max(DEFAULT_HIT_RADIUS, torpedo.payload.hitRadius);
    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(scratchHurtboxCenter);
      const combinedRadius = hitRadius + Math.max(0, hurtbox.collisionArea.radius);
      if (torpedo.object.position.distanceToSquared(scratchHurtboxCenter) <= combinedRadius * combinedRadius) {
        return true;
      }
    }
    return false;
  };

  const buildTorpedoVisual = (): { object: THREE.Object3D; disposableMaterials: THREE.Material[] } => {
    if (modelTemplate) {
      const visual = modelTemplate.clone(true);
      const disposableMaterials: THREE.Material[] = [];
      visual.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) {
          return;
        }
        if (Array.isArray(node.material)) {
          const plasmaMaterials = node.material.map((material) => {
            const plasmaMaterial = createPlasmaTorpedoSurfaceMaterial(material);
            disposableMaterials.push(plasmaMaterial);
            return plasmaMaterial;
          });
          node.material = plasmaMaterials;
          return;
        }
        const plasmaMaterial = createPlasmaTorpedoSurfaceMaterial(node.material);
        disposableMaterials.push(plasmaMaterial);
        node.material = plasmaMaterial;
      });
      return { object: visual, disposableMaterials };
    }
    const fallbackMaterial = createPlasmaTorpedoSurfaceMaterial(torpedoMaterial);
    return {
      object: new THREE.Mesh(torpedoGeometry, fallbackMaterial),
      disposableMaterials: [fallbackMaterial]
    };
  };

  const spawnTorpedo = (
    launcher: TorpedoLauncherInstanceConfig,
    shipForward: THREE.Vector3,
    aimTargetWorldPosition?: THREE.Vector3
  ): boolean => {
    if (!(consumeLauncherFireCost?.(launcher.payload) ?? true)) {
      return false;
    }

    launcher.mount.getWorldPosition(scratchTargetCenter);
    scratchAimDirection.copy(shipForward).setY(0);
    if (scratchAimDirection.lengthSq() <= 0.000001) {
      scratchAimDirection.copy(TORPEDO_FORWARD_AXIS);
    } else {
      scratchAimDirection.normalize();
    }

    if (aimTargetWorldPosition) {
      scratchShipOffset.copy(scratchTargetCenter);
      playerRoot.worldToLocal(scratchShipOffset);
      scratchShipOffset.y = 0;
      if (scratchShipOffset.lengthSq() > 0.000001) {
        scratchShipWorldOffset.copy(scratchShipOffset).applyQuaternion(playerRoot.quaternion);
        scratchShipWorldOffset.y = 0;
      } else {
        scratchShipWorldOffset.set(0, 0, 0);
      }
      scratchDesiredDirection
        .copy(aimTargetWorldPosition)
        .addScaledVector(scratchShipWorldOffset, 0.65)
        .sub(scratchTargetCenter)
        .setY(0);
      if (scratchDesiredDirection.lengthSq() > 0.000001) {
        scratchDesiredDirection.normalize();
        scratchAimDirection.copy(scratchDesiredDirection);
      }
    }

    let seekTargetId: string | null = null;
    let seeking = false;
    if (aimTargetWorldPosition) {
      const seekTarget = findReticleSeekTarget(aimTargetWorldPosition, launcher.payload);
      if (seekTarget) {
        seeking = true;
        seekTargetId = seekTarget.id;
        seekTarget.getWorldCenter(scratchDesiredDirection);
        scratchDesiredDirection.sub(scratchTargetCenter).setY(0);
        if (scratchDesiredDirection.lengthSq() > 0.000001) {
          scratchDesiredDirection.normalize();
          scratchAimDirection.copy(scratchDesiredDirection);
        }
      }
    }

    const torpedo = new THREE.Group();
    torpedo.position.copy(scratchTargetCenter);
    const builtVisual = buildTorpedoVisual();
    torpedo.add(builtVisual.object);
    torpedo.quaternion.setFromUnitVectors(TORPEDO_FORWARD_AXIS, scratchAimDirection);
    root.add(torpedo);

    launchBurstPlasma.spawnBurst(scratchTargetCenter, scratchAimDirection);
    activeTorpedoes.push({
      ageSeconds: 0,
      disposableMaterials: builtVisual.disposableMaterials,
      object: torpedo,
      payload: launcher.payload,
      seeking,
      targetHurtboxId: seekTargetId,
      trailSpawnSeconds: 0,
      velocity: scratchAimDirection.clone().multiplyScalar(Math.max(0, launcher.payload.torpedoSpeed))
    });
    return true;
  };

  const getTriggerIntervalSeconds = (): number => {
    let interval = 0;
    for (const launcher of launcherConfigs) {
      interval = Math.max(interval, Math.max(0, launcher.payload.triggerFireIntervalSeconds));
    }
    return interval;
  };

  const fireQueuedShots = (shipForward: THREE.Vector3, aimTargetWorldPosition?: THREE.Vector3): boolean => {
    let firedAny = false;
    for (const launcher of launcherConfigs) {
      if (canLauncherFire && !canLauncherFire(launcher.id)) {
        continue;
      }
      if (spawnTorpedo(launcher, shipForward, aimTargetWorldPosition)) {
        firedAny = true;
      }
    }
    return firedAny;
  };

  const updateTorpedoes = (deltaTime: number): void => {
    for (let i = activeTorpedoes.length - 1; i >= 0; i -= 1) {
      const torpedo = activeTorpedoes[i];
      torpedo.ageSeconds += deltaTime;
      for (const material of torpedo.disposableMaterials) {
        if (!(material instanceof THREE.ShaderMaterial)) {
          continue;
        }
        if (!("uTime" in material.uniforms)) {
          continue;
        }
        material.uniforms.uTime.value += deltaTime;
      }

      if (torpedo.seeking) {
        const target = resolveTargetById(torpedo.targetHurtboxId);
        if (target) {
          target.getWorldCenter(scratchTargetCenter);
          scratchDesiredDirection.subVectors(scratchTargetCenter, torpedo.object.position).setY(0);
          if (scratchDesiredDirection.lengthSq() > 0.000001) {
            scratchDesiredDirection.normalize();
            scratchCurrentDirection.copy(torpedo.velocity).setY(0);
            if (scratchCurrentDirection.lengthSq() <= 0.000001) {
              scratchCurrentDirection.copy(scratchDesiredDirection);
            } else {
              scratchCurrentDirection.normalize();
            }
            const dot = THREE.MathUtils.clamp(
              scratchCurrentDirection.dot(scratchDesiredDirection),
              -1,
              1
            );
            const angularDelta = Math.acos(dot);
            if (angularDelta > 0.000001) {
              const maxTurnAngle =
                Math.max(0, torpedo.payload.homingTurnRateRadiansPerSecond) * deltaTime;
              const blend = THREE.MathUtils.clamp(maxTurnAngle / angularDelta, 0, 1);
              scratchCurrentDirection.lerp(scratchDesiredDirection, blend).normalize();
            }
            torpedo.velocity
              .copy(scratchCurrentDirection)
              .multiplyScalar(Math.max(0, torpedo.payload.torpedoSpeed));
            homingQuaternion.setFromUnitVectors(TORPEDO_FORWARD_AXIS, scratchCurrentDirection);
            torpedo.object.quaternion.slerp(homingQuaternion, THREE.MathUtils.clamp(deltaTime * 8, 0, 1));
          }
        }
      }

      torpedo.object.position.addScaledVector(torpedo.velocity, deltaTime);
      torpedo.trailSpawnSeconds += deltaTime;
      let spawnedTrailBursts = 0;
      while (torpedo.trailSpawnSeconds >= TORPEDO_TRAIL_SPAWN_INTERVAL_SECONDS) {
        torpedo.trailSpawnSeconds -= TORPEDO_TRAIL_SPAWN_INTERVAL_SECONDS;
        if (spawnedTrailBursts >= TORPEDO_MAX_TRAIL_SPAWNS_PER_FRAME) {
          torpedo.trailSpawnSeconds %= TORPEDO_TRAIL_SPAWN_INTERVAL_SECONDS;
          break;
        }
        scratchTrailDirection.copy(torpedo.velocity).multiplyScalar(-1);
        if (scratchTrailDirection.lengthSq() <= 0.000001) {
          scratchTrailDirection.copy(scratchExplosionDirection);
        } else {
          scratchTrailDirection.normalize();
        }
        scratchTrailJitterAxis.set(
          THREE.MathUtils.randFloatSpread(1),
          THREE.MathUtils.randFloatSpread(1),
          THREE.MathUtils.randFloatSpread(1)
        );
        if (scratchTrailJitterAxis.lengthSq() <= 0.000001) {
          scratchTrailJitterAxis.set(0, 1, 0);
        } else {
          scratchTrailJitterAxis.normalize();
        }
        trailJitterQuaternion.setFromAxisAngle(
          scratchTrailJitterAxis,
          THREE.MathUtils.randFloatSpread(TORPEDO_TRAIL_DIRECTION_VARIANCE_RADIANS * 2)
        );
        scratchTrailDirection.applyQuaternion(trailJitterQuaternion).normalize();
        torpedoTrailPlasma.spawnBurst(torpedo.object.position, scratchTrailDirection);
        spawnedTrailBursts += 1;
      }

      if (torpedo.seeking && hasTorpedoImpact(torpedo)) {
        detonateTorpedo(i, torpedo);
        continue;
      }

      const timedOut = torpedo.seeking
        ? torpedo.ageSeconds >= Math.max(0.01, torpedo.payload.seekingDetonationSeconds)
        : torpedo.ageSeconds >= Math.max(0.01, torpedo.payload.nonSeekingDetonationSeconds);
      if (timedOut) {
        detonateTorpedo(i, torpedo);
      }
    }
  };

  const update = (
    deltaTime: number,
    shipForward: THREE.Vector3,
    aimTargetWorldPosition?: THREE.Vector3
  ): void => {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    triggerCooldownSeconds = Math.max(0, triggerCooldownSeconds - deltaTime);
    if (!Number.isFinite(triggerCooldownSeconds)) {
      triggerCooldownSeconds = 0;
    }

    const customTriggerHeld = triggerFireInputActiveResolver?.() ?? false;
    if (enabled && customTriggerHeld && !customTriggerHeldLastFrame) {
      queuedShots = Math.max(queuedShots, 1);
    }
    customTriggerHeldLastFrame = customTriggerHeld;

    if (enabled && queuedShots > 0 && triggerCooldownSeconds <= 0) {
      queuedShots = 0;
      if (fireQueuedShots(shipForward, aimTargetWorldPosition)) {
        const intervalMultiplier = Math.max(0.001, getWeaponFireIntervalMultiplier?.() ?? 1);
        triggerCooldownSeconds = getTriggerIntervalSeconds() * intervalMultiplier;
      }
    }

    updateTorpedoes(deltaTime);
    updateDetonations(deltaTime);
    launchBurstPlasma.update(deltaTime);
    torpedoTrailPlasma.update(deltaTime);
    detonationImplosion.update(deltaTime);
    detonationExplosion.update(deltaTime);
    detonationPlasmaBursts.update(deltaTime);
    detonationSparks.update(deltaTime);
  };

  const setEnabled = (value: boolean): void => {
    enabled = value;
    if (enabled) {
      return;
    }
    queuedShots = 0;
    triggerCooldownSeconds = 0;
    customTriggerHeldLastFrame = false;
  };

  const setLaunchers = (nextLaunchers: readonly TorpedoLauncherInstanceConfig[]): void => {
    launcherConfigs = nextLaunchers.map((launcher) => ({ ...launcher }));
  };

  const dispose = (): void => {
    if (!disableDefaultTriggerInput) {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("contextmenu", onContextMenu);
    }

    for (const torpedo of activeTorpedoes) {
      disposeActiveTorpedo(torpedo);
    }
    activeTorpedoes.length = 0;
    activeDetonations.length = 0;

    launchBurstPlasma.dispose();
    torpedoTrailPlasma.dispose();
    detonationImplosion.dispose();
    detonationExplosion.dispose();
    detonationPlasmaBursts.dispose();
    detonationSparks.dispose();
    torpedoGeometry.dispose();
    torpedoMaterial.dispose();
    if (modelTemplate) {
      disposeObjectResources(modelTemplate);
      modelTemplate = null;
    }
    root.removeFromParent();
  };

  return {
    update,
    setEnabled,
    setLaunchers,
    dispose
  };
}

const TORPEDO_PLASMA_VERTEX_SHADER = `
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

const TORPEDO_PLASMA_FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uHotColor;
uniform vec3 uRimColor;
uniform float uIntensity;
uniform float uAlpha;

varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vLocalPos;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.1);
  float longitudinal = 0.5 + 0.5 * sin(vLocalPos.z * 18.0 - uTime * 4.2);
  float transverse = 0.5 + 0.5 * sin((vLocalPos.x + vLocalPos.y) * 8.0 + uTime * 1.8);
  float plasma = smoothstep(0.3, 0.94, mix(longitudinal, transverse, 0.22));
  vec3 baseColor = mix(uCoreColor, uHotColor, plasma * 0.62);
  vec3 emissive = baseColor * (uIntensity * (0.74 + plasma * 0.46));
  emissive += uRimColor * fresnel * (uIntensity * 0.9);
  gl_FragColor = vec4(emissive, uAlpha);
}
`;

function createPlasmaTorpedoSurfaceMaterial(sourceMaterial: THREE.Material): THREE.ShaderMaterial {
  const sourceColor = new THREE.Color(0x5b1820);
  if (
    sourceMaterial instanceof THREE.MeshStandardMaterial ||
    sourceMaterial instanceof THREE.MeshBasicMaterial ||
    sourceMaterial instanceof THREE.MeshLambertMaterial ||
    sourceMaterial instanceof THREE.MeshPhongMaterial
  ) {
    sourceColor.copy(sourceMaterial.color);
  }
  const coreColor = new THREE.Color(0xff2b3d).lerp(sourceColor, 0.18);
  const hotColor = new THREE.Color(0xff4f58).lerp(sourceColor, 0.08);
  const rimColor = new THREE.Color(0xb10d2b).lerp(sourceColor, 0.12);
  return new THREE.ShaderMaterial({
    vertexShader: TORPEDO_PLASMA_VERTEX_SHADER,
    fragmentShader: TORPEDO_PLASMA_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uCoreColor: { value: new THREE.Vector3(coreColor.r, coreColor.g, coreColor.b) },
      uHotColor: { value: new THREE.Vector3(hotColor.r, hotColor.g, hotColor.b) },
      uRimColor: { value: new THREE.Vector3(rimColor.r, rimColor.g, rimColor.b) },
      uIntensity: { value: 3.2 },
      uAlpha: { value: 1 }
    },
    transparent: false,
    depthWrite: true,
    blending: THREE.NormalBlending,
    toneMapped: false
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
      return;
    }
    node.material.dispose();
  });
}
