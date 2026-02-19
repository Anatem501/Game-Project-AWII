import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { DamagePacket } from "../components/combat/CombatTypes";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import type { MissileBayComponentDefinition } from "../weapons/WeaponComponentCatalog";
import standardConcussiveMissileModelUrl from "../../assets/models/Standard-Concussive-Missile-v01.glb?url";

const MISSILE_FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const MISSILE_BODY_LENGTH = 0.42;
const MISSILE_BODY_RADIUS = 0.075;
const MISSILE_NOSE_LENGTH = 0.2;
const MISSILE_LIFETIME_FALLBACK_SECONDS = 4.5;
const MISSILE_AIM_MIN_DISTANCE_FROM_LAUNCHER = 1.25;
const MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS = 0.065;
const SMOKE_DRAG_PER_SECOND = 2.6;
const LAUNCH_SMOKE_COUNT = 6;
const FIRE_FLASH_DURATION_SECONDS = 0.2;
const LOCK_ACQUIRE_SECONDS = 2;
const LOCK_RETICLE_RADIUS_PADDING = 0.22;
const MISSILE_HOMING_TURN_RATE_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(95);
const TURN_RATE_EPSILON_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(3);
const EXPLOSION_FLASH_LIFETIME_SECONDS = 0.28;
const EXPLOSION_FLASH_BASE_RADIUS = 0.28;

type ActiveMissile = {
  fuseRadius: number;
  guidanceGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  lifeRemaining: number;
  object: THREE.Group;
  targetHurtboxId: string | null;
  trailSpawnSeconds: number;
  thrusterCore: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  thrusterGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
};

type ActiveExplosion = {
  age: number;
  maxScale: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
};

type ActiveSmokeParticle = {
  age: number;
  endScale: number;
  lifetime: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  startOpacity: number;
  startScale: number;
  velocity: THREE.Vector3;
};

type TargetLockState = {
  hurtbox: HurtboxComponent;
  lockSeconds: number;
  locked: boolean;
};

type MissileBayControllerParams = {
  canvas: HTMLCanvasElement;
  cellsPerLauncherHint?: number;
  launcherCountHint?: number;
  playerRoot: THREE.Object3D;
  scene: THREE.Scene;
  missileCells?: readonly THREE.Object3D[];
  minAimDistanceFromShip?: number;
  maxAimAngleRadians?: number;
  targetHurtboxes?: readonly HurtboxComponent[];
  payload: MissileBayComponentDefinition;
};

export type MissileBayStatus = {
  ammoCapacity: number;
  ammoLoaded: number;
  cellsPerLauncher: number;
  chargeInitialDelaySeconds: number;
  chargeSeconds: number;
  chargeStepSeconds: number;
  firedFlashSeconds: number;
  isCharging: boolean;
  isLocking: boolean;
  launcherCount: number;
  isReloading: boolean;
  lockedTargetCount: number;
  lockingProgress01: number;
  queuedShots: number;
  reloadProgress01: number;
};

export type MissileBayController = {
  update: (
    deltaTime: number,
    shipForward: THREE.Vector3,
    shipYaw: number,
    camera: THREE.Camera,
    aimTargetWorldPosition?: THREE.Vector3
  ) => void;
  getStatus: () => MissileBayStatus;
  setEnabled: (enabled: boolean) => void;
  setMissileCells: (missileCells: readonly THREE.Object3D[]) => void;
  dispose: () => void;
};

export function createMissileBayController({
  canvas,
  cellsPerLauncherHint,
  launcherCountHint,
  playerRoot,
  scene,
  missileCells = [],
  minAimDistanceFromShip = MISSILE_AIM_MIN_DISTANCE_FROM_LAUNCHER,
  maxAimAngleRadians = Math.PI,
  targetHurtboxes = [],
  payload
}: MissileBayControllerParams): MissileBayController {
  const root = new THREE.Group();
  scene.add(root);

  const missileBodyGeometry = new THREE.CylinderGeometry(
    MISSILE_BODY_RADIUS,
    MISSILE_BODY_RADIUS * 0.84,
    MISSILE_BODY_LENGTH,
    10
  );
  const missileBodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x5f636f,
    emissive: 0x1b1f2b,
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.62
  });
  const missileNoseGeometry = new THREE.ConeGeometry(MISSILE_BODY_RADIUS * 0.88, MISSILE_NOSE_LENGTH, 10);
  const missileNoseMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d828f,
    roughness: 0.4,
    metalness: 0.68
  });
  const thrusterCoreGeometry = new THREE.SphereGeometry(0.022, 10, 10);
  const thrusterGlowGeometry = new THREE.SphereGeometry(0.05, 10, 10);
  const guidanceGlowGeometry = new THREE.SphereGeometry(0.022, 10, 10);
  const smokeGeometry = new THREE.SphereGeometry(1, 8, 6);
  const explosionFlashGeometry = new THREE.SphereGeometry(EXPLOSION_FLASH_BASE_RADIUS, 14, 12);
  const modelLoader = new GLTFLoader();

  const missileDirection = new THREE.Vector3();
  const missileVelocity = new THREE.Vector3();
  const missileAimVector = new THREE.Vector3();
  const shipToAim = new THREE.Vector3();
  const smokeSpawnPosition = new THREE.Vector3();
  const smokeDriftVelocity = new THREE.Vector3();
  const smokeTrailDirection = new THREE.Vector3();
  const lockTargetCenter = new THREE.Vector3();
  const currentMissileDirection = new THREE.Vector3();
  const desiredMissileDirection = new THREE.Vector3();
  const homingQuaternion = new THREE.Quaternion();
  const projectedTargetNdc = new THREE.Vector3();
  const clampedForward = new THREE.Vector3();
  const crossForwardAim = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const shotQuaternion = new THREE.Quaternion();
  const scratchHurtboxCenter = new THREE.Vector3();
  const scratchExplosionCenter = new THREE.Vector3();
  const scratchModelSize = new THREE.Vector3();
  const scratchModelCenter = new THREE.Vector3();

  let missileModelTemplate: THREE.Object3D | null = null;

  modelLoader.load(
    standardConcussiveMissileModelUrl,
    (gltf) => {
      const template = gltf.scene;
      template.rotation.y = -Math.PI * 0.5;
      const box = new THREE.Box3().setFromObject(template);
      const size = box.getSize(scratchModelSize);
      const maxDimension = Math.max(size.x, size.y, size.z) || 1;
      const normalizedScale = MISSILE_BODY_LENGTH / maxDimension;
      template.scale.setScalar(normalizedScale);

      const scaledBox = new THREE.Box3().setFromObject(template);
      scaledBox.getCenter(scratchModelCenter);
      template.position.sub(scratchModelCenter);
      template.position.z += MISSILE_BODY_LENGTH * 0.1;
      missileModelTemplate = template;
    },
    undefined,
    (error) => {
      console.warn("Failed to load concussive missile model, using fallback missile mesh.", error);
    }
  );

  const activeMissiles: ActiveMissile[] = [];
  const activeExplosions: ActiveExplosion[] = [];
  const activeSmokeParticles: ActiveSmokeParticle[] = [];
  const targetLockStates = new Map<string, TargetLockState>();
  const activeVolleyTargetIds = new Set<string>();

  let missileCellLaunchers = [...missileCells];
  let nextCellIndex = 0;
  let roundsRemaining = missileCellLaunchers.length;
  let reloadProgressSeconds = 0;
  let reloadMagazineActive = false;
  let isCharging = false;
  let chargeSeconds = 0;
  let queuedShots = 0;
  let burstShotCooldownSeconds = 0;
  let firedFlashSeconds = 0;
  let triggerFireCooldownSeconds = 0;
  let hasLastYaw = false;
  let lastYaw = 0;
  let turnDirection = 0;
  let isLocking = false;
  let lockingProgress01 = 0;
  let enabled = true;

  const maxAimClampRadians = THREE.MathUtils.clamp(maxAimAngleRadians, 0, Math.PI);

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 2) {
      return;
    }
    if (!enabled) {
      return;
    }
    if (triggerFireCooldownSeconds > 0) {
      return;
    }
    isCharging = true;
    chargeSeconds = 0;
    event.preventDefault();
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 2) {
      return;
    }
    if (!enabled) {
      return;
    }
    if (!isCharging) {
      return;
    }

    isCharging = false;
    if (reloadMagazineActive || roundsRemaining <= 0) {
      chargeSeconds = 0;
      queuedShots = 0;
      event.preventDefault();
      return;
    }
    const chargingWindowSeconds = Math.max(0, chargeSeconds - payload.chargeInitialDelaySeconds);
    const chargedShots = Math.max(
      1,
      1 + Math.floor(chargingWindowSeconds / Math.max(0.01, payload.chargeStepSeconds))
    );
    chargeSeconds = 0;
    queuedShots = Math.min(roundsRemaining, chargedShots);
    triggerFireCooldownSeconds = Math.max(0, payload.triggerFireIntervalSeconds);
    event.preventDefault();
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("contextmenu", onContextMenu);

  const setMissileCells = (nextCells: readonly THREE.Object3D[]): void => {
    missileCellLaunchers = [...nextCells];
    nextCellIndex = 0;
    roundsRemaining = missileCellLaunchers.length;
    reloadProgressSeconds = 0;
    reloadMagazineActive = false;
    queuedShots = 0;
    burstShotCooldownSeconds = 0;
    firedFlashSeconds = 0;
    triggerFireCooldownSeconds = 0;
    isCharging = false;
    chargeSeconds = 0;
    targetLockStates.clear();
    activeVolleyTargetIds.clear();
    isLocking = false;
    lockingProgress01 = 0;
  };

  const update = (
    deltaTime: number,
    shipForward: THREE.Vector3,
    shipYaw: number,
    camera: THREE.Camera,
    aimTargetWorldPosition?: THREE.Vector3
  ): void => {
    if (deltaTime <= 0) {
      return;
    }

    if (isCharging) {
      chargeSeconds += deltaTime;
    }

    const ammoCapacity = missileCellLaunchers.length;
    const reloadPerMissileSeconds = Math.max(0.001, payload.reloadSeconds);
    if (reloadMagazineActive && roundsRemaining < ammoCapacity) {
      reloadProgressSeconds += deltaTime;
      while (reloadProgressSeconds >= reloadPerMissileSeconds && roundsRemaining < ammoCapacity) {
        reloadProgressSeconds -= reloadPerMissileSeconds;
        roundsRemaining += 1;
      }
      if (roundsRemaining >= ammoCapacity) {
        roundsRemaining = ammoCapacity;
        reloadProgressSeconds = 0;
        reloadMagazineActive = false;
      }
    } else if (!reloadMagazineActive) {
      reloadProgressSeconds = 0;
    }

    burstShotCooldownSeconds = Math.max(0, burstShotCooldownSeconds - deltaTime);
    firedFlashSeconds = Math.max(0, firedFlashSeconds - deltaTime);
    triggerFireCooldownSeconds = Math.max(0, triggerFireCooldownSeconds - deltaTime);
    updateTargetLocks(deltaTime, camera, aimTargetWorldPosition);

    if (hasLastYaw) {
      const yawDelta = shortestAngleDelta(lastYaw, shipYaw);
      const yawRate = yawDelta / deltaTime;
      if (Math.abs(yawRate) <= TURN_RATE_EPSILON_RADIANS_PER_SECOND) {
        turnDirection = 0;
      } else {
        turnDirection = Math.sign(yawRate);
      }
    } else {
      turnDirection = 0;
      hasLastYaw = true;
    }
    lastYaw = shipYaw;

    if (!enabled || queuedShots <= 0 || ammoCapacity === 0) {
      updateMissiles(deltaTime);
      updateExplosions(deltaTime);
      updateSmokeParticles(deltaTime);
      return;
    }

    while (
      queuedShots > 0 &&
      roundsRemaining > 0 &&
      burstShotCooldownSeconds <= 0 &&
      !reloadMagazineActive
    ) {
      if (!fireQueuedShot(shipForward, aimTargetWorldPosition)) {
        break;
      }

      queuedShots -= 1;
      burstShotCooldownSeconds += Math.max(0.001, payload.burstFireIntervalSeconds);
    }

    pruneActiveVolleyTargets();

    updateMissiles(deltaTime);
    updateExplosions(deltaTime);
    updateSmokeParticles(deltaTime);
  };

  const updateTargetLocks = (
    deltaTime: number,
    camera: THREE.Camera,
    aimTargetWorldPosition: THREE.Vector3 | undefined
  ): void => {
    isLocking = false;
    lockingProgress01 = 0;
    const trackedIds = new Set<string>();

    for (const hurtbox of targetHurtboxes) {
      trackedIds.add(hurtbox.id);
      if (!hurtbox.canReceiveDamage()) {
        targetLockStates.delete(hurtbox.id);
        continue;
      }

      const onScreen = isTargetOnScreen(hurtbox, camera);
      const state =
        targetLockStates.get(hurtbox.id) ??
        {
          hurtbox,
          lockSeconds: 0,
          locked: false
        };
      state.hurtbox = hurtbox;

      if (state.locked) {
        if (!onScreen) {
          targetLockStates.delete(hurtbox.id);
          continue;
        }
        targetLockStates.set(hurtbox.id, state);
        continue;
      }

      const isHovering =
        Boolean(aimTargetWorldPosition) && onScreen && isReticleOverTarget(aimTargetWorldPosition, hurtbox);
      if (isHovering) {
        state.lockSeconds = Math.min(LOCK_ACQUIRE_SECONDS, state.lockSeconds + deltaTime);
        if (state.lockSeconds >= LOCK_ACQUIRE_SECONDS) {
          state.locked = true;
          state.lockSeconds = LOCK_ACQUIRE_SECONDS;
        } else {
          isLocking = true;
          lockingProgress01 = Math.max(lockingProgress01, state.lockSeconds / LOCK_ACQUIRE_SECONDS);
        }
      } else if (state.lockSeconds > 0) {
        state.lockSeconds = Math.max(0, state.lockSeconds - deltaTime * 1.25);
        if (state.lockSeconds > 0) {
          isLocking = true;
          lockingProgress01 = Math.max(lockingProgress01, state.lockSeconds / LOCK_ACQUIRE_SECONDS);
        }
      }

      if (!state.locked && state.lockSeconds <= 0) {
        targetLockStates.delete(hurtbox.id);
      } else {
        targetLockStates.set(hurtbox.id, state);
      }
    }

    for (const [hurtboxId] of targetLockStates) {
      if (!trackedIds.has(hurtboxId)) {
        targetLockStates.delete(hurtboxId);
      }
    }
  };

  const isReticleOverTarget = (aimTargetWorldPosition: THREE.Vector3, hurtbox: HurtboxComponent): boolean => {
    hurtbox.getWorldCenter(lockTargetCenter);
    lockTargetCenter.y = aimTargetWorldPosition.y;
    const targetRadius = hurtbox.collisionArea.radius + LOCK_RETICLE_RADIUS_PADDING;
    return aimTargetWorldPosition.distanceToSquared(lockTargetCenter) <= targetRadius * targetRadius;
  };

  const isTargetOnScreen = (hurtbox: HurtboxComponent, camera: THREE.Camera): boolean => {
    hurtbox.getWorldCenter(projectedTargetNdc);
    projectedTargetNdc.project(camera);
    return (
      projectedTargetNdc.z >= -1 &&
      projectedTargetNdc.z <= 1 &&
      projectedTargetNdc.x >= -1 &&
      projectedTargetNdc.x <= 1 &&
      projectedTargetNdc.y >= -1 &&
      projectedTargetNdc.y <= 1
    );
  };

  const consumeCurrentLocksIntoVolleyTargets = (): void => {
    activeVolleyTargetIds.clear();
    for (const [hurtboxId, state] of targetLockStates) {
      if (!state.locked || !state.hurtbox.canReceiveDamage()) {
        continue;
      }
      activeVolleyTargetIds.add(hurtboxId);
    }

    targetLockStates.clear();
    isLocking = false;
    lockingProgress01 = 0;
  };

  const resolveTargetHurtboxById = (hurtboxId: string): HurtboxComponent | null => {
    for (const hurtbox of targetHurtboxes) {
      if (hurtbox.id === hurtboxId) {
        return hurtbox;
      }
    }
    return null;
  };

  const selectNearestVolleyTargetId = (origin: THREE.Vector3): string | null => {
    let nearestId: string | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (const targetId of activeVolleyTargetIds) {
      const hurtbox = resolveTargetHurtboxById(targetId);
      if (!hurtbox || !hurtbox.canReceiveDamage()) {
        continue;
      }
      hurtbox.getWorldCenter(lockTargetCenter);
      const distanceSq = origin.distanceToSquared(lockTargetCenter);
      if (distanceSq >= nearestDistanceSq) {
        continue;
      }

      nearestDistanceSq = distanceSq;
      nearestId = targetId;
    }

    return nearestId;
  };

  const pruneActiveVolleyTargets = (): void => {
    for (const targetId of activeVolleyTargetIds) {
      const hurtbox = resolveTargetHurtboxById(targetId);
      if (hurtbox && hurtbox.canReceiveDamage()) {
        continue;
      }
      activeVolleyTargetIds.delete(targetId);
    }

    if (activeMissiles.length === 0 && queuedShots <= 0) {
      activeVolleyTargetIds.clear();
    }
  };

  const fireQueuedShot = (
    shipForward: THREE.Vector3,
    aimTargetWorldPosition: THREE.Vector3 | undefined
  ): boolean => {
    if (reloadMagazineActive || roundsRemaining <= 0 || missileCellLaunchers.length === 0) {
      return false;
    }

    const launcher = missileCellLaunchers[nextCellIndex % missileCellLaunchers.length];
    nextCellIndex = (nextCellIndex + 1) % missileCellLaunchers.length;
    roundsRemaining -= 1;
    if (activeVolleyTargetIds.size === 0) {
      consumeCurrentLocksIntoVolleyTargets();
    }
    spawnMissile(launcher, shipForward, aimTargetWorldPosition);
    firedFlashSeconds = FIRE_FLASH_DURATION_SECONDS;

    if (roundsRemaining <= 0) {
      roundsRemaining = 0;
      nextCellIndex = 0;
      reloadMagazineActive = true;
      reloadProgressSeconds = 0;
      queuedShots = 0;
    }

    return true;
  };

  const spawnMissile = (
    launcher: THREE.Object3D,
    shipForward: THREE.Vector3,
    aimTargetWorldPosition: THREE.Vector3 | undefined
  ): void => {
    launcher.getWorldPosition(scratchExplosionCenter);
    // Launch clamping only affects initial trajectory; future homing guidance can override this.
    missileDirection.copy(shipForward).setY(0);
    if (missileDirection.lengthSq() <= 0.000001) {
      missileDirection.copy(MISSILE_FORWARD_AXIS);
    } else {
      missileDirection.normalize();
    }

    if (aimTargetWorldPosition) {
      shipToAim.subVectors(aimTargetWorldPosition, playerRoot.position);
      const useForwardOnly =
        shipToAim.lengthSq() < minAimDistanceFromShip * minAimDistanceFromShip;

      if (!useForwardOnly) {
        missileAimVector.subVectors(aimTargetWorldPosition, scratchExplosionCenter).setY(0);
        if (missileAimVector.lengthSq() > 0.000001) {
          missileAimVector.normalize();
          const dot = THREE.MathUtils.clamp(missileAimVector.dot(missileDirection), -1, 1);
          const signedAngle = Math.atan2(
            crossForwardAim.copy(missileDirection).cross(missileAimVector).dot(worldUp),
            dot
          );
          const minAllowedAngle = turnDirection < 0 ? -maxAimClampRadians : 0;
          const maxAllowedAngle = turnDirection > 0 ? maxAimClampRadians : 0;
          const clampedAngle =
            turnDirection === 0
              ? THREE.MathUtils.clamp(signedAngle, -maxAimClampRadians, maxAimClampRadians)
              : THREE.MathUtils.clamp(signedAngle, minAllowedAngle, maxAllowedAngle);

          if (clampedAngle !== signedAngle) {
            clampedForward.copy(missileDirection).applyAxisAngle(worldUp, clampedAngle).normalize();
            missileDirection.copy(clampedForward);
          } else {
            missileDirection.copy(missileAimVector);
          }
        }
      }
    }

    const missile = new THREE.Group();
    missile.position.copy(scratchExplosionCenter);

    shotQuaternion.setFromUnitVectors(MISSILE_FORWARD_AXIS, missileDirection);
    missile.quaternion.copy(shotQuaternion);
    missile.add(createMissileBodyVisual());

    const thrusterCoreMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff0a6,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const thrusterGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9a3d,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const guidanceGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0x8cd7ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const thrusterCore = new THREE.Mesh(thrusterCoreGeometry, thrusterCoreMaterial);
    const thrusterGlow = new THREE.Mesh(thrusterGlowGeometry, thrusterGlowMaterial);
    const guidanceGlow = new THREE.Mesh(guidanceGlowGeometry, guidanceGlowMaterial);
    thrusterCore.position.z = -MISSILE_BODY_LENGTH * 0.58;
    thrusterGlow.position.z = -MISSILE_BODY_LENGTH * 0.62;
    guidanceGlow.position.z = MISSILE_BODY_LENGTH * 0.56;
    missile.add(thrusterCore);
    missile.add(thrusterGlow);
    missile.add(guidanceGlow);

    root.add(missile);

    missileVelocity.copy(missileDirection).multiplyScalar(Math.max(0.001, payload.missileSpeed));
    const launchTargetHurtboxId = selectNearestVolleyTargetId(scratchExplosionCenter);
    activeMissiles.push({
      fuseRadius: Math.max(0, payload.proximityFuseRadius),
      guidanceGlow,
      lifeRemaining: Math.max(0.01, payload.missileLifetimeSeconds ?? MISSILE_LIFETIME_FALLBACK_SECONDS),
      object: missile,
      targetHurtboxId: launchTargetHurtboxId,
      trailSpawnSeconds: 0,
      thrusterCore,
      thrusterGlow,
      velocity: missileVelocity.clone()
    });

    thrusterGlow.getWorldPosition(smokeSpawnPosition);
    spawnLaunchSmoke(smokeSpawnPosition, missileDirection);
  };

  const updateMissiles = (deltaTime: number): void => {
    for (let i = activeMissiles.length - 1; i >= 0; i -= 1) {
      const missile = activeMissiles[i];
      missile.lifeRemaining -= deltaTime;
      applyMissileHoming(deltaTime, missile);
      missile.object.position.addScaledVector(missile.velocity, deltaTime);

      const flamePulse = 0.9 + Math.sin((performance.now() * 0.001 + i) * 28) * 0.1;
      missile.thrusterCore.scale.setScalar(flamePulse);
      missile.thrusterGlow.scale.setScalar(0.95 + flamePulse * 0.35);
      missile.thrusterGlow.material.opacity = THREE.MathUtils.clamp(0.14 + flamePulse * 0.16, 0, 1);
      missile.object.rotateZ(deltaTime * 5.4);
      const nosePulse = 0.72 + Math.sin((performance.now() * 0.001 + i * 0.7) * 18) * 0.22;
      missile.guidanceGlow.scale.setScalar(0.85 + nosePulse * 0.45);
      missile.guidanceGlow.material.opacity = THREE.MathUtils.clamp(0.5 + nosePulse * 0.38, 0, 1);
      missile.trailSpawnSeconds += deltaTime;
      while (missile.trailSpawnSeconds >= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS) {
        missile.trailSpawnSeconds -= MISSILE_SMOKE_TRAIL_INTERVAL_SECONDS;
        missile.thrusterGlow.getWorldPosition(smokeSpawnPosition);
        smokeTrailDirection.copy(missile.velocity).normalize();
        spawnTrailSmoke(smokeSpawnPosition, smokeTrailDirection);
      }

      if (shouldDetonateMissile(missile)) {
        detonateMissile(i, missile);
        continue;
      }

      if (missile.lifeRemaining > 0) {
        continue;
      }

      disposeMissile(i);
    }
  };

  const applyMissileHoming = (deltaTime: number, missile: ActiveMissile): void => {
    if (activeVolleyTargetIds.size <= 0) {
      missile.targetHurtboxId = null;
      return;
    }

    let targetHurtbox: HurtboxComponent | null = null;
    if (missile.targetHurtboxId) {
      const resolved = resolveTargetHurtboxById(missile.targetHurtboxId);
      if (resolved?.canReceiveDamage()) {
        targetHurtbox = resolved;
      }
    }

    if (!targetHurtbox) {
      const nearestTargetId = selectNearestVolleyTargetId(missile.object.position);
      missile.targetHurtboxId = nearestTargetId;
      if (!nearestTargetId) {
        return;
      }
      const resolved = resolveTargetHurtboxById(nearestTargetId);
      if (!resolved?.canReceiveDamage()) {
        return;
      }
      targetHurtbox = resolved;
    }

    targetHurtbox.getWorldCenter(lockTargetCenter);
    desiredMissileDirection.subVectors(lockTargetCenter, missile.object.position).setY(0);
    if (desiredMissileDirection.lengthSq() <= 0.000001) {
      return;
    }
    desiredMissileDirection.normalize();

    currentMissileDirection.copy(missile.velocity).setY(0);
    if (currentMissileDirection.lengthSq() <= 0.000001) {
      currentMissileDirection.copy(desiredMissileDirection);
    } else {
      currentMissileDirection.normalize();
    }

    const dot = THREE.MathUtils.clamp(currentMissileDirection.dot(desiredMissileDirection), -1, 1);
    const angularDelta = Math.acos(dot);
    if (angularDelta > 0.000001) {
      const maxTurnAngle = MISSILE_HOMING_TURN_RATE_RADIANS_PER_SECOND * deltaTime;
      const blend = THREE.MathUtils.clamp(maxTurnAngle / angularDelta, 0, 1);
      currentMissileDirection.lerp(desiredMissileDirection, blend).normalize();
    }

    missile.velocity.copy(currentMissileDirection).multiplyScalar(Math.max(0.001, payload.missileSpeed));
    homingQuaternion.setFromUnitVectors(MISSILE_FORWARD_AXIS, currentMissileDirection);
    missile.object.quaternion.slerp(homingQuaternion, THREE.MathUtils.clamp(deltaTime * 9, 0, 1));
  };

  const shouldDetonateMissile = (missile: ActiveMissile): boolean => {
    const fuseRadius = Math.max(0, missile.fuseRadius);
    if (fuseRadius <= 0) {
      return false;
    }

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }

      hurtbox.getWorldCenter(scratchHurtboxCenter);
      const combinedRadius = fuseRadius + Math.max(0, hurtbox.collisionArea.radius);
      if (
        missile.object.position.distanceToSquared(scratchHurtboxCenter) <=
        combinedRadius * combinedRadius
      ) {
        return true;
      }
    }

    return false;
  };

  const detonateMissile = (missileIndex: number, missile: ActiveMissile): void => {
    const explosionCenter = missile.object.position.clone();
    applyExplosionDamage(explosionCenter);
    spawnExplosionFlash(explosionCenter);
    disposeMissile(missileIndex);
  };

  const applyExplosionDamage = (origin: THREE.Vector3): void => {
    const blastRadius = Math.max(0, payload.explosionRadius);
    if (blastRadius <= 0) {
      return;
    }

    const damagePacket: DamagePacket = {
      amount: Math.max(0, payload.missileDamage),
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

  const spawnExplosionFlash = (origin: THREE.Vector3): void => {
    const flash = new THREE.Mesh(
      explosionFlashGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xff9248,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    flash.position.copy(origin);
    root.add(flash);
    activeExplosions.push({
      age: 0,
      maxScale: Math.max(0.5, payload.explosionRadius * 0.92),
      mesh: flash
    });
  };

  const updateExplosions = (deltaTime: number): void => {
    for (let i = activeExplosions.length - 1; i >= 0; i -= 1) {
      const explosion = activeExplosions[i];
      explosion.age += deltaTime;
      const t = THREE.MathUtils.clamp(explosion.age / EXPLOSION_FLASH_LIFETIME_SECONDS, 0, 1);
      const scale = THREE.MathUtils.lerp(0.25, explosion.maxScale, t);
      explosion.mesh.scale.setScalar(scale);
      explosion.mesh.material.opacity = THREE.MathUtils.lerp(0.72, 0, t);

      if (t < 1) {
        continue;
      }

      explosion.mesh.removeFromParent();
      explosion.mesh.material.dispose();
      activeExplosions.splice(i, 1);
    }
  };

  const spawnLaunchSmoke = (origin: THREE.Vector3, direction: THREE.Vector3): void => {
    for (let i = 0; i < LAUNCH_SMOKE_COUNT; i += 1) {
      smokeDriftVelocity
        .copy(direction)
        .multiplyScalar(-0.9 - Math.random() * 0.9)
        .addScaledVector(worldUp, 0.22 + Math.random() * 0.48)
        .add(new THREE.Vector3((Math.random() - 0.5) * 0.55, 0, (Math.random() - 0.5) * 0.55));
      spawnSmokeParticle({
        origin,
        velocity: smokeDriftVelocity,
        lifetime: THREE.MathUtils.randFloat(0.4, 0.72),
        startScale: THREE.MathUtils.randFloat(0.05, 0.085),
        endScale: THREE.MathUtils.randFloat(0.24, 0.4),
        startOpacity: THREE.MathUtils.randFloat(0.34, 0.46)
      });
    }
  };

  const spawnTrailSmoke = (origin: THREE.Vector3, direction: THREE.Vector3): void => {
    smokeDriftVelocity
      .copy(direction)
      .multiplyScalar(-0.45 - Math.random() * 0.45)
      .addScaledVector(worldUp, 0.12 + Math.random() * 0.22)
      .add(new THREE.Vector3((Math.random() - 0.5) * 0.24, 0, (Math.random() - 0.5) * 0.24));
    spawnSmokeParticle({
      origin,
      velocity: smokeDriftVelocity,
      lifetime: THREE.MathUtils.randFloat(0.34, 0.58),
      startScale: THREE.MathUtils.randFloat(0.032, 0.048),
      endScale: THREE.MathUtils.randFloat(0.12, 0.19),
      startOpacity: THREE.MathUtils.randFloat(0.18, 0.28)
    });
  };

  const spawnSmokeParticle = ({
    origin,
    velocity,
    lifetime,
    startScale,
    endScale,
    startOpacity
  }: {
    endScale: number;
    lifetime: number;
    origin: THREE.Vector3;
    startOpacity: number;
    startScale: number;
    velocity: THREE.Vector3;
  }): void => {
    const smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x595959,
      transparent: true,
      opacity: startOpacity,
      depthWrite: false
    });
    const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
    smoke.position.copy(origin);
    smoke.scale.setScalar(startScale);
    root.add(smoke);
    activeSmokeParticles.push({
      age: 0,
      endScale,
      lifetime: Math.max(0.05, lifetime),
      mesh: smoke,
      startOpacity,
      startScale,
      velocity: velocity.clone()
    });
  };

  const updateSmokeParticles = (deltaTime: number): void => {
    for (let i = activeSmokeParticles.length - 1; i >= 0; i -= 1) {
      const smoke = activeSmokeParticles[i];
      smoke.age += deltaTime;
      const t = THREE.MathUtils.clamp(smoke.age / smoke.lifetime, 0, 1);
      smoke.mesh.position.addScaledVector(smoke.velocity, deltaTime);
      smoke.velocity.multiplyScalar(Math.max(0, 1 - deltaTime * SMOKE_DRAG_PER_SECOND));
      smoke.mesh.scale.setScalar(THREE.MathUtils.lerp(smoke.startScale, smoke.endScale, t));
      smoke.mesh.material.opacity = THREE.MathUtils.lerp(smoke.startOpacity, 0, t);

      if (t < 1) {
        continue;
      }

      smoke.mesh.removeFromParent();
      smoke.mesh.material.dispose();
      activeSmokeParticles.splice(i, 1);
    }
  };

  const disposeMissile = (index: number): void => {
    const missile = activeMissiles[index];
    missile.object.removeFromParent();
    missile.guidanceGlow.material.dispose();
    missile.thrusterCore.material.dispose();
    missile.thrusterGlow.material.dispose();
    activeMissiles.splice(index, 1);
  };

  const dispose = (): void => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("contextmenu", onContextMenu);

    for (let i = activeMissiles.length - 1; i >= 0; i -= 1) {
      disposeMissile(i);
    }
    for (const explosion of activeExplosions) {
      explosion.mesh.removeFromParent();
      explosion.mesh.material.dispose();
    }
    activeExplosions.length = 0;
    for (const smoke of activeSmokeParticles) {
      smoke.mesh.removeFromParent();
      smoke.mesh.material.dispose();
    }
    activeSmokeParticles.length = 0;

    missileBodyGeometry.dispose();
    missileBodyMaterial.dispose();
    missileNoseGeometry.dispose();
    missileNoseMaterial.dispose();
    thrusterCoreGeometry.dispose();
    thrusterGlowGeometry.dispose();
    guidanceGlowGeometry.dispose();
    smokeGeometry.dispose();
    explosionFlashGeometry.dispose();
    if (missileModelTemplate) {
      disposeObjectResources(missileModelTemplate);
      missileModelTemplate = null;
    }

    root.removeFromParent();
  };

  const createMissileBodyVisual = (): THREE.Object3D => {
    if (missileModelTemplate) {
      return missileModelTemplate.clone(true);
    }

    const fallbackVisual = new THREE.Group();
    const body = new THREE.Mesh(missileBodyGeometry, missileBodyMaterial);
    body.rotation.x = Math.PI * 0.5;
    fallbackVisual.add(body);

    const nose = new THREE.Mesh(missileNoseGeometry, missileNoseMaterial);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.z = MISSILE_BODY_LENGTH * 0.5 + MISSILE_NOSE_LENGTH * 0.5 - 0.02;
    fallbackVisual.add(nose);
    return fallbackVisual;
  };

  const disposeObjectResources = (object: THREE.Object3D): void => {
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
  };

  const getStatus = (): MissileBayStatus => {
    const ammoCapacity = missileCellLaunchers.length;
    const perMissileReloadSeconds = Math.max(0.001, payload.reloadSeconds);
    const isReloading = reloadMagazineActive;
    const launcherCount = Math.max(1, Math.floor(launcherCountHint ?? 1));
    const cellsPerLauncher = Math.max(
      1,
      Math.floor(cellsPerLauncherHint ?? Math.ceil(Math.max(1, ammoCapacity) / launcherCount))
    );
    let lockedTargetCount = 0;
    for (const [, state] of targetLockStates) {
      if (state.locked) {
        lockedTargetCount += 1;
      }
    }

    return {
      ammoCapacity,
      ammoLoaded: roundsRemaining,
      cellsPerLauncher,
      chargeInitialDelaySeconds: payload.chargeInitialDelaySeconds,
      chargeSeconds,
      chargeStepSeconds: payload.chargeStepSeconds,
      firedFlashSeconds,
      isCharging,
      isLocking,
      launcherCount,
      isReloading,
      lockedTargetCount,
      lockingProgress01,
      queuedShots,
      reloadProgress01: isReloading
        ? THREE.MathUtils.clamp(reloadProgressSeconds / perMissileReloadSeconds, 0, 1)
        : 0
    };
  };

  return {
    getStatus,
    update,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (enabled) {
        return;
      }

      isCharging = false;
      chargeSeconds = 0;
      queuedShots = 0;
      burstShotCooldownSeconds = 0;
      triggerFireCooldownSeconds = 0;
      hasLastYaw = false;
      turnDirection = 0;
      targetLockStates.clear();
      activeVolleyTargetIds.clear();
      isLocking = false;
      lockingProgress01 = 0;
    },
    setMissileCells,
    dispose
  };
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
