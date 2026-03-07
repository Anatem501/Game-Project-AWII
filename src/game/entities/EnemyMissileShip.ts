import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHealthComponent, type HealthConfig } from "../components/HealthComponent";
import {
  createShipResourceComponent,
  type ShipResourceConfig
} from "../components/ShipResourceComponent";
import { createShipStatusComponent } from "../components/ShipStatusComponent";
import { createHurtboxComponent, type HurtboxComponent } from "../components/combat/HurtboxComponent";
import { createCannonOverheatGlowEffect } from "../effects/CannonOverheatGlowEffect";
import { createCannonOverheatSteamEffect } from "../effects/CannonOverheatSteamEffect";
import { createPlayerThrusterEffect } from "../effects/PlayerThrusterEffect";
import { createShieldBubbleEffect } from "../effects/ShieldBubbleEffect";
import { createShipCryoFreezeSurfaceEffect } from "../effects/ShipCryoFreezeSurfaceEffect";
import { createShipElectroshockArcEmitterEffect } from "../effects/ShipElectroshockArcEmitterEffect";
import { createShipElectroshockSurfaceEffect } from "../effects/ShipElectroshockSurfaceEffect";
import type { EnemyShipAiStateId } from "../enemies/ai/EnemyShipAiTypes";
import {
  EnemyCooldownCallbackAttackAction,
  EnemyLockOnCallbackAttackAction
} from "../enemies/combat/EnemyCallbackAttackActions";
import { EnemyProjectileMagazine } from "../enemies/combat/EnemyProjectileMagazine";
import { EnemyPrimaryAttackLoadout } from "../enemies/combat/EnemyPrimaryAttackLoadout";
import { EnemyProjectileRuntime } from "../enemies/combat/EnemyProjectileRuntime";
import {
  createEnemyMissileProjectileFactory,
  type EnemyMissileProjectileFactoryOptions
} from "../enemies/combat/EnemyMissileProjectileFactory";
import { EnemyShipFlightController } from "../enemies/flight/EnemyShipFlightController";
import { CenterPassEdgePatrolPlanner } from "../enemies/patrol/CenterPassEdgePatrolPlanner";
import { EnemyShipPerceptionController } from "../enemies/perception/EnemyShipPerceptionController";
import { shortestAngleDelta } from "../enemies/utils/EnemyShipMath";
import { EnemyShipMuzzleRig } from "../enemies/visuals/EnemyShipMuzzleRig";
import {
  alignModelToGroundCentered,
  createSilhouetteOutlineShell,
  disposeObject3DMeshResources,
  extractMissileCellSocketLocalOffsets,
  extractSocketLocalOffsets,
  extractSocketSizeScales,
  normalizeModelToSize
} from "../enemies/visuals/EnemyShipModelRigUtils";

const THRUSTER_SOCKET_PREFIX = "thruster";
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);
const ENEMY_OUTLINE_COLOR_HEX = 0xff4b4b;
const MAX_MODEL_MISSILE_CELL_SOCKETS = 32;
const HOMING_LOCK_HALF_ANGLE_RADIANS = THREE.MathUtils.degToRad(20);
const SWARM_MISSILES_PER_BAY = 2;
const SWARM_MISSILE_SHOT_INTERVAL_SECONDS = 0.15;
const DEFAULT_THRUSTER_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.34, 0.92, 1.05),
  new THREE.Vector3(0.34, 0.92, 1.05)
];
const DEFAULT_MISSILE_BAY_CELL_OFFSETS: readonly (readonly THREE.Vector3[])[] = [
  [
    new THREE.Vector3(-0.62, 0.88, 0.62),
    new THREE.Vector3(-0.46, 0.88, 0.34),
    new THREE.Vector3(-0.58, 0.88, 0.04),
    new THREE.Vector3(-0.42, 0.88, -0.24)
  ],
  [
    new THREE.Vector3(0.62, 0.88, 0.62),
    new THREE.Vector3(0.46, 0.88, 0.34),
    new THREE.Vector3(0.58, 0.88, 0.04),
    new THREE.Vector3(0.42, 0.88, -0.24)
  ]
];

type MissileCellLauncher = {
  bayIndex: number;
  cellIndex: number;
  object: THREE.Object3D;
};

type PendingSwarmMissileLaunch = {
  launcher: MissileCellLauncher;
  delaySecondsRemaining: number;
  targetWorldPosition: THREE.Vector3;
};

export type EnemyMissileShipConfig = {
  health: HealthConfig;
  position?: THREE.Vector3;
  patrolCenter?: THREE.Vector3;
  patrolPattern?: "center_pass_edge" | "orbit";
  patrolRadius?: number;
  patrolEdgeRadius?: number;
  patrolCenterPassOffsetMin?: number;
  patrolCenterPassOffsetMax?: number;
  patrolSpeed?: number;
  patrolOrbitSpeedRadians?: number;
  attackSpeed?: number;
  fleeSpeed?: number;
  preferredAttackDistance?: number;
  turnSpeedRadians?: number;
  fireArcRadians?: number;
  aimLeadFactor?: number;
  projectileSpeedForLead?: number;
  hurtboxRadius?: number;
  hurtboxLocalOffset?: THREE.Vector3;
  playerTarget?: THREE.Object3D | null;
  targetHurtboxes?: readonly HurtboxComponent[];
  modelUrl?: string;
  modelYawOffset?: number;
  modelDesiredSize?: number;
  modelHeightOffset?: number;
  missileCellsByBayLocalOffsets?: readonly (readonly THREE.Vector3[])[];
  swarmAttackCooldownSeconds?: number;
  homingAttackCooldownSeconds?: number;
  homingLockSeconds?: number;
  generalAttackCooldownSeconds?: number;
  swarmAttackHeatCost?: number;
  homingAttackHeatCost?: number;
  magazineCapacity?: number;
  reloadSeconds?: number;
  resourceConfig?: ShipResourceConfig;
  swarmMissileProjectile?: Partial<EnemyMissileProjectileFactoryOptions>;
  homingMissileProjectile?: Partial<EnemyMissileProjectileFactoryOptions>;
};

export type EnemyMissileShipDebugSnapshot = {
  state: EnemyShipAiStateId;
  lockActive: boolean;
  lockProgress01: number;
  magazineShotsRemaining: number;
  magazineCapacity: number;
  reloadSecondsRemaining: number;
};

export class EnemyMissileShip {
  readonly root: THREE.Group;
  readonly hurtbox: HurtboxComponent;

  private readonly scene: THREE.Scene;
  private readonly health: ReturnType<typeof createHealthComponent>;
  private readonly resources: ReturnType<typeof createShipResourceComponent> | null;
  private readonly status = createShipStatusComponent();
  private readonly targetHurtboxes: readonly HurtboxComponent[];
  private readonly perception: EnemyShipPerceptionController;
  private readonly flightController: EnemyShipFlightController;
  private readonly centerPassPatrolPlanner: CenterPassEdgePatrolPlanner | null;
  private readonly launcherRig: EnemyShipMuzzleRig;
  private readonly primaryAttackLoadout: EnemyPrimaryAttackLoadout;
  private readonly magazine: EnemyProjectileMagazine;
  private readonly swarmProjectileRuntime: EnemyProjectileRuntime;
  private readonly homingProjectileRuntime: EnemyProjectileRuntime;
  private readonly swarmProjectileFactory: ReturnType<typeof createEnemyMissileProjectileFactory>;
  private readonly homingProjectileFactory: ReturnType<typeof createEnemyMissileProjectileFactory>;
  private readonly lockTelegraphGlowEffect: ReturnType<typeof createCannonOverheatGlowEffect>;
  private readonly swarmAttackHeatCost: number;
  private readonly homingAttackHeatCost: number;
  private readonly thrusterEffectAnchor = new THREE.Group();
  private readonly cryoSurfaceEffect: ReturnType<typeof createShipCryoFreezeSurfaceEffect>;
  private readonly electroshockSurfaceEffect: ReturnType<typeof createShipElectroshockSurfaceEffect>;
  private readonly electroshockArcEmitterEffect: ReturnType<typeof createShipElectroshockArcEmitterEffect>;
  private shieldBubbleEffect: ReturnType<typeof createShieldBubbleEffect> | null = null;
  private weaponOverheatSteamEffect: ReturnType<typeof createCannonOverheatSteamEffect> | null = null;
  private thrusterEffect: ReturnType<typeof createPlayerThrusterEffect> | null = null;

  private readonly patrolCenter: THREE.Vector3;
  private readonly patrolPattern: "center_pass_edge" | "orbit";
  private readonly patrolRadius: number;
  private readonly patrolEdgeRadius: number;
  private readonly patrolCenterPassOffsetMin: number;
  private readonly patrolCenterPassOffsetMax: number;
  private readonly patrolSpeed: number;
  private readonly patrolOrbitSpeedRadians: number;
  private readonly attackSpeed: number;
  private readonly fleeSpeed: number;
  private readonly preferredAttackDistance: number;
  private readonly fireArcRadians: number;
  private readonly aimLeadFactor: number;
  private readonly projectileSpeedForLead: number;
  private readonly generalAttackCooldownSeconds: number;
  private readonly maxMoveSpeedForThrusters: number;

  private readonly launchCells: MissileCellLauncher[] = [];
  private readonly launchCellsByBay = new Map<number, MissileCellLauncher[]>();
  private readonly pendingSwarmMissileLaunches: PendingSwarmMissileLaunch[] = [];
  private readonly targetWorld = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly worldForward = new THREE.Vector3();
  private readonly aimTargetWorld = new THREE.Vector3();
  private readonly patrolDesiredPosition = new THREE.Vector3();
  private readonly moveDirection = new THREE.Vector3();
  private readonly shotOrigin = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly previousPosition = new THREE.Vector3();
  private readonly regroupBreakDirection = new THREE.Vector3();
  private readonly frameVelocity = new THREE.Vector3();

  private playerTargetObject: THREE.Object3D | null;
  private aiState: EnemyShipAiStateId = "Spawn";
  private patrolOrbitAngle = Math.random() * Math.PI * 2;
  private incomingFireEvadeRollCooldownRemaining = 0;
  private evadeCooldownRemaining = 0;
  private generalAttackCooldownRemaining = 0;
  private fleeStrafeSign: 1 | -1 = 1;
  private disposed = false;

  constructor(config: EnemyMissileShipConfig, scene: THREE.Scene) {
    this.scene = scene;
    this.health = createHealthComponent(config.health);
    this.resources = config.resourceConfig ? createShipResourceComponent(config.resourceConfig) : null;
    this.targetHurtboxes = config.targetHurtboxes ?? [];
    this.playerTargetObject = config.playerTarget ?? null;
    this.perception = new EnemyShipPerceptionController({
      initialTarget: this.playerTargetObject,
      primaryFireThreatWindowSeconds: 0.18
    });

    this.patrolCenter = (config.patrolCenter ?? config.position ?? new THREE.Vector3()).clone();
    this.patrolPattern = config.patrolPattern ?? "center_pass_edge";
    this.patrolRadius = Math.max(1, config.patrolRadius ?? 10);
    this.patrolEdgeRadius = Math.max(1, config.patrolEdgeRadius ?? this.patrolRadius);
    this.patrolCenterPassOffsetMin = Math.max(0, config.patrolCenterPassOffsetMin ?? 6);
    this.patrolCenterPassOffsetMax = Math.max(this.patrolCenterPassOffsetMin, config.patrolCenterPassOffsetMax ?? 16);
    this.patrolSpeed = Math.max(0, config.patrolSpeed ?? 6.5);
    this.patrolOrbitSpeedRadians = Math.max(0, config.patrolOrbitSpeedRadians ?? 0.45);
    this.attackSpeed = Math.max(0, config.attackSpeed ?? 8);
    this.fleeSpeed = Math.max(this.attackSpeed, config.fleeSpeed ?? 10);
    this.preferredAttackDistance = Math.max(8, config.preferredAttackDistance ?? 28);
    const turnSpeedRadians = Math.max(0.01, config.turnSpeedRadians ?? THREE.MathUtils.degToRad(115));
    this.fireArcRadians = THREE.MathUtils.clamp(config.fireArcRadians ?? THREE.MathUtils.degToRad(16), 0, Math.PI);
    this.aimLeadFactor = THREE.MathUtils.clamp(config.aimLeadFactor ?? 0.85, 0, 1.25);
    this.projectileSpeedForLead = Math.max(0.01, config.projectileSpeedForLead ?? 14);
    this.generalAttackCooldownSeconds = Math.max(0, config.generalAttackCooldownSeconds ?? 0.75);
    this.swarmAttackHeatCost = Math.max(0, config.swarmAttackHeatCost ?? 0);
    this.homingAttackHeatCost = Math.max(0, config.homingAttackHeatCost ?? 0);
    this.maxMoveSpeedForThrusters = Math.max(0.001, this.patrolSpeed, this.attackSpeed, this.fleeSpeed);

    this.centerPassPatrolPlanner = this.patrolPattern === "center_pass_edge"
      ? new CenterPassEdgePatrolPlanner({
          center: this.patrolCenter,
          edgeRadius: this.patrolEdgeRadius,
          centerPassOffsetMin: this.patrolCenterPassOffsetMin,
          centerPassOffsetMax: this.patrolCenterPassOffsetMax
        })
      : null;

    this.root = new THREE.Group();
    this.root.position.copy(config.position ?? new THREE.Vector3());
    this.scene.add(this.root);
    this.root.add(this.thrusterEffectAnchor);
    this.previousPosition.copy(this.root.position);
    this.cryoSurfaceEffect = createShipCryoFreezeSurfaceEffect(this.root);
    this.electroshockSurfaceEffect = createShipElectroshockSurfaceEffect(this.root);
    this.electroshockArcEmitterEffect = createShipElectroshockArcEmitterEffect(this.root);
    this.resources?.setHeatAddedListener((amount) => {
      this.status.applyHeatGain(amount);
    });

    this.flightController = new EnemyShipFlightController({
      root: this.root,
      minForwardSpeed: 1.25,
      maxForwardSpeed: this.fleeSpeed,
      forwardAccel: Math.max(2, this.fleeSpeed * 1.8),
      forwardDecel: Math.max(2, this.fleeSpeed * 1.9),
      maxStrafeSpeed: Math.max(0.5, this.attackSpeed * 0.35),
      strafeAccel: Math.max(2, this.attackSpeed * 1.4),
      strafeDamping: Math.max(2, this.attackSpeed * 2),
      maxBankAngleRadians: THREE.MathUtils.degToRad(14),
      bankInRateRadians: THREE.MathUtils.degToRad(180),
      bankOutRateRadians: THREE.MathUtils.degToRad(160),
      maxTurnRateAtMinSpeed: turnSpeedRadians,
      maxTurnRateAtMaxSpeed: Math.max(THREE.MathUtils.degToRad(25), turnSpeedRadians * 0.45)
    });

    this.rebuildThrusterEffect(DEFAULT_THRUSTER_LOCAL_OFFSETS);

    const bayOffsets = config.missileCellsByBayLocalOffsets ?? DEFAULT_MISSILE_BAY_CELL_OFFSETS;
    this.launcherRig = new EnemyShipMuzzleRig(this.root, {
      localOffsets: flattenBayOffsets(bayOffsets),
      outerColorHex: 0x7bff9d,
      innerBaseColorHex: 0x2dff55,
      innerPeakColorHex: 0xb7ffcc
    });
    this.rebuildLaunchCellMappings(bayOffsets);
    this.lockTelegraphGlowEffect = createCannonOverheatGlowEffect(
      this.root,
      this.launcherRig.muzzles
    );
    if (this.resources) {
      this.weaponOverheatSteamEffect = createCannonOverheatSteamEffect(this.scene, this.launcherRig.muzzles, {
        alignToHardpointDirection: true,
        positionJitterScale: 0.35
      });
    }

    if (config.modelUrl) {
      this.loadOptionalModel(
        config.modelUrl,
        config.modelYawOffset ?? 0,
        config.modelDesiredSize ?? 2.1,
        config.modelHeightOffset ?? 0
      );
    } else {
      this.createFallbackBody();
    }

    this.hurtbox = createHurtboxComponent({
      collisionArea: {
        radius: Math.max(0.25, config.hurtboxRadius ?? 1.55),
        localOffset: config.hurtboxLocalOffset?.clone() ?? new THREE.Vector3(0, 1.05, 0)
      },
      faction: "enemy",
      health: this.health,
      owner: this.root,
      transformIncomingDamagePacket: (damagePacket) =>
        this.status.transformIncomingDamagePacket(damagePacket),
      onHit: (event) => {
        if (event.worldHitPosition) {
          this.electroshockSurfaceEffect.registerImpact(event.worldHitPosition);
        }
        this.resources?.applyIncomingDamageHeat(
          event.damagePacket.damageType,
          event.breakdown.incomingBaseDamage
        );
        this.status.applyHitStatusPayloads(event.damagePacket, event.breakdown);
      }
    });
    if (config.health.maxShield > 0) {
      this.shieldBubbleEffect = createShieldBubbleEffect(this.root);
    }

    this.magazine = new EnemyProjectileMagazine({
      capacity: Math.max(1, Math.floor(config.magazineCapacity ?? 16)),
      reloadSeconds: Math.max(0, config.reloadSeconds ?? 8)
    });

    this.swarmProjectileFactory = createEnemyMissileProjectileFactory({
      flightMode: "spline",
      speed: config.swarmMissileProjectile?.speed ?? 11,
      lifetimeSeconds: config.swarmMissileProjectile?.lifetimeSeconds ?? 4,
      damage: config.swarmMissileProjectile?.damage ?? 12,
      damageType: config.swarmMissileProjectile?.damageType ?? "Concussive",
      collisionRadius: config.swarmMissileProjectile?.collisionRadius ?? 0.3,
      faction: "enemy",
      getTarget: () => this.playerTargetObject,
      splineWildness: config.swarmMissileProjectile?.splineWildness ?? 1.35,
      reticleScatterRadius: config.swarmMissileProjectile?.reticleScatterRadius ?? 2.5,
      fallbackAimDistance: config.swarmMissileProjectile?.fallbackAimDistance ?? 40,
      meshScale: config.swarmMissileProjectile?.meshScale ?? 0.9,
      bodyColor: config.swarmMissileProjectile?.bodyColor ?? 0xbec8cf,
      glowColor: config.swarmMissileProjectile?.glowColor ?? 0x8dffb0,
      modelUrl: config.swarmMissileProjectile?.modelUrl,
      modelDesiredSize: config.swarmMissileProjectile?.modelDesiredSize,
      modelYawOffset: config.swarmMissileProjectile?.modelYawOffset,
      modelLocalOffset: config.swarmMissileProjectile?.modelLocalOffset
    });
    this.homingProjectileFactory = createEnemyMissileProjectileFactory({
      flightMode: "homing",
      speed: config.homingMissileProjectile?.speed ?? 13,
      lifetimeSeconds: config.homingMissileProjectile?.lifetimeSeconds ?? 5.5,
      damage: config.homingMissileProjectile?.damage ?? 20,
      damageType: config.homingMissileProjectile?.damageType ?? "Concussive",
      collisionRadius: config.homingMissileProjectile?.collisionRadius ?? 0.34,
      faction: "enemy",
      homingTurnRateRadians: config.homingMissileProjectile?.homingTurnRateRadians ?? THREE.MathUtils.degToRad(105),
      getTarget: () => this.playerTargetObject,
      meshScale: config.homingMissileProjectile?.meshScale ?? 1,
      bodyColor: config.homingMissileProjectile?.bodyColor ?? 0xcbd2d8,
      glowColor: config.homingMissileProjectile?.glowColor ?? 0xff7b5f,
      modelUrl: config.homingMissileProjectile?.modelUrl,
      modelDesiredSize: config.homingMissileProjectile?.modelDesiredSize,
      modelYawOffset: config.homingMissileProjectile?.modelYawOffset,
      modelLocalOffset: config.homingMissileProjectile?.modelLocalOffset
    });

    this.swarmProjectileRuntime = new EnemyProjectileRuntime({
      scene: this.scene,
      projectileFactory: this.swarmProjectileFactory,
      targetHurtboxes: this.targetHurtboxes,
      rootName: "enemy-missile-ship-swarm-projectiles"
    });
    this.homingProjectileRuntime = new EnemyProjectileRuntime({
      scene: this.scene,
      projectileFactory: this.homingProjectileFactory,
      targetHurtboxes: this.targetHurtboxes,
      rootName: "enemy-missile-ship-homing-projectiles"
    });

    const homingAction = new EnemyLockOnCallbackAttackAction({
      id: "homing_missile",
      lockSeconds: Math.max(0, config.homingLockSeconds ?? 2.5),
      cooldownSeconds: Math.max(0, config.homingAttackCooldownSeconds ?? 7.5),
      canStart: () =>
        this.canStartAttackWithMagazineCost(
          this.getHomingVolleyLauncherCount(),
          this.homingAttackHeatCost
        ) &&
        this.hasForwardHomingLockContact(),
      canMaintainLock: () => this.hasForwardHomingLockContact(),
      progressDecaySeconds: 1.25,
      progressDecayDelaySeconds: 0.5,
      execute: () => this.executeHomingAttack()
    });
    const swarmAction = new EnemyCooldownCallbackAttackAction({
      id: "swarm_missile",
      cooldownSeconds: Math.max(0, config.swarmAttackCooldownSeconds ?? 2.2),
      canStart: () =>
        this.canStartAttackWithMagazineCost(
          this.getSwarmVolleyLauncherCount(),
          this.swarmAttackHeatCost
        ),
      execute: () => this.executeSwarmAttack()
    });
    this.primaryAttackLoadout = new EnemyPrimaryAttackLoadout({
      actions: [homingAction, swarmAction],
      selectionPolicy: "first_ready"
    });
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }
    this.frameVelocity
      .copy(this.root.position)
      .sub(this.previousPosition)
      .multiplyScalar(1 / Math.max(0.0001, deltaTime));
    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FORWARD_AXIS);
    } else {
      this.worldForward.normalize();
    }
    this.status.syncMotionSample(this.worldForward, this.frameVelocity);
    this.status.update(deltaTime);
    this.updatePendingSwarmMissileLaunches(deltaTime);
    if (!this.status.canControlFlight()) {
      const driftVelocity = this.status.getFrozenDriftVelocity(this.frameVelocity);
      if (driftVelocity) {
        this.root.position.addScaledVector(driftVelocity, deltaTime);
      }
    }
    this.swarmProjectileRuntime.update(deltaTime);
    this.homingProjectileRuntime.update(deltaTime);
    this.health.setShieldRechargeRateMultiplier(this.status.getShieldRechargeRateMultiplier());
    this.health.update(deltaTime);
    this.resources?.update(deltaTime);
    this.perception.update(deltaTime);
    this.primaryAttackLoadout.update(deltaTime);
    this.magazine.update(deltaTime);
    this.generalAttackCooldownRemaining = Math.max(0, this.generalAttackCooldownRemaining - deltaTime);
    this.incomingFireEvadeRollCooldownRemaining = Math.max(0, this.incomingFireEvadeRollCooldownRemaining - deltaTime);
    this.evadeCooldownRemaining = Math.max(0, this.evadeCooldownRemaining - deltaTime);
    const healthSnapshot = this.health.getSnapshot();
    this.shieldBubbleEffect?.update(deltaTime, healthSnapshot);
    let weaponHeat01 = 0;
    let overheated = false;
    if (this.resources) {
      const resourceSnapshot = this.resources.getSnapshot();
      weaponHeat01 =
        resourceSnapshot.heat.max > 0
          ? THREE.MathUtils.clamp(resourceSnapshot.heat.current / resourceSnapshot.heat.max, 0, 1)
          : 0;
      overheated = resourceSnapshot.heat.overheated;
      this.root.getWorldDirection(this.worldForward);
      this.worldForward.setY(0);
      if (this.worldForward.lengthSq() <= 0.000001) {
        this.worldForward.copy(FORWARD_AXIS);
      } else {
        this.worldForward.normalize();
      }
      this.weaponOverheatSteamEffect?.update(deltaTime, overheated, this.worldForward);
    }

    const telegraph = this.primaryAttackLoadout.getTelegraphVisualState();
    const lockTelegraphActive = telegraph.active && this.aiState === "Attack";
    const telegraphDuration = Math.max(0.001, telegraph.telegraphDurationSeconds);
    const telegraphHeat01 = lockTelegraphActive
      ? THREE.MathUtils.clamp(1 - telegraph.telegraphSecondsRemaining / telegraphDuration, 0, 1)
      : 0;
    this.lockTelegraphGlowEffect.update(deltaTime, Math.max(telegraphHeat01, weaponHeat01), false);
    this.cryoSurfaceEffect.update(
      deltaTime,
      this.status.getCryoVisualIntensity01(),
      this.status.isCryofrozen()
    );
    this.electroshockSurfaceEffect.update(
      deltaTime,
      this.status.getElectroshockVisualIntensity01(),
      this.status.isElectroshocked()
    );
    this.electroshockArcEmitterEffect.update(
      deltaTime,
      this.status.getElectroshockVisualIntensity01(),
      this.status.isElectroshocked()
    );
    this.updateThrusterEffect(deltaTime);
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.playerTargetObject = target;
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
    return this.perception.hasAimVisionContact(this.root.position, this.worldForward, maxRange, fovRadians);
  }

  faceTarget(deltaTime: number): boolean {
    if (!this.status.canControlFlight()) {
      return false;
    }
    if (!this.perception.predictAimTarget(this.root.position, this.projectileSpeedForLead, this.aimLeadFactor, this.aimTargetWorld)) {
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
      const stopDistance = this.centerPassPatrolPlanner?.update(this.root.position, this.patrolSpeed, deltaTime, this.patrolDesiredPosition);
      if (stopDistance !== null && stopDistance !== undefined) {
        this.moveToward(this.patrolDesiredPosition, this.patrolSpeed, deltaTime, stopDistance, 0);
      }
      return;
    }
    this.patrolOrbitAngle += this.patrolOrbitSpeedRadians * deltaTime;
    this.patrolDesiredPosition.set(
      this.patrolCenter.x + Math.cos(this.patrolOrbitAngle) * this.patrolRadius,
      this.root.position.y,
      this.patrolCenter.z + Math.sin(this.patrolOrbitAngle) * this.patrolRadius
    );
    this.moveToward(this.patrolDesiredPosition, this.patrolSpeed, deltaTime, 1, 0);
  }

  updateEngageMovement(deltaTime: number): void {
    const distance = this.getTargetDistance();
    this.updateAttackMovement(deltaTime, distance ?? Number.POSITIVE_INFINITY);
  }

  updateAttackMovement(deltaTime: number, distanceToTarget: number): void {
    if (!this.status.canControlFlight()) {
      return;
    }
    if (!Number.isFinite(distanceToTarget)) {
      this.coastForward(deltaTime, this.attackSpeed * 0.6);
      return;
    }
    const minBand = Math.max(8, this.preferredAttackDistance * 0.75);
    const maxBand = this.preferredAttackDistance + 10;
    if (distanceToTarget < minBand) {
      this.moveAwayFromTarget(deltaTime, this.attackSpeed, 0.15);
      return;
    }
    if (distanceToTarget > maxBand) {
      this.moveToward(this.targetWorld, this.attackSpeed, deltaTime, this.preferredAttackDistance, 0);
      return;
    }
    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FORWARD_AXIS);
    } else {
      this.worldForward.normalize();
    }
    const moveSpeedMultiplier = this.status.getMoveSpeedMultiplier();
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.worldForward,
      desiredForwardSpeed: this.attackSpeed * 0.72 * moveSpeedMultiplier,
      desiredStrafe: 0
    });
  }

  buildFlybyTargetPoint(_out: THREE.Vector3): boolean {
    return false;
  }

  updateFlybyApproachMovement(_deltaTime: number, _flybyTargetPoint: THREE.Vector3): boolean {
    return true;
  }

  updateFlybyTurnbackMovement(deltaTime: number): void {
    this.updateFleeMovement(deltaTime);
  }

  updateSearchMovement(deltaTime: number, searchTarget: THREE.Vector3): boolean {
    this.moveToward(searchTarget, this.patrolSpeed * 0.9, deltaTime, 1.8, 0);
    return this.isNearPoint2D(searchTarget, 2.2);
  }

  updateCoastMovement(deltaTime: number): void {
    const distance = this.getTargetDistance();
    if (distance === null) {
      this.coastForward(deltaTime, this.attackSpeed * 0.45);
      return;
    }
    const desired = this.preferredAttackDistance + 2;
    const circleStrafe = this.fleeStrafeSign * 0.38;
    if (distance > desired + 5) {
      this.moveToward(this.targetWorld, this.attackSpeed * 0.75, deltaTime, desired, circleStrafe * 0.8);
      return;
    }
    if (distance < Math.max(6, desired - 4)) {
      this.moveAwayFromTarget(deltaTime, this.attackSpeed * 0.7, circleStrafe * 0.45);
      return;
    }
    this.moveToward(this.targetWorld, this.attackSpeed * 0.62, deltaTime, desired, circleStrafe);
  }

  updateEvadeMovement(deltaTime: number, strafeSign: 1 | -1): void {
    this.moveAwayFromTarget(deltaTime, this.fleeSpeed, strafeSign);
  }

  updateFleeMovement(deltaTime: number): void {
    if (this.regroupBreakDirection.lengthSq() <= 0.000001) {
      this.initializeRegroupBreakDirection();
    }
    this.moveAlongWorldDirection(
      deltaTime,
      this.regroupBreakDirection,
      this.fleeSpeed,
      this.fleeStrafeSign * 0.08
    );
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
    if (!this.status.canFireWeapons()) {
      return false;
    }
    if (
      this.generalAttackCooldownRemaining > 0 ||
      this.magazine.isReloading() ||
      (this.resources !== null && !this.resources.canUseHeatEquipment())
    ) {
      return false;
    }
    return this.primaryAttackLoadout.canStartPrimaryAttack();
  }
  isAttackActionActive(): boolean { return this.primaryAttackLoadout.isAttackActionActive(); }
  tryExecutePrimaryAttack(): void {
    if (!this.status.canFireWeapons()) {
      return;
    }
    if (
      this.generalAttackCooldownRemaining > 0 ||
      this.magazine.isReloading() ||
      (this.resources !== null && !this.resources.canUseHeatEquipment())
    ) {
      return;
    }
    this.primaryAttackLoadout.tryExecutePrimaryAttack();
  }
  consumePrimaryAttackFinishedEvent(): boolean { return this.primaryAttackLoadout.consumePrimaryAttackFinishedEvent(); }
  resetAttackBurst(): void { this.primaryAttackLoadout.cancelActivePrimaryAttack(); }

  tryTriggerEvadeFromIncomingFire(baseChance01: number, rearBonusChance01: number, range: number, cooldownSeconds: number): boolean {
    if (this.evadeCooldownRemaining > 0 || this.incomingFireEvadeRollCooldownRemaining > 0) {
      return false;
    }
    if (!this.perception.hasIncomingFireThreatWithinRange(this.root.position, range)) {
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

  onEnterDeadState(): void {
    this.hurtbox.setEnabled(false);
    this.primaryAttackLoadout.resetAll();
    this.pendingSwarmMissileLaunches.length = 0;
  }

  onAiStateChanged(stateId: EnemyShipAiStateId): void {
    this.aiState = stateId;
    if (stateId === "Patrol") {
      this.resetAttackBurst();
      this.centerPassPatrolPlanner?.ensureInitialized(this.root.position);
    }
    if (stateId === "Search" || stateId === "Evade" || stateId === "Circle" || stateId === "Regroup" || stateId === "Flee") {
      this.resetAttackBurst();
    }
    if (stateId === "Circle" || stateId === "Regroup" || stateId === "Flee") {
      this.fleeStrafeSign = Math.random() < 0.5 ? -1 : 1;
      this.initializeRegroupBreakDirection();
    }
  }

  getDebugSnapshot(): EnemyMissileShipDebugSnapshot {
    const telegraph = this.primaryAttackLoadout.getTelegraphVisualState();
    const duration = Math.max(0.001, telegraph.telegraphDurationSeconds);
    return {
      state: this.aiState,
      lockActive: telegraph.active,
      lockProgress01: telegraph.active ? THREE.MathUtils.clamp(1 - telegraph.telegraphSecondsRemaining / duration, 0, 1) : 0,
      magazineShotsRemaining: this.magazine.getShotsRemaining(),
      magazineCapacity: this.magazine.getCapacity(),
      reloadSecondsRemaining: this.magazine.getReloadSecondsRemaining()
    };
  }

  isLockingPlayer(): boolean {
    const telegraph = this.primaryAttackLoadout.getTelegraphVisualState();
    return telegraph.active && this.hasForwardHomingLockContact();
  }

  getLockProgress01(): number {
    const telegraph = this.primaryAttackLoadout.getTelegraphVisualState();
    if (!telegraph.active) {
      return 0;
    }
    const duration = Math.max(0.001, telegraph.telegraphDurationSeconds);
    return THREE.MathUtils.clamp(1 - telegraph.telegraphSecondsRemaining / duration, 0, 1);
  }

  hasIncomingHomingMissileThreat(): boolean {
    return this.homingProjectileRuntime.getActiveCount() > 0;
  }

  appendActiveProjectileHurtboxes(out: HurtboxComponent[]): void {
    this.swarmProjectileRuntime.appendActiveProjectileHurtboxes(out);
    this.homingProjectileRuntime.appendActiveProjectileHurtboxes(out);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.hurtbox.setEnabled(false);
    this.swarmProjectileRuntime.dispose();
    this.homingProjectileRuntime.dispose();
    this.swarmProjectileFactory.dispose?.();
    this.homingProjectileFactory.dispose?.();
    this.pendingSwarmMissileLaunches.length = 0;
    this.lockTelegraphGlowEffect.dispose();
    this.weaponOverheatSteamEffect?.dispose();
    this.weaponOverheatSteamEffect = null;
    this.cryoSurfaceEffect.dispose();
    this.electroshockSurfaceEffect.dispose();
    this.electroshockArcEmitterEffect.dispose();
    this.resources?.setHeatAddedListener(null);
    this.shieldBubbleEffect?.dispose();
    this.shieldBubbleEffect = null;
    this.thrusterEffect?.dispose();
    this.thrusterEffect = null;
    disposeObject3DMeshResources(this.root);
    this.root.removeFromParent();
  }

  private canStartAttackWithMagazineCost(projectileCount: number, heatCost = 0): boolean {
    if (!this.status.canFireWeapons()) {
      return false;
    }
    if (
      projectileCount <= 0 ||
      this.generalAttackCooldownRemaining > 0 ||
      this.magazine.isReloading() ||
      !this.magazine.canConsume(projectileCount)
    ) {
      return false;
    }
    if (this.resources && heatCost > 0 && !this.resources.canUseHeatEquipment()) {
      return false;
    }
    return true;
  }

  private getSwarmVolleyLauncherCount(): number {
    let count = 0;
    for (const [, bay] of this.launchCellsByBay) {
      if (bay.length > 0) {
        count += Math.min(SWARM_MISSILES_PER_BAY, bay.length);
      }
    }
    return count;
  }

  private getHomingVolleyLauncherCount(): number {
    let count = 0;
    for (const [, bay] of this.launchCellsByBay) {
      if (bay.length > 0) {
        count += 1;
      }
    }
    return count;
  }

  private executeSwarmAttack(): boolean {
    if (!this.status.canFireWeapons()) {
      return false;
    }
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      return false;
    }
    const launchers = this.pickRandomCellsPerBayAlternating(SWARM_MISSILES_PER_BAY);
    if (
      launchers.length <= 0 ||
      !this.canStartAttackWithMagazineCost(launchers.length, this.swarmAttackHeatCost)
    ) {
      return false;
    }
    if (
      this.resources &&
      this.swarmAttackHeatCost > 0 &&
      !this.resources.tryConsumeWeaponCost({ heatCost: this.swarmAttackHeatCost })
    ) {
      return false;
    }
    for (let i = 0; i < launchers.length; i += 1) {
      this.pendingSwarmMissileLaunches.push({
        launcher: launchers[i],
        delaySecondsRemaining: SWARM_MISSILE_SHOT_INTERVAL_SECONDS * i,
        targetWorldPosition: this.targetWorld.clone()
      });
    }
    this.magazine.tryConsume(launchers.length);
    this.generalAttackCooldownRemaining = this.generalAttackCooldownSeconds;
    return true;
  }

  private executeHomingAttack(): boolean {
    if (!this.status.canFireWeapons()) {
      return false;
    }
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      return false;
    }
    const launchers = this.pickRandomCellsPerBayAlternating(1);
    if (
      launchers.length <= 0 ||
      !this.canStartAttackWithMagazineCost(launchers.length, this.homingAttackHeatCost)
    ) {
      return false;
    }
    if (
      this.resources &&
      this.homingAttackHeatCost > 0 &&
      !this.resources.tryConsumeWeaponCost({ heatCost: this.homingAttackHeatCost })
    ) {
      return false;
    }
    for (const launcher of launchers) {
      launcher.object.getWorldPosition(this.shotOrigin);
      this.shotDirection.subVectors(this.targetWorld, this.shotOrigin).setY(0);
      if (this.shotDirection.lengthSq() <= 0.000001) {
        launcher.object.getWorldDirection(this.shotDirection);
      }
      if (this.shotDirection.lengthSq() <= 0.000001) {
        this.shotDirection.copy(FORWARD_AXIS);
      } else {
        this.shotDirection.normalize();
      }
      this.homingProjectileRuntime.spawn(this.shotOrigin, this.shotDirection);
    }
    this.magazine.tryConsume(launchers.length);
    this.generalAttackCooldownRemaining = this.generalAttackCooldownSeconds;
    return true;
  }

  private pickRandomCellsPerBayAlternating(countPerBay: number): MissileCellLauncher[] {
    const selectionsByBay: Array<{ bayIndex: number; launchers: MissileCellLauncher[] }> = [];
    for (const [bayIndex, bay] of this.launchCellsByBay) {
      if (bay.length <= 0) continue;
      const shotsForBay = Math.min(Math.max(1, Math.floor(countPerBay)), bay.length);
      const usedIndices = new Set<number>();
      const baySelections: MissileCellLauncher[] = [];
      while (usedIndices.size < shotsForBay) {
        const index = Math.floor(Math.random() * bay.length);
        if (usedIndices.has(index)) {
          continue;
        }
        usedIndices.add(index);
        baySelections.push(bay[index]);
      }
      selectionsByBay.push({ bayIndex, launchers: baySelections });
    }
    selectionsByBay.sort((a, b) => a.bayIndex - b.bayIndex);
    const out: MissileCellLauncher[] = [];
    let round = 0;
    while (true) {
      let addedAny = false;
      for (const bay of selectionsByBay) {
        if (round >= bay.launchers.length) {
          continue;
        }
        out.push(bay.launchers[round]);
        addedAny = true;
      }
      if (!addedAny) {
        break;
      }
      round += 1;
    }
    return out;
  }

  private updatePendingSwarmMissileLaunches(deltaTime: number): void {
    for (let i = this.pendingSwarmMissileLaunches.length - 1; i >= 0; i -= 1) {
      const pendingLaunch = this.pendingSwarmMissileLaunches[i];
      pendingLaunch.delaySecondsRemaining -= deltaTime;
      if (pendingLaunch.delaySecondsRemaining > 0) {
        continue;
      }
      this.fireSwarmMissileFromLauncher(pendingLaunch.launcher, pendingLaunch.targetWorldPosition);
      this.pendingSwarmMissileLaunches.splice(i, 1);
    }
  }

  private fireSwarmMissileFromLauncher(
    launcher: MissileCellLauncher,
    targetWorldPosition: THREE.Vector3
  ): void {
    launcher.object.getWorldPosition(this.shotOrigin);
    this.shotDirection.subVectors(targetWorldPosition, this.shotOrigin).setY(0);
    if (this.shotDirection.lengthSq() <= 0.000001) {
      launcher.object.getWorldDirection(this.shotDirection);
    }
    if (this.shotDirection.lengthSq() <= 0.000001) {
      this.shotDirection.copy(FORWARD_AXIS);
    } else {
      this.shotDirection.normalize();
    }
    this.swarmProjectileRuntime.spawn(this.shotOrigin, this.shotDirection);
  }

  private rebuildLaunchCellMappings(bayOffsets: readonly (readonly THREE.Vector3[])[]): void {
    this.launchCells.length = 0;
    this.launchCellsByBay.clear();
    const muzzles = this.launcherRig.muzzles;
    let muzzleIndex = 0;
    for (let bayIdx = 0; bayIdx < bayOffsets.length; bayIdx += 1) {
      const bayIndex = bayIdx + 1;
      const bayList: MissileCellLauncher[] = [];
      for (let cellIdx = 0; cellIdx < bayOffsets[bayIdx].length; cellIdx += 1) {
        if (muzzleIndex >= muzzles.length) break;
        const launcher = { bayIndex, cellIndex: cellIdx + 1, object: muzzles[muzzleIndex] };
        this.launchCells.push(launcher);
        bayList.push(launcher);
        muzzleIndex += 1;
      }
      this.launchCellsByBay.set(bayIndex, bayList);
    }
  }

  private loadOptionalModel(modelUrl: string, modelYawOffset: number, desiredSize: number, modelHeightOffset: number): void {
    const loader = new GLTFLoader();
    loader.load(modelUrl, (gltf) => {
      const model = gltf.scene;
      model.rotation.y = modelYawOffset;
      normalizeModelToSize(model, desiredSize);
      alignModelToGroundCentered(model);
      model.position.y += modelHeightOffset;
      this.root.add(model);

      const thrusterSocketOffsets = extractSocketLocalOffsets(this.root, model, THRUSTER_SOCKET_PREFIX);
      if (thrusterSocketOffsets.length > 0) {
        this.rebuildThrusterEffect(thrusterSocketOffsets, extractSocketSizeScales(model, THRUSTER_SOCKET_PREFIX));
      }

      const missileSockets = extractMissileCellSocketLocalOffsets(this.root, model);
      if (missileSockets.length > MAX_MODEL_MISSILE_CELL_SOCKETS) {
        console.warn(
          `Enemy missile ship model exposed ${missileSockets.length} missile sockets; ignoring model sockets and using defaults.`
        );
      } else if (missileSockets.length > 0) {
        const groupedBayOffsets = groupMissileCellSocketsByBay(missileSockets);
        this.launcherRig.setMuzzleOffsets(flattenBayOffsets(groupedBayOffsets));
        this.rebuildLaunchCellMappings(groupedBayOffsets);
      }

      const outline = createSilhouetteOutlineShell(model, { colorHex: ENEMY_OUTLINE_COLOR_HEX, opacity: 0.16, scaleMultiplier: 1.035 });
      if (outline) {
        this.root.add(outline);
      }
    }, undefined, (error) => {
      console.warn("Enemy missile ship model failed to load. Using fallback body.", error);
    });
  }

  private createFallbackBody(): void {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.35), new THREE.MeshStandardMaterial({ color: 0x4c5560, roughness: 0.6, metalness: 0.18 }));
    hull.position.y = 0.95;
    this.root.add(hull);
    const podGeometry = new THREE.BoxGeometry(0.38, 0.28, 1.65);
    const podMaterial = new THREE.MeshStandardMaterial({ color: 0x303944, roughness: 0.68, metalness: 0.12 });
    const leftPod = new THREE.Mesh(podGeometry, podMaterial);
    leftPod.position.set(-0.7, 0.9, 0.15);
    this.root.add(leftPod);
    const rightPod = new THREE.Mesh(podGeometry, podMaterial.clone());
    rightPod.position.set(0.7, 0.9, 0.15);
    this.root.add(rightPod);
  }

  private rebuildThrusterEffect(thrusterLocalOffsets: readonly THREE.Vector3[], thrusterSizeScales?: readonly number[]): void {
    this.thrusterEffect?.dispose();
    this.thrusterEffect = createPlayerThrusterEffect(this.thrusterEffectAnchor, {
      thrusterLocalOffsets,
      thrusterSizeScales,
      effectScale: 0.74,
      trailLengthScale: 0.9,
      glowOpacityScale: 0.9,
      emitterYawRadians: Math.PI
    });
  }

  private moveToward(targetPosition: THREE.Vector3, speed: number, deltaTime: number, stopDistance: number, desiredStrafe: number): void {
    if (!this.status.canControlFlight()) {
      return;
    }
    const adjustedSpeed = Math.max(0, speed * this.status.getMoveSpeedMultiplier());
    this.moveDirection.subVectors(targetPosition, this.root.position).setY(0);
    const distance = this.moveDirection.length();
    if (distance <= 0.000001 || deltaTime <= 0) {
      this.coastForward(deltaTime, 0);
      return;
    }
    if (distance <= stopDistance) {
      this.flightController.step(deltaTime, { desiredHeadingWorld: this.moveDirection, desiredForwardSpeed: 0, desiredStrafe });
      return;
    }
    this.moveDirection.normalize();
    const maxSafeSpeedThisFrame = Math.max(0, (distance - stopDistance) / Math.max(0.0001, deltaTime));
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.moveDirection,
      desiredForwardSpeed: Math.min(adjustedSpeed, maxSafeSpeedThisFrame),
      desiredStrafe
    });
  }

  private moveAwayFromTarget(deltaTime: number, speed: number, desiredStrafe: number): void {
    if (!this.status.canControlFlight()) {
      return;
    }
    const adjustedSpeed = Math.max(0, speed * this.status.getMoveSpeedMultiplier());
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      this.coastForward(deltaTime, adjustedSpeed * 0.65);
      return;
    }
    this.moveDirection.subVectors(this.root.position, this.targetWorld).setY(0);
    if (this.moveDirection.lengthSq() <= 0.000001) {
      this.coastForward(deltaTime, adjustedSpeed * 0.65);
      return;
    }
    this.moveDirection.normalize();
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.moveDirection,
      desiredForwardSpeed: adjustedSpeed,
      desiredStrafe
    });
  }

  private moveAlongWorldDirection(
    deltaTime: number,
    directionWorld: THREE.Vector3,
    speed: number,
    desiredStrafe: number
  ): void {
    if (!this.status.canControlFlight()) {
      return;
    }
    const adjustedSpeed = Math.max(0, speed * this.status.getMoveSpeedMultiplier());
    if (deltaTime <= 0) {
      return;
    }
    this.moveDirection.copy(directionWorld).setY(0);
    if (this.moveDirection.lengthSq() <= 0.000001) {
      this.coastForward(deltaTime, adjustedSpeed * 0.65);
      return;
    }
    this.moveDirection.normalize();
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.moveDirection,
      desiredForwardSpeed: adjustedSpeed,
      desiredStrafe
    });
  }

  private coastForward(deltaTime: number, speed: number): void {
    if (!this.status.canControlFlight()) {
      return;
    }
    const adjustedSpeed = Math.max(0, speed * this.status.getMoveSpeedMultiplier());
    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FORWARD_AXIS);
    } else {
      this.worldForward.normalize();
    }
    this.flightController.step(deltaTime, {
      desiredHeadingWorld: this.worldForward,
      desiredForwardSpeed: adjustedSpeed,
      desiredStrafe: 0
    });
  }

  private initializeRegroupBreakDirection(): void {
    if (this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      this.regroupBreakDirection.subVectors(this.root.position, this.targetWorld).setY(0);
    } else {
      this.regroupBreakDirection.set(0, 0, 0);
    }
    if (this.regroupBreakDirection.lengthSq() <= 0.000001) {
      this.root.getWorldDirection(this.regroupBreakDirection);
      this.regroupBreakDirection.setY(0);
    }
    if (this.regroupBreakDirection.lengthSq() <= 0.000001) {
      this.regroupBreakDirection.copy(FORWARD_AXIS);
    } else {
      this.regroupBreakDirection.normalize();
    }

    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      return;
    }
    this.worldForward.normalize();
    this.moveDirection.crossVectors(this.worldForward, new THREE.Vector3(0, 1, 0));
    if (this.moveDirection.lengthSq() <= 0.000001) {
      return;
    }
    this.moveDirection.normalize().multiplyScalar(this.fleeStrafeSign * 0.22);
    this.regroupBreakDirection.add(this.moveDirection);
    if (this.regroupBreakDirection.lengthSq() <= 0.000001) {
      this.regroupBreakDirection.copy(FORWARD_AXIS);
    } else {
      this.regroupBreakDirection.normalize();
    }
  }

  private updateThrusterEffect(deltaTime: number): void {
    const movedDistance = this.root.position.distanceTo(this.previousPosition);
    const speed01 = deltaTime > 0
      ? THREE.MathUtils.clamp(movedDistance / Math.max(0.0001, deltaTime) / this.maxMoveSpeedForThrusters, 0, 1)
      : 0;
    let baseIntensity = 0.5;
    switch (this.aiState) {
      case "Spawn": baseIntensity = 0.3; break;
      case "Patrol": baseIntensity = 0.45; break;
      case "Attack": baseIntensity = 0.7; break;
      case "Evade": baseIntensity = 0.95; break;
      case "Search": baseIntensity = 0.55; break;
      case "Circle": baseIntensity = 0.78; break;
      case "Coast": baseIntensity = 0.58; break;
      case "Regroup":
      case "Flee": baseIntensity = 0.9; break;
      case "Dead": baseIntensity = 0; break;
    }
    this.thrusterEffect?.update(deltaTime, Math.max(baseIntensity, speed01));
    this.previousPosition.copy(this.root.position);
  }

  private isPlayerBehindWithinRadians(halfAngleRadians: number, range: number): boolean {
    this.root.getWorldDirection(this.worldForward);
    return this.perception.isTargetBehindWithinRadians(this.root.position, this.worldForward, halfAngleRadians, range);
  }

  private isNearPoint2D(target: THREE.Vector3, threshold: number): boolean {
    const dx = this.root.position.x - target.x;
    const dz = this.root.position.z - target.z;
    return dx * dx + dz * dz <= threshold * threshold;
  }

  private hasForwardHomingLockContact(): boolean {
    if (!this.status.canFireWeapons()) {
      return false;
    }
    if (!this.perception.tryCopyCurrentTargetWorld(this.targetWorld)) {
      return false;
    }

    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    const distanceSq = this.toTarget.lengthSq();
    if (distanceSq <= 0.000001) {
      return true;
    }

    const lockRange = Math.max(this.preferredAttackDistance + 18, 42);
    if (distanceSq > lockRange * lockRange) {
      return false;
    }

    this.toTarget.normalize();
    this.root.getWorldDirection(this.worldForward);
    this.worldForward.setY(0);
    if (this.worldForward.lengthSq() <= 0.000001) {
      this.worldForward.copy(FORWARD_AXIS);
    } else {
      this.worldForward.normalize();
    }

    const dot = THREE.MathUtils.clamp(this.worldForward.dot(this.toTarget), -1, 1);
    return dot >= Math.cos(HOMING_LOCK_HALF_ANGLE_RADIANS);
  }
}

function flattenBayOffsets(bayOffsets: readonly (readonly THREE.Vector3[])[]): THREE.Vector3[] {
  const flattened: THREE.Vector3[] = [];
  for (const bay of bayOffsets) {
    for (const offset of bay) {
      flattened.push(offset.clone());
    }
  }
  return flattened;
}

function groupMissileCellSocketsByBay(
  sockets: readonly Array<{ bayIndex: number; cellIndex: number; localOffset: THREE.Vector3 }>
): readonly (readonly THREE.Vector3[])[] {
  const byBay = new Map<number, Array<{ cellIndex: number; localOffset: THREE.Vector3 }>>();
  for (const socket of sockets) {
    const list = byBay.get(socket.bayIndex) ?? [];
    list.push({ cellIndex: socket.cellIndex, localOffset: socket.localOffset.clone() });
    byBay.set(socket.bayIndex, list);
  }

  const groupedByParsedBay = [...byBay.keys()]
    .sort((a, b) => a - b)
    .map((bayIndex) => (byBay.get(bayIndex) ?? []).sort((a, b) => a.cellIndex - b.cellIndex).map((entry) => entry.localOffset));

  if (groupedByParsedBay.length !== 1) {
    return groupedByParsedBay;
  }

  const leftBay: Array<{ cellIndex: number; localOffset: THREE.Vector3 }> = [];
  const rightBay: Array<{ cellIndex: number; localOffset: THREE.Vector3 }> = [];
  for (const socket of sockets) {
    if (socket.localOffset.x < 0) {
      leftBay.push({ cellIndex: socket.cellIndex, localOffset: socket.localOffset.clone() });
      continue;
    }
    rightBay.push({ cellIndex: socket.cellIndex, localOffset: socket.localOffset.clone() });
  }

  if (leftBay.length <= 0 || rightBay.length <= 0) {
    return groupedByParsedBay;
  }

  leftBay.sort((a, b) => a.cellIndex - b.cellIndex);
  rightBay.sort((a, b) => a.cellIndex - b.cellIndex);
  return [
    leftBay.map((entry) => entry.localOffset),
    rightBay.map((entry) => entry.localOffset)
  ];
}
