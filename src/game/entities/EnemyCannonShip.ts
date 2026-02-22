import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createHealthComponent,
  type HealthConfig,
  type HealthSnapshot
} from "../components/HealthComponent";
import { resolveHitboxAgainstHurtboxes } from "../components/combat/HitboxHurtboxCollision";
import { createHurtboxComponent, type HurtboxComponent } from "../components/combat/HurtboxComponent";
import {
  createLaserBoltFactory,
  type LaserBoltFactoryOptions
} from "../controllers/projectiles/LaserBoltFactory";
import { createPlayerThrusterEffect } from "../effects/PlayerThrusterEffect";
import { createShipGunSparkBurstSystem } from "../effects/ShipGunSparkBurstSystem";
import type {
  ProjectileFactory,
  ProjectileInstance
} from "../controllers/projectiles/ProjectileTypes";
import type { EnemyShipAiStateId } from "../enemies/ai/EnemyShipAiTypes";
import { EnemyShipFlightController } from "../enemies/flight/EnemyShipFlightController";

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
  private readonly projectileRoot = new THREE.Group();
  private readonly targetHurtboxes: readonly HurtboxComponent[];
  private readonly projectileFactory: ProjectileFactory;
  private readonly ownedProjectileFactory: ProjectileFactory | null;
  private readonly projectiles: ProjectileInstance[] = [];
  private readonly muzzleSparkBursts: ReturnType<typeof createShipGunSparkBurstSystem>;
  private readonly flightController: EnemyShipFlightController;
  private readonly muzzles: THREE.Object3D[] = [];
  private readonly muzzleChargeInnerMeshes: THREE.Mesh[] = [];
  private readonly muzzleChargeOuterMeshes: THREE.Mesh[] = [];
  private readonly thrusterEffectAnchor = new THREE.Group();
  private thrusterEffect: ReturnType<typeof createPlayerThrusterEffect> | null = null;

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
  private readonly burstShotCount: number;
  private readonly burstTelegraphSeconds: number;
  private readonly burstShotIntervalSeconds: number;
  private readonly burstCooldownSeconds: number;
  private readonly maxMoveSpeedForThrusters: number;

  private readonly targetWorld = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();
  private readonly strafeDirection = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly muzzleWorldPosition = new THREE.Vector3();
  private readonly worldForward = new THREE.Vector3();
  private readonly visionForward = new THREE.Vector3();
  private readonly muzzleChargeInnerBaseColor = new THREE.Color(ENEMY_LASERBOLT_EMISSIVE_COLOR_HEX);
  private readonly muzzleChargeInnerPeakColor = new THREE.Color(ENEMY_LASERBOLT_BODY_COLOR_HEX);
  private readonly aimTargetWorld = new THREE.Vector3();
  private readonly previousTargetWorld = new THREE.Vector3();
  private readonly targetVelocityWorld = new THREE.Vector3();
  private readonly lastKnownTargetWorld = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly patrolDesiredPosition = new THREE.Vector3();
  private readonly patrolCenterPassPoint = new THREE.Vector3();
  private readonly patrolEdgePoint = new THREE.Vector3();
  private readonly flybyTargetPoint = new THREE.Vector3();

  private playerTarget: THREE.Object3D | null;
  private aiState: EnemyShipAiStateId = "Spawn";
  private patrolOrbitAngle = Math.random() * Math.PI * 2;
  private attackBurstShotsRemaining = 0;
  private nextBurstMuzzleIndex = 0;
  private attackBurstTelegraphSecondsRemaining = 0;
  private attackBurstTelegraphQueued = false;
  private attackBurstShotCooldownRemaining = 0;
  private attackBurstCooldownRemaining = 0;
  private burstFinishedEventPending = false;
  private generalAttackCooldownRemaining = 0;
  private readonly generalAttackCooldownSeconds = 0.8;
  private hasPreviousTargetWorld = false;
  private hasLastKnownTargetWorld = false;
  private playerPrimaryFireThreatSecondsRemaining = 0;
  private incomingFireEvadeRollCooldownRemaining = 0;
  private repositionTimeRemaining = 0;
  private flybyTimeRemaining = 0;
  private flybyPhase: "approach" | "turnback" = "approach";
  private evadeTimeRemaining = 0;
  private evadeStrafeSign: 1 | -1 = 1;
  private evadeStrafeSwitchesRemaining = 0;
  private evadeStrafeSwitchTimer = 0;
  private evadeCooldownRemaining = 0;
  private patrolRoutePhase: "to_center_pass" | "to_edge" | "edge_traverse" = "to_center_pass";
  private patrolRouteInitialized = false;
  private patrolEdgeTraverseTargetAngle = 0;
  private patrolEdgeTraverseDirection: 1 | -1 = 1;
  private patrolEdgeCurrentAngle = 0;
  private muzzleChargePulseSeconds = 0;
  private disposed = false;

  constructor(config: EnemyCannonShipConfig, scene: THREE.Scene) {
    this.scene = scene;
    this.health = createHealthComponent(config.health);
    this.targetHurtboxes = config.targetHurtboxes ?? [];
    this.playerTarget = config.playerTarget ?? null;
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
    this.burstShotCount = Math.max(1, Math.floor(config.burstShotCount ?? 3));
    this.burstTelegraphSeconds = Math.max(0, config.burstTelegraphSeconds ?? 0.42);
    this.burstShotIntervalSeconds = Math.max(0.03, config.burstShotIntervalSeconds ?? 0.15);
    this.burstCooldownSeconds = Math.max(0, config.burstCooldownSeconds ?? 1.75);
    this.maxMoveSpeedForThrusters = Math.max(
      0.001,
      this.patrolSpeed,
      this.chaseSpeed,
      this.attackStrafeSpeed
    );

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
    this.initializePatrolEdgeAngle();

    this.projectileRoot.name = "enemy-cannon-ship-projectiles";
    this.scene.add(this.projectileRoot);
    this.muzzleSparkBursts = createShipGunSparkBurstSystem(this.scene, {
      sparkCountPerBurst: ENEMY_CANNON_MUZZLE_SPARK_COUNT,
      burstLifetimeSeconds: ENEMY_CANNON_MUZZLE_BURST_LIFETIME_SECONDS,
      speedMin: ENEMY_CANNON_MUZZLE_SPEED_MIN,
      speedMax: ENEMY_CANNON_MUZZLE_SPEED_MAX,
      spreadRadians: ENEMY_CANNON_MUZZLE_SPREAD_RADIANS
    });

    this.root.add(this.thrusterEffectAnchor);
    this.rebuildThrusterEffect(DEFAULT_THRUSTER_LOCAL_OFFSETS);

    this.createMuzzles(config.muzzleLocalOffsets ?? DEFAULT_MUZZLE_LOCAL_OFFSETS);
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
      owner: this.root
    });
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }

    this.updateProjectiles(deltaTime);
    this.muzzleSparkBursts.update(deltaTime);
    this.health.update(deltaTime);
    this.updateTargetTracking(deltaTime);
    this.updateAttackTimers(deltaTime);
    this.playerPrimaryFireThreatSecondsRemaining = Math.max(
      0,
      this.playerPrimaryFireThreatSecondsRemaining - deltaTime
    );
    this.updateMuzzleChargeEffect();
    this.updateThrusterEffect(deltaTime);
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.playerTarget = target;
    if (!target) {
      this.hasPreviousTargetWorld = false;
      this.targetVelocityWorld.set(0, 0, 0);
    }
  }

  setPlayerPrimaryFireActive(isActive: boolean): void {
    if (isActive) {
      this.playerPrimaryFireThreatSecondsRemaining = 0.18;
    }
  }

  isDestroyed(): boolean {
    return this.health.getSnapshot().destroyed;
  }

  getHealthSnapshot(): HealthSnapshot {
    return this.health.getSnapshot();
  }

  getTargetDistance(): number | null {
    if (!this.playerTarget) {
      return null;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    const distance = this.toTarget.length();
    return distance <= 0.000001 ? 0 : distance;
  }

  hasPassiveSensorContact(maxRange: number): boolean {
    const distance = this.getTargetDistance();
    if (distance === null) {
      return false;
    }
    const hasContact = distance <= Math.max(0, maxRange);
    if (hasContact) {
      this.lastKnownTargetWorld.copy(this.targetWorld);
      this.hasLastKnownTargetWorld = true;
    }
    return hasContact;
  }

  copyLastKnownTargetPosition(out: THREE.Vector3): boolean {
    if (!this.hasLastKnownTargetWorld) {
      return false;
    }
    out.copy(this.lastKnownTargetWorld);
    return true;
  }

  hasAimVisionContact(maxRange: number, fovRadians: number): boolean {
    if (!this.playerTarget) {
      return false;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    const distance = this.toTarget.length();
    if (distance > Math.max(0, maxRange)) {
      return false;
    }
    if (distance <= 0.000001) {
      return true;
    }

    this.toTarget.multiplyScalar(1 / distance);
    this.root.getWorldDirection(this.visionForward);
    this.visionForward.setY(0);
    if (this.visionForward.lengthSq() <= 0.000001) {
      this.visionForward.copy(FORWARD_AXIS);
    } else {
      this.visionForward.normalize();
    }

    const halfFov = THREE.MathUtils.clamp(fovRadians * 0.5, 0, Math.PI * 0.5);
    const minDot = Math.cos(halfFov);
    return this.visionForward.dot(this.toTarget) >= minDot;
  }

  faceTarget(deltaTime: number): boolean {
    if (!this.playerTarget) {
      return false;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.predictAimTarget(this.root.position, this.targetWorld, this.aimTargetWorld);
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
      this.updateCenterPassEdgePatrol(deltaTime);
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

  updateChaseMovement(deltaTime: number): void {
    this.moveTowardWorldPosition(this.targetWorld, this.chaseSpeed, deltaTime, this.preferredAttackDistance);
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

  updateRepositionMovement(deltaTime: number, distanceToTarget: number): void {
    this.updateEngageMovement(deltaTime);
  }

  beginFlybyManeuver(): void {
    if (!this.playerTarget) {
      this.flybyTimeRemaining = 0;
      return;
    }
    this.playerTarget.getWorldPosition(this.targetWorld);
    this.lastKnownTargetWorld.copy(this.targetWorld);
    this.hasLastKnownTargetWorld = true;

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

    this.flybyPhase = "approach";
    this.flybyTimeRemaining = 2.8;
  }

  updateFlybyMovement(deltaTime: number): void {
    if (this.flybyTimeRemaining <= 0) {
      return;
    }

    this.flybyTimeRemaining = Math.max(0, this.flybyTimeRemaining - deltaTime);

    if (this.flybyPhase === "approach") {
      this.moveTowardWorldPosition(this.flybyTargetPoint, this.chaseSpeed * 1.5, deltaTime, 1.6);
      if (this.isNearPoint2D(this.flybyTargetPoint, 2.2) || this.flybyTimeRemaining <= 1.0) {
        this.flybyPhase = "turnback";
      }
      return;
    }

    // Bank back toward another approach line; Engage state will pick the next action.
    if (this.playerTarget) {
      this.playerTarget.getWorldPosition(this.targetWorld);
      this.moveTowardWorldPosition(
        this.targetWorld,
        this.chaseSpeed * 1.15,
        deltaTime,
        this.preferredAttackDistance + 5
      );
    }
  }

  isFlybyManeuverComplete(): boolean {
    return this.flybyTimeRemaining <= 0;
  }

  updateSearchMovement(deltaTime: number, searchTarget: THREE.Vector3): boolean {
    this.moveTowardWorldPosition(searchTarget, this.patrolSpeed * 0.95, deltaTime, 1.4);
    return this.isNearPoint2D(searchTarget, 1.8);
  }

  updateEvadeMovement(deltaTime: number): void {
    if (!this.playerTarget) {
      return;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    if (this.toTarget.lengthSq() <= 0.000001) {
      return;
    }
    this.toTarget.normalize();

    if (this.evadeStrafeSwitchTimer > 0) {
      this.evadeStrafeSwitchTimer = Math.max(0, this.evadeStrafeSwitchTimer - deltaTime);
    } else if (this.evadeStrafeSwitchesRemaining > 0) {
      this.evadeStrafeSign *= -1;
      this.evadeStrafeSwitchesRemaining -= 1;
      this.evadeStrafeSwitchTimer = randomRange(0.35, 0.95);
    }

    this.moveDirection.copy(this.toTarget).multiplyScalar(-1);
    const escapeHeading = this.moveDirection.lengthSq() > 0.000001 ? this.moveDirection : this.toTarget;
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: escapeHeading,
      desiredForwardSpeed: this.chaseSpeed * 1.05,
      desiredStrafe: this.evadeStrafeSign
    });
  }

  canStartLaserBurstAttack(): boolean {
    return (
      this.generalAttackCooldownRemaining <= 0 &&
      this.attackBurstCooldownRemaining <= 0 &&
      !this.attackBurstTelegraphQueued &&
      this.attackBurstShotsRemaining <= 0
    );
  }

  isAttackActionActive(): boolean {
    return this.attackBurstTelegraphQueued || this.attackBurstShotsRemaining > 0;
  }

  tryFireBurstAttack(): void {
    if (
      this.attackBurstShotsRemaining <= 0 &&
      !this.attackBurstTelegraphQueued &&
      this.attackBurstCooldownRemaining <= 0 &&
      this.generalAttackCooldownRemaining <= 0
    ) {
      this.attackBurstTelegraphQueued = true;
      this.attackBurstTelegraphSecondsRemaining = this.burstTelegraphSeconds;
      if (this.burstTelegraphSeconds <= 0) {
        this.attackBurstTelegraphSecondsRemaining = 0;
      }
      return;
    }

    if (this.attackBurstTelegraphQueued) {
      if (this.attackBurstTelegraphSecondsRemaining > 0) {
        return;
      }
      this.attackBurstTelegraphQueued = false;
      this.attackBurstShotsRemaining = this.burstShotCount;
      this.attackBurstShotCooldownRemaining = 0;
    }

    if (this.attackBurstShotsRemaining <= 0 || this.attackBurstShotCooldownRemaining > 0) {
      return;
    }

    const didFire = this.spawnLaserBurstShot();
    if (!didFire) {
      return;
    }

    this.attackBurstShotsRemaining -= 1;
    if (this.attackBurstShotsRemaining > 0) {
      this.attackBurstShotCooldownRemaining = this.burstShotIntervalSeconds;
      return;
    }

    this.attackBurstCooldownRemaining = this.burstCooldownSeconds;
    this.generalAttackCooldownRemaining = this.generalAttackCooldownSeconds;
    this.attackBurstShotCooldownRemaining = 0;
    this.burstFinishedEventPending = true;
  }

  consumeBurstFinishedEvent(): boolean {
    if (!this.burstFinishedEventPending) {
      return false;
    }
    this.burstFinishedEventPending = false;
    return true;
  }

  resetAttackBurst(): void {
    this.attackBurstShotsRemaining = 0;
    this.attackBurstTelegraphSecondsRemaining = 0;
    this.attackBurstTelegraphQueued = false;
    this.attackBurstShotCooldownRemaining = 0;
    this.burstFinishedEventPending = false;
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
    if (!this.playerTarget || this.playerPrimaryFireThreatSecondsRemaining <= 0) {
      return false;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    const distance = this.toTarget.length();
    if (distance <= 0.000001 || distance > Math.max(0, maxRange)) {
      return false;
    }
    this.toTarget.multiplyScalar(1 / distance);

    return true;
  }

  beginRepositionManeuver(): void {
    this.repositionTimeRemaining = randomRange(0.8, 1.4);
  }

  isRepositionManeuverComplete(): boolean {
    return this.repositionTimeRemaining <= 0;
  }

  beginEvadeManeuver(): void {
    this.evadeTimeRemaining = 3;
    this.evadeStrafeSign = Math.random() < 0.5 ? -1 : 1;
    this.evadeStrafeSwitchesRemaining = Math.floor(randomRange(1, 4));
    this.evadeStrafeSwitchTimer = randomRange(0.25, 0.8);
    this.resetAttackBurst();
  }

  isEvadeManeuverComplete(): boolean {
    return this.evadeTimeRemaining <= 0;
  }

  onEnterDeadState(): void {
    this.hurtbox.setEnabled(false);
    this.attackBurstShotsRemaining = 0;
    this.attackBurstTelegraphSecondsRemaining = 0;
    this.attackBurstTelegraphQueued = false;
    this.attackBurstShotCooldownRemaining = 0;
    this.attackBurstCooldownRemaining = 0;
    this.burstFinishedEventPending = false;
  }

  onAiStateChanged(stateId: EnemyShipAiStateId): void {
    this.aiState = stateId;
    if (stateId === "Patrol") {
      this.resetAttackBurst();
      if (this.patrolPattern === "center_pass_edge" && !this.patrolRouteInitialized) {
        this.buildNextCenterPassPatrolRoute();
      }
    }
    if (stateId === "Search" || stateId === "Flyby" || stateId === "Evade") {
      this.resetAttackBurst();
    }
  }

  getDebugSnapshot(): EnemyCannonShipDebugSnapshot {
    return {
      state: this.aiState,
      burstCooldownSecondsRemaining: this.attackBurstCooldownRemaining,
      burstShotCooldownSecondsRemaining: this.attackBurstShotCooldownRemaining,
      burstShotsRemaining: this.attackBurstShotsRemaining
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.hurtbox.setEnabled(false);

    for (const projectile of this.projectiles) {
      projectile.object.removeFromParent();
      projectile.dispose?.();
    }
    this.projectiles.length = 0;

    this.projectileRoot.clear();
    this.projectileRoot.removeFromParent();
    this.muzzleSparkBursts.dispose();
    this.thrusterEffect?.dispose();
    this.thrusterEffect = null;

    this.root.traverse((node) => {
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
    this.root.removeFromParent();

    this.ownedProjectileFactory?.dispose?.();
  }

  private spawnLaserBurstShot(): boolean {
    if (this.muzzles.length <= 0) {
      return false;
    }

    const muzzle = this.muzzles[this.nextBurstMuzzleIndex % this.muzzles.length];
    this.nextBurstMuzzleIndex = (this.nextBurstMuzzleIndex + 1) % this.muzzles.length;

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

    const projectile = this.projectileFactory.spawn({
      direction: this.shotDirection,
      origin: this.muzzleWorldPosition
    });
    projectile.object.removeFromParent();
    this.projectileRoot.add(projectile.object);
    this.projectiles.push(projectile);
    this.muzzleSparkBursts.spawnBurst(this.muzzleWorldPosition, this.shotDirection);

    return true;
  }

  private updateProjectiles(deltaTime: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      const collision = resolveHitboxAgainstHurtboxes(projectile.hitbox, this.targetHurtboxes);
      if (collision) {
        projectile.object.removeFromParent();
        projectile.dispose?.();
        this.projectiles.splice(i, 1);
        continue;
      }

      if (projectile.update(deltaTime)) {
        continue;
      }

      projectile.object.removeFromParent();
      projectile.dispose?.();
      this.projectiles.splice(i, 1);
    }
  }

  private updateAttackTimers(deltaTime: number): void {
    this.attackBurstTelegraphSecondsRemaining = Math.max(
      0,
      this.attackBurstTelegraphSecondsRemaining - deltaTime
    );
    this.attackBurstShotCooldownRemaining = Math.max(
      0,
      this.attackBurstShotCooldownRemaining - deltaTime
    );
    this.attackBurstCooldownRemaining = Math.max(0, this.attackBurstCooldownRemaining - deltaTime);
    this.generalAttackCooldownRemaining = Math.max(0, this.generalAttackCooldownRemaining - deltaTime);
    this.incomingFireEvadeRollCooldownRemaining = Math.max(
      0,
      this.incomingFireEvadeRollCooldownRemaining - deltaTime
    );
    this.evadeCooldownRemaining = Math.max(0, this.evadeCooldownRemaining - deltaTime);
    this.repositionTimeRemaining = Math.max(0, this.repositionTimeRemaining - deltaTime);
    this.evadeTimeRemaining = Math.max(0, this.evadeTimeRemaining - deltaTime);
    this.muzzleChargePulseSeconds += deltaTime;
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

  private updateTargetTracking(deltaTime: number): void {
    if (!this.playerTarget) {
      this.hasPreviousTargetWorld = false;
      this.targetVelocityWorld.set(0, 0, 0);
      return;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    if (!this.hasPreviousTargetWorld || deltaTime <= 0) {
      this.previousTargetWorld.copy(this.targetWorld);
      this.targetVelocityWorld.set(0, 0, 0);
      this.hasPreviousTargetWorld = true;
      return;
    }

    this.targetVelocityWorld
      .subVectors(this.targetWorld, this.previousTargetWorld)
      .multiplyScalar(1 / deltaTime)
      .setY(0);
    this.previousTargetWorld.copy(this.targetWorld);
  }

  private isPlayerBehindWithinRadians(halfAngleRadians: number, range: number): boolean {
    if (!this.playerTarget) {
      return false;
    }
    this.playerTarget.getWorldPosition(this.targetWorld);
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    const distance = this.toTarget.length();
    if (distance <= 0.000001 || distance > Math.max(0, range)) {
      return false;
    }
    this.toTarget.multiplyScalar(1 / distance);

    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FORWARD_AXIS);
    } else {
      this.worldForward.normalize();
    }

    const rearDirectionDot = this.worldForward.dot(this.toTarget);
    const rearThreshold = -Math.cos(THREE.MathUtils.clamp(halfAngleRadians, 0, Math.PI * 0.5));
    return rearDirectionDot <= rearThreshold;
  }

  private predictAimTarget(
    origin: THREE.Vector3,
    targetPosition: THREE.Vector3,
    out: THREE.Vector3
  ): THREE.Vector3 {
    const distance = origin.distanceTo(targetPosition);
    const travelTimeSeconds = THREE.MathUtils.clamp(
      distance / Math.max(0.001, this.projectileSpeedForLead),
      0,
      1.75
    );
    return out
      .copy(targetPosition)
      .addScaledVector(this.targetVelocityWorld, travelTimeSeconds * this.aimLeadFactor);
  }

  private updateCenterPassEdgePatrol(deltaTime: number): void {
    if (deltaTime <= 0 || this.patrolSpeed <= 0) {
      return;
    }

    if (!this.patrolRouteInitialized) {
      this.buildNextCenterPassPatrolRoute();
    }

    switch (this.patrolRoutePhase) {
      case "to_center_pass": {
        this.moveTowardWorldPosition(this.patrolCenterPassPoint, this.patrolSpeed, deltaTime, 1.2);
        if (this.isNearPoint2D(this.patrolCenterPassPoint, 1.6)) {
          this.patrolRoutePhase = "to_edge";
        }
        break;
      }
      case "to_edge": {
        this.moveTowardWorldPosition(this.patrolEdgePoint, this.patrolSpeed, deltaTime, 1.2);
        if (this.isNearPoint2D(this.patrolEdgePoint, 1.6)) {
          this.patrolRoutePhase = "edge_traverse";
        }
        break;
      }
      case "edge_traverse": {
        this.updateEdgeTraverse(deltaTime);
        if (this.hasReachedTargetEdgeAngle()) {
          this.buildNextCenterPassPatrolRoute();
        }
        break;
      }
    }
  }

  private buildNextCenterPassPatrolRoute(): void {
    this.patrolRouteInitialized = true;
    this.patrolRoutePhase = "to_center_pass";

    const startAngle = this.resolveCurrentEdgeAngle();
    this.patrolEdgeCurrentAngle = startAngle;

    const oppositeAngle = startAngle + Math.PI + randomRange(-0.45, 0.45);
    this.patrolEdgePoint.set(
      this.patrolCenter.x + Math.sin(oppositeAngle) * this.patrolEdgeRadius,
      this.root.position.y,
      this.patrolCenter.z + Math.cos(oppositeAngle) * this.patrolEdgeRadius
    );

    const passAngle = oppositeAngle + randomRange(-1.2, 1.2);
    const passOffset = randomRange(this.patrolCenterPassOffsetMin, this.patrolCenterPassOffsetMax);
    this.patrolCenterPassPoint.set(
      this.patrolCenter.x + Math.sin(passAngle) * passOffset,
      this.root.position.y,
      this.patrolCenter.z + Math.cos(passAngle) * passOffset
    );

    this.patrolEdgeCurrentAngle = normalizeAngle(oppositeAngle);
    this.patrolEdgeTraverseDirection = Math.random() < 0.5 ? -1 : 1;
    const edgeArcTravel = randomRange(0.55, 1.35);
    this.patrolEdgeTraverseTargetAngle = normalizeAngle(
      this.patrolEdgeCurrentAngle + edgeArcTravel * this.patrolEdgeTraverseDirection
    );
  }

  private updateEdgeTraverse(deltaTime: number): void {
    const angularSpeed = this.patrolSpeed / Math.max(0.001, this.patrolEdgeRadius);
    const remainingDelta = shortestAngleDelta(
      this.patrolEdgeCurrentAngle,
      this.patrolEdgeTraverseTargetAngle
    );

    const desiredDirection: 1 | -1 = remainingDelta >= 0 ? 1 : -1;
    this.patrolEdgeTraverseDirection = desiredDirection;
    const maxStep = angularSpeed * deltaTime;
    const step = THREE.MathUtils.clamp(
      remainingDelta,
      -maxStep,
      maxStep
    );
    this.patrolEdgeCurrentAngle = normalizeAngle(this.patrolEdgeCurrentAngle + step);

    this.patrolDesiredPosition.set(
      this.patrolCenter.x + Math.sin(this.patrolEdgeCurrentAngle) * this.patrolEdgeRadius,
      this.root.position.y,
      this.patrolCenter.z + Math.cos(this.patrolEdgeCurrentAngle) * this.patrolEdgeRadius
    );
    this.moveTowardWorldPosition(this.patrolDesiredPosition, this.patrolSpeed, deltaTime, 0);
  }

  private hasReachedTargetEdgeAngle(): boolean {
    return Math.abs(shortestAngleDelta(this.patrolEdgeCurrentAngle, this.patrolEdgeTraverseTargetAngle)) <= 0.05;
  }

  private resolveCurrentEdgeAngle(): number {
    this.toTarget.set(
      this.root.position.x - this.patrolCenter.x,
      0,
      this.root.position.z - this.patrolCenter.z
    );
    if (this.toTarget.lengthSq() <= 0.000001) {
      return this.patrolEdgeCurrentAngle;
    }
    return normalizeAngle(Math.atan2(this.toTarget.x, this.toTarget.z));
  }

  private initializePatrolEdgeAngle(): void {
    this.patrolEdgeCurrentAngle = this.resolveCurrentEdgeAngle();
    if (!Number.isFinite(this.patrolEdgeCurrentAngle)) {
      this.patrolEdgeCurrentAngle = Math.random() * Math.PI * 2;
    }
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

  private createMuzzles(localOffsets: readonly THREE.Vector3[]): void {
    for (const offset of localOffsets) {
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(offset);
      this.root.add(muzzle);
      this.muzzles.push(muzzle);
      const chargeMeshes = this.createMuzzleChargeMeshes(muzzle);
      this.muzzleChargeInnerMeshes.push(chargeMeshes.inner);
      this.muzzleChargeOuterMeshes.push(chargeMeshes.outer);
    }
  }

  private createMuzzleChargeMeshes(parent: THREE.Object3D): {
    inner: THREE.Mesh;
    outer: THREE.Mesh;
  } {
    const outer = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 10, 10),
      new THREE.MeshBasicMaterial({
        color: ENEMY_LASERBOLT_BODY_COLOR_HEX,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    outer.visible = false;
    outer.position.z = 0.03;
    parent.add(outer);

    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 10),
      new THREE.MeshBasicMaterial({
        color: ENEMY_LASERBOLT_EMISSIVE_COLOR_HEX,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    inner.visible = false;
    inner.position.z = 0.045;
    parent.add(inner);

    return { inner, outer };
  }

  private updateMuzzleChargeEffect(): void {
    const shouldShowCharge =
      this.aiState === "Attack" && this.attackBurstTelegraphQueued && this.attackBurstTelegraphSecondsRemaining > 0;
    if (!shouldShowCharge) {
      for (const chargeMesh of this.muzzleChargeInnerMeshes) {
        hideChargeMesh(chargeMesh);
      }
      for (const chargeMesh of this.muzzleChargeOuterMeshes) {
        hideChargeMesh(chargeMesh);
      }
      return;
    }

    const duration = Math.max(0.001, this.burstTelegraphSeconds);
    const progress = THREE.MathUtils.clamp(
      1 - this.attackBurstTelegraphSecondsRemaining / duration,
      0,
      1
    );
    const easedProgress = progress * progress * (3 - 2 * progress);
    const pulse = 0.88 + Math.sin(this.muzzleChargePulseSeconds * 20) * 0.12;
    const flare = 0.8 + Math.sin(this.muzzleChargePulseSeconds * 34 + 0.65) * 0.2;
    const outerOpacity =
      THREE.MathUtils.clamp(0.025 + easedProgress * 0.13, 0, 0.18) * pulse;
    const innerOpacity =
      THREE.MathUtils.clamp(0.16 + easedProgress * 0.9, 0, 1) * flare;
    const outerScale = 0.48 + easedProgress * 1.95;
    const innerScale = 0.34 + easedProgress * 0.96;
    const innerColorLerp = THREE.MathUtils.clamp(easedProgress * 0.65, 0, 1);

    for (const chargeMesh of this.muzzleChargeOuterMeshes) {
      chargeMesh.visible = true;
      chargeMesh.scale.setScalar(outerScale);
      const material = chargeMesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = outerOpacity;
        material.color.setHex(ENEMY_LASERBOLT_BODY_COLOR_HEX);
      }
    }
    for (const chargeMesh of this.muzzleChargeInnerMeshes) {
      chargeMesh.visible = true;
      chargeMesh.scale.setScalar(innerScale);
      const material = chargeMesh.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.opacity = innerOpacity;
        material.color.lerpColors(
          this.muzzleChargeInnerBaseColor,
          this.muzzleChargeInnerPeakColor,
          innerColorLerp
        );
      }
    }
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
        normalizeModel(model, desiredSize);
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
          this.applySocketOffsetsToMuzzles(cannonSocketOffsets);
        }
      },
      undefined,
      (error) => {
        console.warn("Enemy cannon ship model failed to load. Using fallback body.", error);
      }
    );
  }

  private applySocketOffsetsToMuzzles(socketOffsets: readonly THREE.Vector3[]): void {
    const count = Math.min(this.muzzles.length, socketOffsets.length);
    for (let i = 0; i < count; i += 1) {
      this.muzzles[i].position.copy(socketOffsets[i]);
    }
  }
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}

function normalizeAngle(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle, Math.PI * 2);
}

function normalizeModel(modelRoot: THREE.Object3D, desiredSize: number): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension <= 0) {
    return;
  }
  modelRoot.scale.setScalar(desiredSize / maxDimension);
}

function alignModelToGroundCentered(modelRoot: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const center = bounds.getCenter(new THREE.Vector3());
  modelRoot.position.x -= center.x;
  modelRoot.position.z -= center.z;
  modelRoot.position.y -= bounds.min.y;
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}

function hideChargeMesh(mesh: THREE.Mesh): void {
  mesh.visible = false;
  mesh.scale.setScalar(0.001);
  const material = mesh.material;
  if (material instanceof THREE.MeshBasicMaterial) {
    material.opacity = 0;
  }
}

function extractSocketLocalOffsets(
  relativeRoot: THREE.Object3D,
  model: THREE.Object3D,
  socketPrefix: string
): THREE.Vector3[] {
  const socketNodes = findSocketNodes(model, socketPrefix);
  const worldPosition = new THREE.Vector3();
  return socketNodes.map((socketNode) => {
    socketNode.getWorldPosition(worldPosition);
    return relativeRoot.worldToLocal(worldPosition.clone());
  });
}

function extractSocketSizeScales(model: THREE.Object3D, socketPrefix: string): number[] {
  const socketNodes = findSocketNodes(model, socketPrefix);
  const modelWorldScale = new THREE.Vector3();
  model.getWorldScale(modelWorldScale);
  const modelAverageScale =
    (Math.abs(modelWorldScale.x) + Math.abs(modelWorldScale.y) + Math.abs(modelWorldScale.z)) / 3;
  const normalizedModelScale = Math.max(0.001, modelAverageScale);
  const worldScale = new THREE.Vector3();
  return socketNodes.map((socketNode) => {
    socketNode.getWorldScale(worldScale);
    const averageScale =
      (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;
    return Math.max(0.5, averageScale / normalizedModelScale);
  });
}

function findSocketNodes(model: THREE.Object3D, socketPrefix: string): THREE.Object3D[] {
  const matched: Array<{ index: number; node: THREE.Object3D }> = [];
  model.traverse((node) => {
    const socketIndex = parseSocketIndex(node.name, socketPrefix);
    if (socketIndex === null) {
      return;
    }
    matched.push({ index: socketIndex, node });
  });

  matched.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return a.node.name.localeCompare(b.node.name);
  });
  return matched.map((entry) => entry.node);
}

function parseSocketIndex(name: string, socketPrefix: string): number | null {
  const compactName = name.replace(/\s+/g, "");
  const escapedPrefix = escapeRegex(socketPrefix.trim());
  const pattern = new RegExp(`^${escapedPrefix}(?:[_-])?(\\d+)(?:\\.\\d+)?$`, "i");
  const match = compactName.match(pattern);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
