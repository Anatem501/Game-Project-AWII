import * as THREE from "three";
import type { DamagePacketSegment } from "../components/combat/CombatTypes";
import { LASER_DAMAGE_TYPE, type DamageType } from "../components/combat/DamageTypes";
import { resolveHitboxAgainstHurtboxes } from "../components/combat/HitboxHurtboxCollision";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { createIonHitElectricBurstSystem } from "../effects/IonHitElectricBurstSystem";
import { createLaserHitSparkExplosionSystem } from "../effects/LaserHitSparkExplosionSystem";
import { createPlasmaHitImplosionSystem } from "../effects/PlasmaHitImplosionSystem";
import { createPlasmaMuzzleGlobBurstSystem } from "../effects/PlasmaMuzzleGlobBurstSystem";
import { createSolarHitFlashSystem } from "../effects/SolarHitFlashSystem";
import { createShipGunSparkBurstSystem } from "../effects/ShipGunSparkBurstSystem";
import { createFrostHitCrystalBurstSystem } from "../effects/FrostHitCrystalBurstSystem";
import { createVoidHitVortexSystem } from "../effects/VoidHitVortexSystem";
import type { PlayerControllerState } from "./PlayerController";
import type { ProjectileFactory, ProjectileInstance } from "./projectiles/ProjectileTypes";

const DEFAULT_GUN_FIRE_INTERVAL_SECONDS = 0.5;
const MIN_AIM_DISTANCE_FROM_SHIP = 1;
const FULL_AIM_ARC_RADIANS = Math.PI;
const TURN_RATE_EPSILON_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(3);
const GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX = 5;
const PLAYER_CANNON_MUZZLE_SPARK_COUNT = 18;
const PLAYER_CANNON_MUZZLE_BURST_LIFETIME_SECONDS = 0.11;
const PLAYER_CANNON_MUZZLE_SPEED_MIN = 1.5;
const PLAYER_CANNON_MUZZLE_SPEED_MAX = 5.1;
const PLAYER_CANNON_MUZZLE_SPREAD_RADIANS = THREE.MathUtils.degToRad(9);
const ION_MUZZLE_BURST_COUNT = 24;
const ION_MUZZLE_BURST_LIFETIME_SECONDS = 0.12;
const ION_MUZZLE_BURST_SPEED_MIN = 0.7;
const ION_MUZZLE_BURST_SPEED_MAX = 2.8;
const DEFAULT_HITSCAN_BEAM_PULSE_DURATION_SECONDS = 0.6;
const DEFAULT_HITSCAN_BEAM_MAX_DISTANCE = 240;
const DEFAULT_HITSCAN_BEAM_THICKNESS = 0.08;
const DEFAULT_HITSCAN_BEAM_HIT_SPARK_INTERVAL_SECONDS = 0.08;
const HITSCAN_BEAM_FADE_START_RATIO = 0.45;
const HITSCAN_BEAM_OUTER_OPACITY = 0.34;
const HITSCAN_BEAM_INNER_OPACITY = 0.92;
const HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER = 1;
const HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER = 0.34;
const DEFAULT_RETICLE_HOMING_TARGET_PADDING = 0.3;

type WeaponResourceCost = {
  energyCost: number;
  heatCost: number;
};

type HitscanPulseFireModeDefinition = {
  maxDistance?: number;
  pulseDurationSeconds?: number;
  beamThickness?: number;
  damageAmount: number;
  damageType?: DamageType;
  additionalDamageSegments?: readonly DamagePacketSegment[];
  sourceFaction?: string | null;
  hitSparkIntervalSeconds?: number;
  beamColor?: number;
  beamCoreColor?: number;
};

type NormalizedHitscanPulseFireModeDefinition = {
  maxDistance: number;
  pulseDurationSeconds: number;
  beamThickness: number;
  damageAmount: number;
  damageType: DamageType;
  additionalDamageSegments: readonly DamagePacketSegment[];
  sourceFaction: string | null;
  hitSparkIntervalSeconds: number;
  beamColor: number;
  beamCoreColor: number;
};

type ActiveHitscanBeamPulse = {
  age: number;
  duration: number;
  root: THREE.Group;
  outerMaterial: THREE.MeshBasicMaterial;
  innerMaterial: THREE.MeshBasicMaterial;
};

type GunFireModeDefinition = {
  fireIntervalSeconds?: number;
  fireIntervalSequenceSeconds?: readonly number[];
  fireIntervalMultiplierScope?: "all_steps" | "burst_gap_only";
  burstPhaseGroupId?: number;
  burstPhaseGroupPattern?: readonly number[];
  phaseOffsetSeconds?: number;
  projectileFactory?: ProjectileFactory;
  hitscanPulse?: HitscanPulseFireModeDefinition;
  heatCost?: number;
  energyCost?: number;
};

export type GunDefinition = {
  hardpoint: THREE.Object3D;
  fireIntervalSeconds?: number;
  projectileFactory?: ProjectileFactory;
  primary?: GunFireModeDefinition;
};

type NormalizedGunDefinition = {
  hardpoint: THREE.Object3D;
  primary: {
    fireIntervalSeconds: number;
    fireIntervalSequenceSeconds: number[];
    fireIntervalMultiplierScope: "all_steps" | "burst_gap_only";
    burstPhaseGroupId: number | null;
    burstPhaseGroupPattern: number[];
    phaseOffsetSeconds: number;
    projectileFactory: ProjectileFactory | null;
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition | null;
    heatCost: number;
    energyCost: number;
  };
};

type GunControllerParams = {
  aimReticle: THREE.Object3D;
  canvas: HTMLCanvasElement;
  guns: readonly GunDefinition[];
  playerRoot: THREE.Group;
  scene: THREE.Scene;
  hardpointAimOffsetScale?: number;
  minAimDistanceFromShip?: number;
  maxAimAngleRadians?: number;
  targetHurtboxes?: readonly HurtboxComponent[];
  reticleHomingTargetPadding?: number;
  consumePrimaryFireCost?: (cost: WeaponResourceCost) => boolean;
  getPrimaryFireIntervalMultiplier?: () => number;
};

export type GunController = {
  update: (deltaTime: number, playerState: PlayerControllerState) => void;
  isPrimaryFireInputActive: () => boolean;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export function createGunController({
  aimReticle,
  canvas,
  guns,
  playerRoot,
  scene,
  hardpointAimOffsetScale = 1,
  minAimDistanceFromShip = MIN_AIM_DISTANCE_FROM_SHIP,
  maxAimAngleRadians = FULL_AIM_ARC_RADIANS,
  targetHurtboxes = [],
  reticleHomingTargetPadding = DEFAULT_RETICLE_HOMING_TARGET_PADDING,
  consumePrimaryFireCost,
  getPrimaryFireIntervalMultiplier
}: GunControllerParams): GunController {
  const muzzleWorld = new THREE.Vector3();
  const aimDirection = new THREE.Vector3();
  const fallbackForward = new THREE.Vector3();
  const clampedForward = new THREE.Vector3();
  const crossForwardAim = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const shipToAim = new THREE.Vector3();
  const aimTargetWorld = new THREE.Vector3();
  const hardpointLocalOffset = new THREE.Vector3();
  const hardpointWorldOffset = new THREE.Vector3();
  const estimatedShipVelocity = new THREE.Vector3();
  const lastPlayerPosition = new THREE.Vector3();
  const playerPositionDelta = new THREE.Vector3();
  const beamMidpoint = new THREE.Vector3();
  const beamEndPoint = new THREE.Vector3();
  const beamHitPoint = new THREE.Vector3();
  const hurtboxCenter = new THREE.Vector3();
  const rayToCenter = new THREE.Vector3();
  const unitCylinderAxis = new THREE.Vector3(0, 1, 0);
  const beamOrientation = new THREE.Quaternion();
  const projectiles: ProjectileInstance[] = [];
  const activeHitscanBeamPulses: ActiveHitscanBeamPulse[] = [];
  const sparkBursts = createShipGunSparkBurstSystem(scene, {
    sparkCountPerBurst: PLAYER_CANNON_MUZZLE_SPARK_COUNT,
    burstLifetimeSeconds: PLAYER_CANNON_MUZZLE_BURST_LIFETIME_SECONDS,
    speedMin: PLAYER_CANNON_MUZZLE_SPEED_MIN,
    speedMax: PLAYER_CANNON_MUZZLE_SPEED_MAX,
    spreadRadians: PLAYER_CANNON_MUZZLE_SPREAD_RADIANS
  });
  const hitSparkExplosions = createLaserHitSparkExplosionSystem(scene, {
    sparkCount: 68
  });
  const plasmaArcHitSparkExplosions = createLaserHitSparkExplosionSystem(scene, {
    lifetimeSeconds: 0.38,
    sparkCount: 56,
    speedMin: 2.2,
    speedMax: 8.2,
    spreadRadians: THREE.MathUtils.degToRad(24),
    pointSizeScale: 1.45,
    coreColor: 0xffb06c,
    glowColor: 0xe13a26
  });
  const ionMuzzleBursts = createIonHitElectricBurstSystem(scene, {
    burstCount: ION_MUZZLE_BURST_COUNT,
    lifetimeSeconds: ION_MUZZLE_BURST_LIFETIME_SECONDS,
    speedMin: ION_MUZZLE_BURST_SPEED_MIN,
    speedMax: ION_MUZZLE_BURST_SPEED_MAX
  });
  const ionHitBursts = createIonHitElectricBurstSystem(scene);
  const frostHitBursts = createFrostHitCrystalBurstSystem(scene);
  const plasmaHitImplosions = createPlasmaHitImplosionSystem(scene);
  const plasmaMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene);
  const voidMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 14,
    burstLifetimeSeconds: 0.2,
    speedMin: 0.25,
    speedMax: 1.15,
    spreadRadians: THREE.MathUtils.degToRad(13),
    deepColor: 0x180a28,
    coreColor: 0x4a2d73
  });
  const frostMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(scene, {
    globCountPerBurst: 18,
    burstLifetimeSeconds: 0.26,
    speedMin: 0.18,
    speedMax: 0.85,
    spreadRadians: THREE.MathUtils.degToRad(20),
    forwardVelocityBias: 1.15,
    pointSizeScale: 1.2,
    deepColor: 0x4ca9e8,
    coreColor: 0xe9fbff
  });
  const solarHitFlashes = createSolarHitFlashSystem(scene);
  const voidHitVortices = createVoidHitVortexSystem(scene);
  const projectilesRoot = new THREE.Group();
  const hitscanBeamPulsesRoot = new THREE.Group();
  const hitscanBeamOuterGeometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const hitscanBeamInnerGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const normalizedGuns = normalizeGunDefinitions(guns);
  const primaryInitialCooldowns = normalizedGuns.map((gun) => {
    const sequence = gun.primary.fireIntervalSequenceSeconds;
    const interval =
      sequence.length > 0
        ? Math.max(0.001, sequence.reduce((sum, step) => sum + Math.max(0.001, step), 0))
        : Math.max(0.001, gun.primary.fireIntervalSeconds);
    const offset = gun.primary.phaseOffsetSeconds ?? 0;
    return THREE.MathUtils.euclideanModulo(offset, interval);
  });
  const primaryCooldowns = [...primaryInitialCooldowns];
  const primaryCooldownStepIndices = normalizedGuns.map(() => 0);
  const primaryBurstPhasePatternIndices = normalizedGuns.map(() => 0);
  const maxAimClampRadians = THREE.MathUtils.clamp(maxAimAngleRadians, 0, Math.PI);
  scene.add(projectilesRoot);
  scene.add(hitscanBeamPulsesRoot);

  const resetPrimaryCooldowns = (): void => {
    for (let i = 0; i < primaryCooldowns.length; i += 1) {
      primaryCooldowns[i] = primaryInitialCooldowns[i] ?? 0;
      primaryCooldownStepIndices[i] = 0;
      primaryBurstPhasePatternIndices[i] = 0;
    }
  };

  let primaryFireHeld = false;
  let lastPrimaryFireInputActive = false;
  let enabled = true;
  let hasLastYaw = false;
  let hasLastPlayerPosition = false;
  let lastYaw = 0;
  let turnDirection = 0;

  const onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      primaryFireHeld = true;
      event.preventDefault();
      return;
    }
  };

  const onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      primaryFireHeld = false;
      event.preventDefault();
      return;
    }
  };

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("contextmenu", onContextMenu);

  const findReticleHomingTargetHurtbox = (
    reticleWorldPosition: THREE.Vector3
  ): HurtboxComponent | null => {
    let bestTarget: HurtboxComponent | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }

      hurtbox.getWorldCenter(hurtboxCenter);
      hurtboxCenter.y = reticleWorldPosition.y;
      const targetRadius = Math.max(0, hurtbox.collisionArea.radius + reticleHomingTargetPadding);
      if (targetRadius <= 0) {
        continue;
      }

      const distanceSq = reticleWorldPosition.distanceToSquared(hurtboxCenter);
      if (distanceSq > targetRadius * targetRadius || distanceSq >= bestDistanceSq) {
        continue;
      }

      bestDistanceSq = distanceSq;
      bestTarget = hurtbox;
    }

    return bestTarget;
  };

  const spawnHitscanPulse = (
    hitscanPulse: NormalizedHitscanPulseFireModeDefinition,
    origin: THREE.Vector3,
    direction: THREE.Vector3
  ): void => {
    sparkBursts.spawnBurst(origin, direction);

    let nearestHurtbox: HurtboxComponent | null = null;
    let nearestHitDistance = Math.max(0.01, hitscanPulse.maxDistance);

    for (const hurtbox of targetHurtboxes) {
      if (!hurtbox.canReceiveDamage()) {
        continue;
      }
      if (
        hurtbox.faction &&
        hitscanPulse.sourceFaction &&
        hurtbox.faction === hitscanPulse.sourceFaction
      ) {
        continue;
      }
      const radius = Math.max(0, hurtbox.collisionArea.radius);
      if (radius <= 0) {
        continue;
      }

      hurtbox.getWorldCenter(hurtboxCenter);
      rayToCenter.subVectors(hurtboxCenter, origin);
      const projectionDistance = rayToCenter.dot(direction);
      if (projectionDistance < -radius) {
        continue;
      }

      const radiusSq = radius * radius;
      const perpendicularDistanceSq =
        rayToCenter.lengthSq() - projectionDistance * projectionDistance;
      if (perpendicularDistanceSq > radiusSq) {
        continue;
      }

      const halfChord = Math.sqrt(Math.max(0, radiusSq - perpendicularDistanceSq));
      let hitDistance = projectionDistance - halfChord;
      if (hitDistance < 0) {
        hitDistance = projectionDistance + halfChord;
      }
      if (hitDistance < 0 || hitDistance > nearestHitDistance) {
        continue;
      }

      nearestHitDistance = hitDistance;
      nearestHurtbox = hurtbox;
    }

    const beamDistance = Math.max(0.05, nearestHitDistance);
    beamEndPoint.copy(origin).addScaledVector(direction, beamDistance);

    if (nearestHurtbox) {
      beamHitPoint.copy(beamEndPoint);
      const hitResult = nearestHurtbox.receiveDamage({
        amount: hitscanPulse.damageAmount,
        damageType: hitscanPulse.damageType,
        segments:
          hitscanPulse.additionalDamageSegments.length > 0
            ? hitscanPulse.additionalDamageSegments
            : undefined,
        sourceFaction: hitscanPulse.sourceFaction
      });
      if (hitResult) {
        hitSparkExplosions.spawnExplosion(beamHitPoint, direction);
      }
    }

    const beamRoot = new THREE.Group();
    beamOrientation.setFromUnitVectors(unitCylinderAxis, direction);
    beamMidpoint.copy(origin).addScaledVector(direction, beamDistance * 0.5);
    beamRoot.position.copy(beamMidpoint);
    beamRoot.quaternion.copy(beamOrientation);

    const outerMaterial = new THREE.MeshBasicMaterial({
      color: hitscanPulse.beamColor,
      transparent: true,
      opacity: HITSCAN_BEAM_OUTER_OPACITY,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: hitscanPulse.beamCoreColor,
      transparent: true,
      opacity: HITSCAN_BEAM_INNER_OPACITY,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending
    });

    const outerBeam = new THREE.Mesh(hitscanBeamOuterGeometry, outerMaterial);
    const innerBeam = new THREE.Mesh(hitscanBeamInnerGeometry, innerMaterial);
    outerBeam.scale.set(
      hitscanPulse.beamThickness * HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER,
      beamDistance,
      hitscanPulse.beamThickness * HITSCAN_BEAM_OUTER_RADIUS_MULTIPLIER
    );
    innerBeam.scale.set(
      hitscanPulse.beamThickness * HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER,
      beamDistance,
      hitscanPulse.beamThickness * HITSCAN_BEAM_INNER_RADIUS_MULTIPLIER
    );
    outerBeam.renderOrder = 12;
    innerBeam.renderOrder = 13;
    outerBeam.frustumCulled = false;
    innerBeam.frustumCulled = false;
    beamRoot.add(outerBeam);
    beamRoot.add(innerBeam);
    hitscanBeamPulsesRoot.add(beamRoot);

    activeHitscanBeamPulses.push({
      age: 0,
      duration: hitscanPulse.pulseDurationSeconds,
      root: beamRoot,
      outerMaterial,
      innerMaterial
    });
  };

  const firePrimaryShot = (
    gun: NormalizedGunDefinition,
    playerState: PlayerControllerState,
    patternStepIndex = 0
  ): void => {
    fallbackForward.copy(playerState.forward).normalize();
    gun.hardpoint.getWorldPosition(muzzleWorld);
    aimTargetWorld.copy(aimReticle.position);
    if (hardpointAimOffsetScale !== 0) {
      hardpointLocalOffset.copy(muzzleWorld);
      playerRoot.worldToLocal(hardpointLocalOffset);
      hardpointLocalOffset.y = 0;
      if (hardpointLocalOffset.lengthSq() > 0.000001) {
        hardpointWorldOffset.copy(hardpointLocalOffset).applyQuaternion(playerRoot.quaternion);
        hardpointWorldOffset.y = 0;
        aimTargetWorld.addScaledVector(hardpointWorldOffset, hardpointAimOffsetScale);
      }
    }

    shipToAim.subVectors(aimTargetWorld, playerRoot.position);
    const useForwardOnly = shipToAim.lengthSq() < minAimDistanceFromShip * minAimDistanceFromShip;

    if (useForwardOnly) {
      aimDirection.copy(fallbackForward);
    } else {
      aimDirection.subVectors(aimTargetWorld, muzzleWorld);
      if (aimDirection.lengthSq() < 0.000001) {
        aimDirection.copy(fallbackForward);
      } else {
        aimDirection.setY(0);
        aimDirection.normalize();
        const dot = THREE.MathUtils.clamp(aimDirection.dot(fallbackForward), -1, 1);
        const signedAngle = Math.atan2(
          crossForwardAim.copy(fallbackForward).cross(aimDirection).dot(up),
          dot
        );
        const minAllowedAngle = turnDirection < 0 ? -maxAimClampRadians : 0;
        const maxAllowedAngle = turnDirection > 0 ? maxAimClampRadians : 0;
        const clampedAngle = turnDirection === 0
          ? THREE.MathUtils.clamp(signedAngle, -maxAimClampRadians, maxAimClampRadians)
          : THREE.MathUtils.clamp(signedAngle, minAllowedAngle, maxAllowedAngle);

        if (clampedAngle !== signedAngle) {
          clampedForward.copy(fallbackForward).applyAxisAngle(up, clampedAngle).normalize();
          aimDirection.copy(clampedForward);
        }
      }
    }

    if (gun.primary.hitscanPulse) {
      spawnHitscanPulse(gun.primary.hitscanPulse, muzzleWorld, aimDirection);
      return;
    }

    const projectileFactory = gun.primary.projectileFactory;
    if (!projectileFactory) {
      return;
    }

    const projectile = projectileFactory.spawn({
      direction: aimDirection,
      origin: muzzleWorld,
      patternStepIndex,
      homingTargetHurtbox: findReticleHomingTargetHurtbox(aimReticle.position)
    });

    if (projectile.object.parent) {
      projectile.object.parent.remove(projectile.object);
    }

    projectilesRoot.add(projectile.object);
    projectiles.push(projectile);
    const damageType = projectile.hitbox?.damageType;
    const effectScale = Math.max(0.1, projectile.effectScale ?? 1);
    if (damageType === "Plasma") {
      plasmaMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection);
    } else if (damageType === "Void") {
      voidMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection);
    } else if (damageType === "Frost" || damageType === "Cryo") {
      frostMuzzleGlobs.spawnBurst(muzzleWorld, aimDirection, estimatedShipVelocity);
    } else if (damageType === "Ion") {
      ionMuzzleBursts.spawnBurst(muzzleWorld, aimDirection, effectScale);
    } else {
      sparkBursts.spawnBurst(muzzleWorld, aimDirection);
    }
  };

  const update = (deltaTime: number, playerState: PlayerControllerState): void => {
    if (deltaTime <= 0) {
      return;
    }

    if (!hasLastPlayerPosition) {
      lastPlayerPosition.copy(playerState.position);
      estimatedShipVelocity.set(0, 0, 0);
      hasLastPlayerPosition = true;
    } else {
      playerPositionDelta.subVectors(playerState.position, lastPlayerPosition);
      estimatedShipVelocity.copy(playerPositionDelta).multiplyScalar(1 / Math.max(0.0001, deltaTime));
      lastPlayerPosition.copy(playerState.position);
    }

    if (hasLastYaw) {
      const yawDelta = shortestAngleDelta(lastYaw, playerState.yaw);
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
    lastYaw = playerState.yaw;

    const gamepadPrimaryFireHeld = isGamepadFireButtonHeld(GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX);

    lastPrimaryFireInputActive = enabled && (primaryFireHeld || gamepadPrimaryFireHeld);

    if (lastPrimaryFireInputActive) {
      for (let i = 0; i < normalizedGuns.length; i += 1) {
        const gun = normalizedGuns[i];
        primaryCooldowns[i] -= deltaTime;
        while (primaryCooldowns[i] <= 0) {
          const patternStepIndex = primaryCooldownStepIndices[i] ?? 0;
          const sequence = gun.primary.fireIntervalSequenceSeconds;
          const sequenceLength = Math.max(1, sequence.length);
          const currentStepIndex = patternStepIndex % sequenceLength;
          const burstPhasePattern = gun.primary.burstPhaseGroupPattern;
          const burstPhaseGroupId = gun.primary.burstPhaseGroupId;
          const burstPhasePatternIndex = primaryBurstPhasePatternIndices[i] ?? 0;
          const activeBurstPhaseGroupId =
            burstPhasePattern.length > 0
              ? burstPhasePattern[burstPhasePatternIndex % burstPhasePattern.length] ?? null
              : null;
          const allowBurstPhaseFire =
            burstPhasePattern.length <= 0 ||
            burstPhaseGroupId === null ||
            activeBurstPhaseGroupId === null ||
            burstPhaseGroupId === activeBurstPhaseGroupId;

          if (allowBurstPhaseFire) {
            const consumedCost = consumePrimaryFireCost?.({
              heatCost: gun.primary.heatCost,
              energyCost: gun.primary.energyCost
            }) ?? true;

            if (consumedCost) {
              firePrimaryShot(gun, playerState, patternStepIndex);
            }
          }

          const currentStepInterval = Math.max(
            0.001,
            sequence[currentStepIndex] ?? gun.primary.fireIntervalSeconds
          );
          const nextPatternStepIndex = sequence.length > 0 ? (patternStepIndex + 1) % sequence.length : 0;
          primaryCooldownStepIndices[i] = nextPatternStepIndex;
          if (burstPhasePattern.length > 0 && sequence.length > 0 && nextPatternStepIndex === 0) {
            primaryBurstPhasePatternIndices[i] =
              (burstPhasePatternIndex + 1) % Math.max(1, burstPhasePattern.length);
          }
          const applyIntervalMultiplier =
            gun.primary.fireIntervalMultiplierScope !== "burst_gap_only" ||
            sequence.length <= 1 ||
            (patternStepIndex % sequence.length) === sequence.length - 1;
          const intervalMultiplier = applyIntervalMultiplier
            ? Math.max(1, getPrimaryFireIntervalMultiplier?.() ?? 1)
            : 1;
          primaryCooldowns[i] += currentStepInterval * intervalMultiplier;
        }
      }
    } else {
      // Recover cooldowns while preserving phase spacing between guns.
      // Stop recovery once the next cannon in sequence becomes ready.
      let minCooldown = Number.POSITIVE_INFINITY;
      for (let i = 0; i < primaryCooldowns.length; i += 1) {
        minCooldown = Math.min(minCooldown, primaryCooldowns[i] ?? 0);
      }
      const recoverStep = Math.max(0, Math.min(deltaTime, minCooldown));
      for (let i = 0; i < primaryCooldowns.length; i += 1) {
        primaryCooldowns[i] = Math.max(0, primaryCooldowns[i] - recoverStep);
      }
    }

    for (let i = projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = projectiles[i];
      let removedOnCollision = false;
      while (true) {
        const collision = resolveHitboxAgainstHurtboxes(projectile.hitbox, targetHurtboxes);
        if (!collision) {
          break;
        }
        const damageType = projectile.hitbox?.damageType;
        const hitEffectId = projectile.hitEffectId;
        const effectScale = Math.max(0.1, projectile.effectScale ?? 1);
        if (damageType === "Plasma") {
          if (hitEffectId === "plasma_arc_red_spark") {
            projectile.object.getWorldDirection(fallbackForward);
            plasmaArcHitSparkExplosions.spawnExplosion(projectile.object.position, fallbackForward);
          } else {
            plasmaHitImplosions.spawnImplosion(
              projectile.object.position,
              projectile.hitbox?.collisionArea.radius
            );
          }
        } else {
          projectile.object.getWorldDirection(fallbackForward);
          if (damageType === "Ion") {
            ionHitBursts.spawnBurst(projectile.object.position, fallbackForward, effectScale);
          } else if (damageType === "Solar") {
            solarHitFlashes.spawnFlash(projectile.object.position, effectScale);
          } else if (damageType === "Frost" || damageType === "Cryo") {
            frostHitBursts.spawnBurst(projectile.object.position, fallbackForward, effectScale);
          } else if (damageType === "Void") {
            voidHitVortices.spawnVortex(
              projectile.object.position,
              fallbackForward,
              projectile.hitbox?.collisionArea.radius
            );
          } else {
            hitSparkExplosions.spawnExplosion(projectile.object.position, fallbackForward);
          }
        }
        const shouldDestroy = projectile.beginDestroy?.("collision") ?? true;
        if (!shouldDestroy) {
          continue;
        }
        projectilesRoot.remove(projectile.object);
        projectile.dispose?.();
        projectiles.splice(i, 1);
        removedOnCollision = true;
        break;
      }
      if (removedOnCollision) {
        continue;
      }

      if (projectile.update(deltaTime)) {
        continue;
      }
      projectile.beginDestroy?.("expired");

      projectilesRoot.remove(projectile.object);
      projectile.dispose?.();
      projectiles.splice(i, 1);
    }

    for (let i = activeHitscanBeamPulses.length - 1; i >= 0; i -= 1) {
      const pulse = activeHitscanBeamPulses[i];
      pulse.age += deltaTime;

      const t = THREE.MathUtils.clamp(pulse.age / Math.max(0.0001, pulse.duration), 0, 1);
      const fadeStartT = HITSCAN_BEAM_FADE_START_RATIO;
      const fadeT =
        t <= fadeStartT ? 0 : THREE.MathUtils.clamp((t - fadeStartT) / Math.max(0.0001, 1 - fadeStartT), 0, 1);
      const fade = 1 - fadeT;
      const flicker = 0.92 + 0.08 * Math.sin((pulse.age / Math.max(0.0001, pulse.duration)) * 22);
      pulse.outerMaterial.opacity = Math.max(0, HITSCAN_BEAM_OUTER_OPACITY * fade * fade * flicker);
      pulse.innerMaterial.opacity = Math.max(0, HITSCAN_BEAM_INNER_OPACITY * fade * flicker);

      if (pulse.age < pulse.duration) {
        continue;
      }

      pulse.root.removeFromParent();
      pulse.outerMaterial.dispose();
      pulse.innerMaterial.dispose();
      activeHitscanBeamPulses.splice(i, 1);
    }

    sparkBursts.update(deltaTime);
    ionMuzzleBursts.update(deltaTime);
    plasmaMuzzleGlobs.update(deltaTime);
    voidMuzzleGlobs.update(deltaTime);
    frostMuzzleGlobs.update(deltaTime);
    hitSparkExplosions.update(deltaTime);
    plasmaArcHitSparkExplosions.update(deltaTime);
    ionHitBursts.update(deltaTime);
    frostHitBursts.update(deltaTime);
    plasmaHitImplosions.update(deltaTime);
    solarHitFlashes.update(deltaTime);
    voidHitVortices.update(deltaTime);
  };

  const dispose = (): void => {
    canvas.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    canvas.removeEventListener("contextmenu", onContextMenu);

    for (const projectile of projectiles) {
      projectile.dispose?.();
    }
    for (const pulse of activeHitscanBeamPulses) {
      pulse.root.removeFromParent();
      pulse.outerMaterial.dispose();
      pulse.innerMaterial.dispose();
    }
    activeHitscanBeamPulses.length = 0;
    sparkBursts.dispose();
    ionMuzzleBursts.dispose();
    plasmaMuzzleGlobs.dispose();
    voidMuzzleGlobs.dispose();
    frostMuzzleGlobs.dispose();
    hitSparkExplosions.dispose();
    plasmaArcHitSparkExplosions.dispose();
    ionHitBursts.dispose();
    frostHitBursts.dispose();
    plasmaHitImplosions.dispose();
    solarHitFlashes.dispose();
    voidHitVortices.dispose();
    projectilesRoot.clear();
    hitscanBeamPulsesRoot.clear();
    scene.remove(projectilesRoot);
    scene.remove(hitscanBeamPulsesRoot);
    hitscanBeamOuterGeometry.dispose();
    hitscanBeamInnerGeometry.dispose();

    const uniqueFactories = new Set<ProjectileFactory>();
    for (const gun of normalizedGuns) {
      if (gun.primary.projectileFactory) {
        uniqueFactories.add(gun.primary.projectileFactory);
      }
    }
    for (const factory of uniqueFactories) {
      factory.dispose?.();
    }
  };

  return {
    update,
    isPrimaryFireInputActive: () => lastPrimaryFireInputActive,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled) {
        primaryFireHeld = false;
        lastPrimaryFireInputActive = false;
        resetPrimaryCooldowns();
      }
    },
    dispose
  };
}

function isGamepadFireButtonHeld(buttonIndex: number): boolean {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) {
    return false;
  }

  for (const gamepad of gamepads) {
    if (!gamepad?.connected) {
      continue;
    }

    if (gamepad.buttons[buttonIndex]?.pressed) {
      return true;
    }
  }

  return false;
}

function normalizeGunDefinitions(guns: readonly GunDefinition[]): NormalizedGunDefinition[] {
  return guns
    .map((gun) => {
      const primaryProfile: GunFireModeDefinition | undefined =
        gun.primary ??
        (gun.projectileFactory
          ? {
              fireIntervalSeconds: gun.fireIntervalSeconds,
              projectileFactory: gun.projectileFactory,
              heatCost: 0,
              energyCost: 0
            }
          : undefined);
      if (!primaryProfile) {
        return null;
      }
      if (!primaryProfile.projectileFactory && !primaryProfile.hitscanPulse) {
        return null;
      }

      return {
        hardpoint: gun.hardpoint,
        primary: {
          fireIntervalSeconds:
            primaryProfile.fireIntervalSeconds ?? DEFAULT_GUN_FIRE_INTERVAL_SECONDS,
          fireIntervalSequenceSeconds:
            (primaryProfile.fireIntervalSequenceSeconds ?? []).map((interval) =>
              Math.max(0.001, interval)
            ),
          fireIntervalMultiplierScope: primaryProfile.fireIntervalMultiplierScope ?? "all_steps",
          burstPhaseGroupId:
            typeof primaryProfile.burstPhaseGroupId === "number"
              ? Math.floor(primaryProfile.burstPhaseGroupId)
              : null,
          burstPhaseGroupPattern: (primaryProfile.burstPhaseGroupPattern ?? [])
            .map((value) => Math.floor(value))
            .filter((value) => Number.isFinite(value)),
          phaseOffsetSeconds: primaryProfile.phaseOffsetSeconds ?? 0,
          projectileFactory: primaryProfile.projectileFactory ?? null,
          hitscanPulse: primaryProfile.hitscanPulse
            ? {
                maxDistance: Math.max(
                  0.01,
                  primaryProfile.hitscanPulse.maxDistance ?? DEFAULT_HITSCAN_BEAM_MAX_DISTANCE
                ),
                pulseDurationSeconds: Math.max(
                  0.01,
                  primaryProfile.hitscanPulse.pulseDurationSeconds ??
                    DEFAULT_HITSCAN_BEAM_PULSE_DURATION_SECONDS
                ),
                beamThickness: Math.max(
                  0.005,
                  primaryProfile.hitscanPulse.beamThickness ?? DEFAULT_HITSCAN_BEAM_THICKNESS
                ),
                damageAmount: Math.max(0, primaryProfile.hitscanPulse.damageAmount),
                damageType: primaryProfile.hitscanPulse.damageType ?? LASER_DAMAGE_TYPE,
                additionalDamageSegments:
                  primaryProfile.hitscanPulse.additionalDamageSegments
                    ?.map((segment) => ({
                      amount: Math.max(0, segment.amount),
                      damageType: segment.damageType
                    }))
                    .filter((segment) => segment.amount > 0) ?? [],
                sourceFaction: primaryProfile.hitscanPulse.sourceFaction ?? null,
                hitSparkIntervalSeconds: Math.max(
                  0.01,
                  primaryProfile.hitscanPulse.hitSparkIntervalSeconds ??
                    DEFAULT_HITSCAN_BEAM_HIT_SPARK_INTERVAL_SECONDS
                ),
                beamColor: primaryProfile.hitscanPulse.beamColor ?? 0x40ff6b,
                beamCoreColor: primaryProfile.hitscanPulse.beamCoreColor ?? 0xeefff4
              }
            : null,
          heatCost: Math.max(0, primaryProfile.heatCost ?? 0),
          energyCost: Math.max(0, primaryProfile.energyCost ?? 0)
        }
      };
    })
    .filter((gun): gun is NormalizedGunDefinition => gun !== null);
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
