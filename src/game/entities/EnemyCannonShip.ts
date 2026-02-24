import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createHealthComponent,
  type HealthConfig,
  type HealthSnapshot
} from "../components/HealthComponent";
import {
  createShipResourceComponent,
  type ShipResourceConfig
} from "../components/ShipResourceComponent";
import { createHurtboxComponent, type HurtboxComponent } from "../components/combat/HurtboxComponent";
import {
  createLaserBoltFactory,
  type LaserBoltFactoryOptions
} from "../controllers/projectiles/LaserBoltFactory";
import { createCannonOverheatGlowEffect } from "../effects/CannonOverheatGlowEffect";
import { createCannonOverheatSteamEffect } from "../effects/CannonOverheatSteamEffect";
import { createPlayerThrusterEffect } from "../effects/PlayerThrusterEffect";
import { createShieldBubbleEffect, type ShieldBubbleEffectOptions } from "../effects/ShieldBubbleEffect";
import { createShipGunSparkBurstSystem } from "../effects/ShipGunSparkBurstSystem";
import type {
  ProjectileFactory
} from "../controllers/projectiles/ProjectileTypes";
import type { EnemyShipAiStateId } from "../enemies/ai/EnemyShipAiTypes";
import { EnemyProjectileRuntime } from "../enemies/combat/EnemyProjectileRuntime";
import { EnemyPrimaryAttackLoadout } from "../enemies/combat/EnemyPrimaryAttackLoadout";
import { EnemyBurstWeaponController } from "../enemies/combat/EnemyBurstWeaponController";
import { EnemyShipFlightController } from "../enemies/flight/EnemyShipFlightController";
import { CenterPassEdgePatrolPlanner } from "../enemies/patrol/CenterPassEdgePatrolPlanner";
import { EnemyShipPerceptionController } from "../enemies/perception/EnemyShipPerceptionController";
import { randomRange, shortestAngleDelta } from "../enemies/utils/EnemyShipMath";
import { EnemyShipMuzzleRig } from "../enemies/visuals/EnemyShipMuzzleRig";
import {
  alignModelToGroundCentered,
  createSilhouetteOutlineShell,
  disposeObject3DMeshResources,
  extractSocketLocalOffsets,
  extractSocketSizeScales,
  normalizeModelToSize
} from "../enemies/visuals/EnemyShipModelRigUtils";

const DEFAULT_MUZZLE_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.32, 0.86, 1.22),
  new THREE.Vector3(0.32, 0.86, 1.22)
];
const DEFAULT_THRUSTER_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.34, 0.76, 1.02),
  new THREE.Vector3(0.34, 0.76, 1.02)
];
const CANNON_SOCKET_PREFIX = "cannon";
const THRUSTER_SOCKET_PREFIX = "thruster";
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const ENEMY_LASERBOLT_BODY_COLOR_HEX = 0x72ff9a;
const ENEMY_LASERBOLT_EMISSIVE_COLOR_HEX = 0x2dff55;
const ENEMY_OUTLINE_COLOR_HEX = 0xff4b4b;
const ENEMY_CANNON_MUZZLE_SPARK_COUNT = 16;
const ENEMY_CANNON_MUZZLE_BURST_LIFETIME_SECONDS = 0.1;
const ENEMY_CANNON_MUZZLE_SPEED_MIN = 1.3;
const ENEMY_CANNON_MUZZLE_SPEED_MAX = 4.7;
const ENEMY_CANNON_MUZZLE_SPREAD_RADIANS = THREE.MathUtils.degToRad(8);

export type EnemyCannonShipConfig = {
  health: HealthConfig;
  position?: THREE.Vector3;
  patrolCenter?: THREE.Vector3;
  patrolPattern?: "orbit" | "center_pass_edge";
  patrolRadius?: number;
  patrolEdgeRadius?: number;
  patrolCenterPassOffsetMin?: number;
  patrolCenterPassOffsetMax?: number;
  patrolSpeed?: number;
  patrolOrbitSpeedRadians?: number;
  chaseSpeed?: number;
  attackStrafeSpeed?: number;
  preferredAttackDistance?: number;
  turnSpeedRadians?: number;
  fireArcRadians?: number;
  aimLeadFactor?: number;
  projectileSpeedForLead?: number;
  shotInaccuracyRadians?: number;
  burstShotCount?: number;
  burstTelegraphSeconds?: number;
  burstShotIntervalSeconds?: number;
  burstCooldownSeconds?: number;
  primaryShotHeatCost?: number;
  primaryAttackHeatCost?: number;
  hurtboxRadius?: number;
  hurtboxLocalOffset?: THREE.Vector3;
  playerTarget?: THREE.Object3D | null;
  targetHurtboxes?: readonly HurtboxComponent[];
  projectileFactory?: ProjectileFactory;
  projectileOptions?: LaserBoltFactoryOptions;
  modelUrl?: string;
  modelYawOffset?: number;
  modelDesiredSize?: number;
  modelHeightOffset?: number;
  muzzleLocalOffsets?: readonly THREE.Vector3[];
  muzzleTelegraphOuterColorHex?: number;
  muzzleTelegraphInnerBaseColorHex?: number;
  muzzleTelegraphInnerPeakColorHex?: number;
  shieldBubbleEffectOptions?: ShieldBubbleEffectOptions;
  resourceConfig?: ShipResourceConfig;
};

export type EnemyCannonShipDebugSnapshot = {
  state: EnemyShipAiStateId;
  burstCooldownSecondsRemaining: number;
  burstShotCooldownSecondsRemaining: number;
  burstShotsRemaining: number;
};

export class EnemyCannonShip {
  readonly root: THREE.Group;
  readonly hurtbox: HurtboxComponent;

  private readonly scene: THREE.Scene;
  private readonly health: ReturnType<typeof createHealthComponent>;
  private readonly resources: ReturnType<typeof createShipResourceComponent> | null;
  private readonly targetHurtboxes: readonly HurtboxComponent[];
  private readonly projectileFactory: ProjectileFactory;
  private readonly ownedProjectileFactory: ProjectileFactory | null;
  private readonly projectileRuntime: EnemyProjectileRuntime;
  private readonly muzzleSparkBursts: ReturnType<typeof createShipGunSparkBurstSystem>;
  private readonly flightController: EnemyShipFlightController;
  private readonly burstWeapon: EnemyBurstWeaponController;
  private readonly primaryAttackLoadout: EnemyPrimaryAttackLoadout;
  private readonly perception: EnemyShipPerceptionController;
  private readonly muzzleRig: EnemyShipMuzzleRig;
  private readonly primaryShotHeatCost: number;
  private readonly primaryAttackHeatCost: number;
  private readonly thrusterEffectAnchor = new THREE.Group();
  private shieldBubbleEffect: ReturnType<typeof createShieldBubbleEffect> | null = null;
  private cannonOverheatGlowEffect: ReturnType<typeof createCannonOverheatGlowEffect> | null = null;
  private cannonOverheatSteamEffect: ReturnType<typeof createCannonOverheatSteamEffect> | null = null;
  private thrusterEffect: ReturnType<typeof createPlayerThrusterEffect> | null = null;
  private readonly centerPassPatrolPlanner: CenterPassEdgePatrolPlanner | null;

  private readonly patrolCenter: THREE.Vector3;
  private readonly patrolPattern: "orbit" | "center_pass_edge";
  private readonly patrolRadius: number;
  private readonly patrolEdgeRadius: number;
  private readonly patrolCenterPassOffsetMin: number;
  private readonly patrolCenterPassOffsetMax: number;
  private readonly patrolSpeed: number;
  private readonly patrolOrbitSpeedRadians: number;
  private readonly chaseSpeed: number;
  private readonly attackStrafeSpeed: number;
  private readonly preferredAttackDistance: number;
  private readonly turnSpeedRadians: number;
  private readonly fireArcRadians: number;
  private readonly aimLeadFactor: number;
  private readonly projectileSpeedForLead: number;
  private readonly shotInaccuracyRadians: number;
  private readonly maxMoveSpeedForThrusters: number;

  private readonly targetWorld = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();
  private readonly strafeDirection = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly muzzleWorldPosition = new THREE.Vector3();
  private readonly worldForward = new THREE.Vector3();
  private readonly aimTargetWorld = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly patrolDesiredPosition = new THREE.Vector3();
  private readonly flybyTargetPoint = new THREE.Vector3();

  private aiState: EnemyShipAiStateId = "Spawn";
  private patrolOrbitAngle = Math.random() * Math.PI * 2;
  private nextBurstMuzzleIndex = 0;
  private incomingFireEvadeRollCooldownRemaining = 0;
  private evadeCooldownRemaining = 0;
  private disposed = false;

  constructor(config: EnemyCannonShipConfig, scene: THREE.Scene) {
    this.scene = scene;
    this.health = createHealthComponent(config.health);
    this.resources = config.resourceConfig ? createShipResourceComponent(config.resourceConfig) : null;
    this.targetHurtboxes = config.targetHurtboxes ?? [];
    this.perception = new EnemyShipPerceptionController({
      initialTarget: config.playerTarget ?? null,
      primaryFireThreatWindowSeconds: 0.18
    });
    this.patrolCenter = (config.patrolCenter ?? config.position ?? new THREE.Vector3()).clone();
    this.patrolPattern = config.patrolPattern ?? "orbit";
    this.patrolRadius = Math.max(1, config.patrolRadius ?? 8);
    this.patrolEdgeRadius = Math.max(1, config.patrolEdgeRadius ?? this.patrolRadius);
    this.patrolCenterPassOffsetMin = Math.max(0, config.patrolCenterPassOffsetMin ?? 3);
    this.patrolCenterPassOffsetMax = Math.max(
      this.patrolCenterPassOffsetMin,
      config.patrolCenterPassOffsetMax ?? 12
    );
    this.patrolSpeed = Math.max(0, config.patrolSpeed ?? 6);
    this.patrolOrbitSpeedRadians = Math.max(0, config.patrolOrbitSpeedRadians ?? 0.75);
    this.chaseSpeed = Math.max(0, config.chaseSpeed ?? 10);
    this.attackStrafeSpeed = Math.max(0, config.attackStrafeSpeed ?? 7);
    this.preferredAttackDistance = Math.max(0, config.preferredAttackDistance ?? 12);
    this.turnSpeedRadians = Math.max(0, config.turnSpeedRadians ?? THREE.MathUtils.degToRad(170));
    this.fireArcRadians = THREE.MathUtils.clamp(
      config.fireArcRadians ?? THREE.MathUtils.degToRad(24),
      0,
      Math.PI
    );
    this.aimLeadFactor = THREE.MathUtils.clamp(config.aimLeadFactor ?? 0.7, 0, 1.25);
    this.projectileSpeedForLead = Math.max(
      0.001,
      config.projectileSpeedForLead ?? config.projectileOptions?.speed ?? 20
    );
    this.shotInaccuracyRadians = Math.max(
      0,
      config.shotInaccuracyRadians ?? THREE.MathUtils.degToRad(5)
    );
    this.primaryShotHeatCost = Math.max(0, config.primaryShotHeatCost ?? 0);
    this.primaryAttackHeatCost = Math.max(0, config.primaryAttackHeatCost ?? 0);
    this.maxMoveSpeedForThrusters = Math.max(
      0.001,
      this.patrolSpeed,
      this.chaseSpeed,
      this.attackStrafeSpeed
    );
    this.centerPassPatrolPlanner =
      this.patrolPattern === "center_pass_edge"
        ? new CenterPassEdgePatrolPlanner({
            center: this.patrolCenter,
            edgeRadius: this.patrolEdgeRadius,
            centerPassOffsetMin: this.patrolCenterPassOffsetMin,
            centerPassOffsetMax: this.patrolCenterPassOffsetMax
          })
        : null;

    if (config.projectileFactory) {
      this.projectileFactory = config.projectileFactory;
      this.ownedProjectileFactory = null;
    } else {
      this.ownedProjectileFactory = createLaserBoltFactory({
        faction: "enemy",
        speed: 20,
        ...(config.projectileOptions ?? {})
      });
      this.projectileFactory = this.ownedProjectileFactory;
    }

    this.root = new THREE.Group();
    this.root.position.copy(config.position ?? new THREE.Vector3());
    this.scene.add(this.root);
    this.burstWeapon = new EnemyBurstWeaponController({
      id: "laser_burst",
      shotCount: Math.max(1, Math.floor(config.burstShotCount ?? 3)),
      telegraphSeconds: Math.max(0, config.burstTelegraphSeconds ?? 0.42),
      shotIntervalSeconds: Math.max(0.03, config.burstShotIntervalSeconds ?? 0.15),
      burstCooldownSeconds: Math.max(0, config.burstCooldownSeconds ?? 1.75),
      generalAttackCooldownSeconds: 0.8,
      executeShot: () => this.spawnLaserBurstShot()
    });
    this.primaryAttackLoadout = new EnemyPrimaryAttackLoadout({
      actions: [this.burstWeapon],
      selectionPolicy: "first_ready"
    });
    const maxForwardSpeed = Math.max(
      0.001,
      this.patrolSpeed,
      this.chaseSpeed,
      this.attackStrafeSpeed
    );
    this.flightController = new EnemyShipFlightController({
      root: this.root,
      minForwardSpeed: 1.5,
      maxForwardSpeed,
      forwardAccel: maxForwardSpeed * 2.1,
      forwardDecel: maxForwardSpeed * 2.6,
      maxStrafeSpeed: Math.max(0, this.attackStrafeSpeed * 0.75),
      strafeAccel: Math.max(4, this.attackStrafeSpeed * 2.2),
      strafeDamping: Math.max(4, this.attackStrafeSpeed * 2.8),
      maxBankAngleRadians: THREE.MathUtils.degToRad(18),
      bankInRateRadians: THREE.MathUtils.degToRad(260),
      bankOutRateRadians: THREE.MathUtils.degToRad(210),
      maxTurnRateAtMinSpeed: this.turnSpeedRadians,
      maxTurnRateAtMaxSpeed: Math.max(THREE.MathUtils.degToRad(35), this.turnSpeedRadians * 0.33)
    });
    this.previousPosition.copy(this.root.position);
    this.centerPassPatrolPlanner?.ensureInitialized(this.root.position);

    this.projectileRuntime = new EnemyProjectileRuntime({
      scene: this.scene,
      projectileFactory: this.projectileFactory,
      targetHurtboxes: this.targetHurtboxes,
      rootName: "enemy-cannon-ship-projectiles"
    });
    this.muzzleSparkBursts = createShipGunSparkBurstSystem(this.scene, {
      sparkCountPerBurst: ENEMY_CANNON_MUZZLE_SPARK_COUNT,
      burstLifetimeSeconds: ENEMY_CANNON_MUZZLE_BURST_LIFETIME_SECONDS,
      speedMin: ENEMY_CANNON_MUZZLE_SPEED_MIN,
      speedMax: ENEMY_CANNON_MUZZLE_SPEED_MAX,
      spreadRadians: ENEMY_CANNON_MUZZLE_SPREAD_RADIANS
    });

    this.root.add(this.thrusterEffectAnchor);
    this.rebuildThrusterEffect(DEFAULT_THRUSTER_LOCAL_OFFSETS);

    this.muzzleRig = new EnemyShipMuzzleRig(this.root, {
      localOffsets: config.muzzleLocalOffsets ?? DEFAULT_MUZZLE_LOCAL_OFFSETS,
      outerColorHex: config.muzzleTelegraphOuterColorHex ?? ENEMY_LASERBOLT_BODY_COLOR_HEX,
      innerBaseColorHex:
        config.muzzleTelegraphInnerBaseColorHex ?? ENEMY_LASERBOLT_EMISSIVE_COLOR_HEX,
      innerPeakColorHex:
        config.muzzleTelegraphInnerPeakColorHex ?? ENEMY_LASERBOLT_BODY_COLOR_HEX
    });
    if (this.resources) {
      this.cannonOverheatGlowEffect = createCannonOverheatGlowEffect(this.root, this.muzzleRig.muzzles);
      this.cannonOverheatSteamEffect = createCannonOverheatSteamEffect(this.scene, this.muzzleRig.muzzles);
    }
    if (config.modelUrl) {
      this.loadOptionalModel(
        config.modelUrl,
        config.modelYawOffset ?? 0,
        config.modelDesiredSize ?? 2.25,
        config.modelHeightOffset ?? 0
      );
    } else {
      this.createFallbackBody();
    }

    this.hurtbox = createHurtboxComponent({
      collisionArea: {
        radius: Math.max(0.2, config.hurtboxRadius ?? 1.3),
        localOffset: config.hurtboxLocalOffset?.clone() ?? new THREE.Vector3(0, 1, 0)
      },
      faction: "enemy",
      health: this.health,
      owner: this.root,
      onHit: (event) => {
        this.resources?.applyIncomingDamageHeat(
          event.damagePacket.damageType,
          event.breakdown.incomingBaseDamage
        );
      }
    });
    if (config.health.maxShield > 0) {
      this.shieldBubbleEffect = createShieldBubbleEffect(
        this.root,
        config.shieldBubbleEffectOptions
      );
    }
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }

    this.projectileRuntime.update(deltaTime);
    this.muzzleSparkBursts.update(deltaTime);
    this.health.update(deltaTime);
    this.resources?.update(deltaTime);
    this.perception.update(deltaTime);
    this.updateAttackTimers(deltaTime);
    const healthSnapshot = this.health.getSnapshot();
    this.shieldBubbleEffect?.update(deltaTime, healthSnapshot);
    if (this.resources) {
      const resourceSnapshot = this.resources.getSnapshot();
      const heat01 =
        resourceSnapshot.heat.max > 0
          ? THREE.MathUtils.clamp(resourceSnapshot.heat.current / resourceSnapshot.heat.max, 0, 1)
          : 0;
      this.cannonOverheatGlowEffect?.update(deltaTime, heat01, false);
      this.root.getWorldDirection(this.worldForward);
      this.worldForward.setY(0);
      if (this.worldForward.lengthSq() <= 0.000001) {
        this.worldForward.copy(FORWARD_AXIS);
      } else {
        this.worldForward.normalize();
      }
      this.cannonOverheatSteamEffect?.update(
        deltaTime,
        resourceSnapshot.heat.overheated,
        this.worldForward
      );
    }
    const telegraphVisual = this.primaryAttackLoadout.getTelegraphVisualState();
    this.muzzleRig.updateChargeEffect({
      ...telegraphVisual,
      active: this.aiState === "Attack" && telegraphVisual.active
    });
    this.updateThrusterEffect(deltaTime);
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.perception.setTarget(target);
  }

  setPlayerPrimaryFireActive(isActive: boolean): void {
    if (isActive) {
      this.perception.signalTargetPrimaryFire();
    }
  }

  isDestroyed(): boolean {
    return this.health.getSnapshot().destroyed;
  }

  getHealthSnapshot(): HealthSnapshot {
    return this.health.getSnapshot();
  }

  getTargetDistance(): number | null {
    return this.perception.getTargetDistance2DFrom(this.root.position, this.targetWorld);
  }

  hasPassiveSensorContact(maxRange: number): boolean {
    return this.perception.hasPassiveSensorContact(this.root.position, maxRange, this.targetWorld);
  }

  copyLastKnownTargetPosition(out: THREE.Vector3): boolean {
    return this.perception.copyLastKnownTargetPosition(out);
  }

  hasAimVisionContact(maxRange: number, fovRadians: number): boolean {
    this.root.getWorldDirection(this.worldForward);
    return this.perception.hasAimVisionContact(
      this.root.position,
      this.worldForward,
      maxRange,
      fovRadians
    );
  }

  faceTarget(deltaTime: number): boolean {
    if (!this.perception.predictAimTarget(
      this.root.position,
      this.projectileSpeedForLead,
      this.aimLeadFactor,
      this.aimTargetWorld
    )) {
      return false;
    }

    this.toTarget.subVectors(this.aimTargetWorld, this.root.position).setY(0);
    if (this.toTarget.lengthSq() <= 0.000001) {
      return true;
    }
    this.toTarget.normalize();

    const aligned = this.flightController.rotateToward(deltaTime, this.toTarget);
    if (!aligned) {
      const desiredYaw = Math.atan2(this.toTarget.x, this.toTarget.z);
      return Math.abs(shortestAngleDelta(this.root.rotation.y, desiredYaw)) <= this.fireArcRadians * 0.5;
    }
    return true;
  }

  updatePatrolMovement(deltaTime: number): void {
    if (this.patrolPattern === "center_pass_edge") {
      const stopDistance = this.centerPassPatrolPlanner?.update(
        this.root.position,
        this.patrolSpeed,
        deltaTime,
        this.patrolDesiredPosition
      );
      if (stopDistance !== null && stopDistance !== undefined) {
        this.moveTowardWorldPosition(this.patrolDesiredPosition, this.patrolSpeed, deltaTime, stopDistance);
      }
      return;
    }

    this.patrolOrbitAngle += this.patrolOrbitSpeedRadians * deltaTime;
    this.patrolDesiredPosition.set(
      this.patrolCenter.x + Math.cos(this.patrolOrbitAngle) * this.patrolRadius,
      this.root.position.y,
      this.patrolCenter.z + Math.sin(this.patrolOrbitAngle) * this.patrolRadius
    );
    this.moveTowardWorldPosition(this.patrolDesiredPosition, this.patrolSpeed, deltaTime, 0.8);
  }

  updateEngageMovement(deltaTime: number): void {
    const distanceToTarget = this.getTargetDistance();
    if (distanceToTarget === null) {
      return;
    }

    const desiredDistance = this.preferredAttackDistance + 1.5;
    if (distanceToTarget > desiredDistance + 2.5) {
      this.moveTowardWorldPosition(this.targetWorld, this.chaseSpeed, deltaTime, desiredDistance);
      return;
    }
    if (distanceToTarget < Math.max(4, desiredDistance - 2.25)) {
      this.moveAwayFromWorldPosition(this.targetWorld, this.chaseSpeed * 0.72, deltaTime);
      return;
    }

    this.coastForward(deltaTime, this.chaseSpeed * 0.45);
  }

  updateAttackMovement(deltaTime: number, distanceToTarget: number): void {
    if (distanceToTarget <= 0.000001) {
      return;
    }

    // While aiming for an attack, keep thrusting forward instead of sliding.
    if (distanceToTarget <= this.preferredAttackDistance * 0.82) {
      return;
    }

    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
      if (this.toTarget.lengthSq() <= 0.000001) {
        return;
      }
      this.toTarget.normalize();
      this.worldForward.copy(this.toTarget);
    } else {
      this.worldForward.normalize();
    }

    const overshootBand = Math.max(2.5, this.preferredAttackDistance * 0.22);
    const throttle01 = THREE.MathUtils.clamp(
      (distanceToTarget - this.preferredAttackDistance) / overshootBand,
      0.2,
      1
    );
    this.moveAlongDirection(this.worldForward, this.attackStrafeSpeed * throttle01, deltaTime);
  }

  buildFlybyTargetPoint(out: THREE.Vector3): boolean {
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      return false;
    }
    this.perception.hasPassiveSensorContact(this.root.position, Number.POSITIVE_INFINITY, this.targetWorld);

    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    if (this.toTarget.lengthSq() <= 0.000001) {
      this.toTarget.set(0, 0, 1);
    } else {
      this.toTarget.normalize();
    }

    const lateralSign = Math.random() < 0.5 ? -1 : 1;
    this.strafeDirection.set(-this.toTarget.z * lateralSign, 0, this.toTarget.x * lateralSign);
    const beyondDistance = THREE.MathUtils.clamp(this.preferredAttackDistance + 10, 16, 28);
    const lateralDistance = THREE.MathUtils.clamp(this.preferredAttackDistance * 0.6, 6, 12);
    this.flybyTargetPoint
      .copy(this.targetWorld)
      .addScaledVector(this.toTarget, beyondDistance)
      .addScaledVector(this.strafeDirection, lateralDistance);
    this.flybyTargetPoint.y = this.root.position.y;
    out.copy(this.flybyTargetPoint);
    return true;
  }

  updateFlybyApproachMovement(deltaTime: number, flybyTargetPoint: THREE.Vector3): boolean {
    this.moveTowardWorldPosition(flybyTargetPoint, this.chaseSpeed * 1.5, deltaTime, 1.6);
    return this.isNearPoint2D(flybyTargetPoint, 2.2);
  }

  updateFlybyTurnbackMovement(deltaTime: number): void {
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      return;
    }

    // Bank back toward another approach line; Engage state will pick the next action.
    this.moveTowardWorldPosition(
      this.targetWorld,
      this.chaseSpeed * 1.15,
      deltaTime,
      this.preferredAttackDistance + 5
    );
  }

  updateSearchMovement(deltaTime: number, searchTarget: THREE.Vector3): boolean {
    this.moveTowardWorldPosition(searchTarget, this.patrolSpeed * 0.95, deltaTime, 1.4);
    return this.isNearPoint2D(searchTarget, 1.8);
  }

  updateCoastMovement(deltaTime: number): void {
    this.coastForward(deltaTime, this.chaseSpeed * 0.5);
  }

  updateEvadeMovement(deltaTime: number, strafeSign: 1 | -1): void {
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      return;
    }
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    if (this.toTarget.lengthSq() <= 0.000001) {
      return;
    }
    this.toTarget.normalize();

    this.moveDirection.copy(this.toTarget).multiplyScalar(-1);
    const escapeHeading = this.moveDirection.lengthSq() > 0.000001 ? this.moveDirection : this.toTarget;
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: escapeHeading,
      desiredForwardSpeed: this.chaseSpeed * 1.05,
      desiredStrafe: strafeSign
    });
  }

  updateFleeMovement(deltaTime: number): void {
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      this.coastForward(deltaTime, this.chaseSpeed * 0.75);
      return;
    }
    this.moveAwayFromWorldPosition(this.targetWorld, this.chaseSpeed, deltaTime);
  }

  getHealthRatio01(): number {
    const snapshot = this.health.getSnapshot();
    const totalMax = snapshot.armor.max + snapshot.hull.max + snapshot.shield.max;
    const totalCurrent = snapshot.armor.current + snapshot.hull.current + snapshot.shield.current;
    if (totalMax <= 0) {
      return snapshot.destroyed ? 0 : 1;
    }
    return THREE.MathUtils.clamp(totalCurrent / totalMax, 0, 1);
  }

  canStartPrimaryAttack(): boolean {
    if (this.resources && !this.resources.canFireCannons()) {
      return false;
    }
    return this.primaryAttackLoadout.canStartPrimaryAttack();
  }

  isAttackActionActive(): boolean {
    return this.primaryAttackLoadout.isAttackActionActive();
  }

  tryExecutePrimaryAttack(): void {
    const wasActive = this.primaryAttackLoadout.isAttackActionActive();
    this.primaryAttackLoadout.tryExecutePrimaryAttack();
    const isActive = this.primaryAttackLoadout.isAttackActionActive();
    if (
      !wasActive &&
      isActive &&
      this.resources &&
      this.primaryAttackHeatCost > 0 &&
      !this.resources.tryConsumeWeaponCost({ heatCost: this.primaryAttackHeatCost })
    ) {
      this.primaryAttackLoadout.cancelActivePrimaryAttack();
    }
  }

  consumePrimaryAttackFinishedEvent(): boolean {
    return this.primaryAttackLoadout.consumePrimaryAttackFinishedEvent();
  }

  resetAttackBurst(): void {
    this.primaryAttackLoadout.cancelActivePrimaryAttack();
  }

  tryTriggerEvadeFromIncomingFire(
    baseChance01: number,
    rearBonusChance01: number,
    range: number,
    cooldownSeconds: number
  ): boolean {
    if (this.evadeCooldownRemaining > 0 || this.incomingFireEvadeRollCooldownRemaining > 0) {
      return false;
    }
    if (!this.shouldEvadeRearThreat(range)) {
      return false;
    }

    let chance = THREE.MathUtils.clamp(baseChance01, 0, 1);
    if (this.isPlayerBehindWithinRadians(THREE.MathUtils.degToRad(45), range)) {
      chance = THREE.MathUtils.clamp(chance + Math.max(0, rearBonusChance01), 0, 1);
    }

    this.incomingFireEvadeRollCooldownRemaining = 0.3;
    if (Math.random() > chance) {
      return false;
    }

    this.evadeCooldownRemaining = Math.max(0, cooldownSeconds);
    return true;
  }

  shouldEvadeRearThreat(maxRange: number): boolean {
    return this.perception.hasIncomingFireThreatWithinRange(this.root.position, maxRange);
  }

  onEnterDeadState(): void {
    this.hurtbox.setEnabled(false);
    this.primaryAttackLoadout.resetAll();
  }

  onAiStateChanged(stateId: EnemyShipAiStateId): void {
    this.aiState = stateId;
    if (stateId === "Patrol") {
      this.resetAttackBurst();
      this.centerPassPatrolPlanner?.ensureInitialized(this.root.position);
    }
    if (stateId === "Search" || stateId === "Flyby" || stateId === "Evade") {
      this.resetAttackBurst();
    }
  }

  getDebugSnapshot(): EnemyCannonShipDebugSnapshot {
    const burstDebug = this.burstWeapon.getDebugSnapshot();
    return {
      state: this.aiState,
      burstCooldownSecondsRemaining: burstDebug.burstCooldownSecondsRemaining,
      burstShotCooldownSecondsRemaining: burstDebug.burstShotCooldownSecondsRemaining,
      burstShotsRemaining: burstDebug.burstShotsRemaining
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.hurtbox.setEnabled(false);

    this.projectileRuntime.dispose();
    this.muzzleSparkBursts.dispose();
    this.shieldBubbleEffect?.dispose();
    this.shieldBubbleEffect = null;
    this.cannonOverheatGlowEffect?.dispose();
    this.cannonOverheatGlowEffect = null;
    this.cannonOverheatSteamEffect?.dispose();
    this.cannonOverheatSteamEffect = null;
    this.thrusterEffect?.dispose();
    this.thrusterEffect = null;

    disposeObject3DMeshResources(this.root);
    this.root.removeFromParent();

    this.ownedProjectileFactory?.dispose?.();
  }

  private spawnLaserBurstShot(): boolean {
    const muzzles = this.muzzleRig.muzzles;
    if (muzzles.length <= 0) {
      return false;
    }

    const muzzle = muzzles[this.nextBurstMuzzleIndex % muzzles.length];
    this.nextBurstMuzzleIndex = (this.nextBurstMuzzleIndex + 1) % muzzles.length;
    if (
      this.resources &&
      this.primaryShotHeatCost > 0 &&
      !this.resources.tryConsumeWeaponCost({ heatCost: this.primaryShotHeatCost })
    ) {
      return false;
    }

    muzzle.getWorldPosition(this.muzzleWorldPosition);
    // Fire straight out of the cannon orientation instead of snapping toward the target.
    muzzle.getWorldDirection(this.shotDirection);
    this.shotDirection.setY(0);
    if (this.shotDirection.lengthSq() <= 0.000001) {
      this.root.getWorldDirection(this.worldForward);
      this.worldForward.setY(0);
      if (this.worldForward.lengthSq() <= 0.000001) {
        this.worldForward.copy(FORWARD_AXIS);
      } else {
        this.worldForward.normalize();
      }
      this.shotDirection.copy(this.worldForward);
    } else {
      this.shotDirection.normalize();
    }
    if (this.shotInaccuracyRadians > 0) {
      const yawJitter = randomRange(-this.shotInaccuracyRadians, this.shotInaccuracyRadians);
      this.shotDirection.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yawJitter).normalize();
    }

    this.projectileRuntime.spawn(this.muzzleWorldPosition, this.shotDirection);
    this.muzzleSparkBursts.spawnBurst(this.muzzleWorldPosition, this.shotDirection);

    return true;
  }

  private updateAttackTimers(deltaTime: number): void {
    this.primaryAttackLoadout.update(deltaTime);
    this.incomingFireEvadeRollCooldownRemaining = Math.max(
      0,
      this.incomingFireEvadeRollCooldownRemaining - deltaTime
    );
    this.evadeCooldownRemaining = Math.max(0, this.evadeCooldownRemaining - deltaTime);
  }

  private updateThrusterEffect(deltaTime: number): void {
    const movedDistance = this.root.position.distanceTo(this.previousPosition);
    const speed01 =
      deltaTime > 0
        ? THREE.MathUtils.clamp(
            movedDistance / Math.max(0.0001, deltaTime) / this.maxMoveSpeedForThrusters,
            0,
            1
          )
        : 0;

    let baseIntensity = 0;
    switch (this.aiState) {
      case "Spawn":
        baseIntensity = 0.2;
        break;
      case "Patrol":
        baseIntensity = 0.45;
        break;
      case "Engage":
        baseIntensity = 0.95;
        break;
      case "Attack":
        baseIntensity = 0.7;
        break;
      case "Flyby":
        baseIntensity = 0.9;
        break;
      case "Evade":
        baseIntensity = 1;
        break;
      case "Search":
        baseIntensity = 0.6;
        break;
      case "Coast":
        baseIntensity = 0.55;
        break;
      case "Flee":
        baseIntensity = 0.85;
        break;
      case "Dead":
        baseIntensity = 0;
        break;
    }

    this.thrusterEffect?.update(deltaTime, Math.max(baseIntensity, speed01));
    this.previousPosition.copy(this.root.position);
  }

  private moveTowardWorldPosition(
    targetPosition: THREE.Vector3,
    speed: number,
    deltaTime: number,
    stopDistance: number
  ): void {
    this.moveDirection.subVectors(targetPosition, this.root.position).setY(0);
    const distance = this.moveDirection.length();
    if (distance <= 0.000001 || speed <= 0 || deltaTime <= 0) {
      this.flightController.step(deltaTime, {
        desiredHeadingWorld: this.worldForward.set(0, 0, 0),
        desiredForwardSpeed: 0,
        desiredStrafe: 0
      });
      return;
    }

    if (distance <= stopDistance) {
      this.flightController.step(deltaTime, {
        desiredHeadingWorld: this.moveDirection,
        desiredForwardSpeed: 0,
        desiredStrafe: 0
      });
      return;
    }

    this.moveDirection.normalize();
    const maxSafeSpeedThisFrame = Math.max(0, (distance - stopDistance) / Math.max(0.0001, deltaTime));
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.moveDirection,
      desiredForwardSpeed: Math.min(speed, maxSafeSpeedThisFrame),
      desiredStrafe: 0
    });
  }

  private moveAwayFromWorldPosition(
    targetPosition: THREE.Vector3,
    speed: number,
    deltaTime: number
  ): void {
    this.moveDirection.subVectors(this.root.position, targetPosition).setY(0);
    if (this.moveDirection.lengthSq() <= 0.000001) {
      return;
    }
    this.moveDirection.normalize();
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.moveDirection,
      desiredForwardSpeed: speed,
      desiredStrafe: 0
    });
  }

  private coastForward(deltaTime: number, speed: number): void {
    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FORWARD_AXIS);
    } else {
      this.worldForward.normalize();
    }
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.worldForward,
      desiredForwardSpeed: speed,
      desiredStrafe: 0
    });
  }

  private moveAlongDirection(direction: THREE.Vector3, speed: number, deltaTime: number): void {
    if (speed <= 0 || deltaTime <= 0 || direction.lengthSq() <= 0.000001) {
      this.flightController.step(deltaTime, {
        desiredHeadingWorld: this.worldForward.set(0, 0, 0),
        desiredForwardSpeed: 0,
        desiredStrafe: 0
      });
      return;
    }
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: direction,
      desiredForwardSpeed: speed,
      desiredStrafe: 0
    });
  }

  private isPlayerBehindWithinRadians(halfAngleRadians: number, range: number): boolean {
    this.root.getWorldDirection(this.worldForward);
    return this.perception.isTargetBehindWithinRadians(
      this.root.position,
      this.worldForward,
      halfAngleRadians,
      range
    );
  }

  private isNearPoint2D(target: THREE.Vector3, threshold: number): boolean {
    const dx = this.root.position.x - target.x;
    const dz = this.root.position.z - target.z;
    return dx * dx + dz * dz <= threshold * threshold;
  }

  private rebuildThrusterEffect(
    thrusterLocalOffsets: readonly THREE.Vector3[],
    thrusterSizeScales?: readonly number[]
  ): void {
    this.thrusterEffect?.dispose();
    this.thrusterEffect = createPlayerThrusterEffect(this.thrusterEffectAnchor, {
      thrusterLocalOffsets,
      thrusterSizeScales,
      effectScale: 0.72,
      trailLengthScale: 0.85,
      glowOpacityScale: 0.85,
      emitterYawRadians: Math.PI
    });
  }

  private createFallbackBody(): void {
    const hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.46, 1.1, 5, 12),
      new THREE.MeshStandardMaterial({
        color: 0x4b5566,
        roughness: 0.68,
        metalness: 0.28
      })
    );
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 0.82;
    this.root.add(hull);

    const wingGeometry = new THREE.BoxGeometry(1.55, 0.1, 0.5);
    const wingMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c3340,
      roughness: 0.72,
      metalness: 0.2
    });
    const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
    leftWing.position.set(-0.92, 0.78, 0.15);
    this.root.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeometry, wingMaterial.clone());
    rightWing.position.set(0.92, 0.78, 0.15);
    this.root.add(rightWing);
  }

  private loadOptionalModel(
    modelUrl: string,
    modelYawOffset: number,
    desiredSize: number,
    modelHeightOffset: number
  ): void {
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = modelYawOffset;
        normalizeModelToSize(model, desiredSize);
        alignModelToGroundCentered(model);
        model.position.y += modelHeightOffset;
        this.root.add(model);

        const thrusterSocketOffsets = extractSocketLocalOffsets(this.root, model, THRUSTER_SOCKET_PREFIX);
        if (thrusterSocketOffsets.length > 0) {
          const thrusterSocketSizeScales = extractSocketSizeScales(model, THRUSTER_SOCKET_PREFIX);
          this.rebuildThrusterEffect(thrusterSocketOffsets, thrusterSocketSizeScales);
        }

        const cannonSocketOffsets = extractSocketLocalOffsets(this.root, model, CANNON_SOCKET_PREFIX);
        if (cannonSocketOffsets.length > 0) {
          this.muzzleRig.setMuzzleOffsets(cannonSocketOffsets);
        }

        const outlineShell = createSilhouetteOutlineShell(model, {
          colorHex: ENEMY_OUTLINE_COLOR_HEX,
          opacity: 0.16,
          scaleMultiplier: 1.04
        });
        if (outlineShell) {
          this.root.add(outlineShell);
        }
      },
      undefined,
      (error) => {
        console.warn("Enemy cannon ship model failed to load. Using fallback body.", error);
      }
    );
  }

}
