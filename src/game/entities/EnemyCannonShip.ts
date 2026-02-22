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
import type {
  ProjectileFactory,
  ProjectileInstance
} from "../controllers/projectiles/ProjectileTypes";
import type { EnemyShipAiStateId } from "../enemies/ai/EnemyShipAiTypes";

const DEFAULT_MUZZLE_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.32, 0.86, 1.22),
  new THREE.Vector3(0.32, 0.86, 1.22)
];
const DEFAULT_THRUSTER_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.34, 0.76, 1.02),
  new THREE.Vector3(0.34, 0.76, 1.02)
];
const THRUSTER_SOCKET_PREFIX = "thruster";
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

export type EnemyCannonShipConfig = {
  health: HealthConfig;
  position?: THREE.Vector3;
  patrolCenter?: THREE.Vector3;
  patrolRadius?: number;
  patrolSpeed?: number;
  patrolOrbitSpeedRadians?: number;
  chaseSpeed?: number;
  attackStrafeSpeed?: number;
  preferredAttackDistance?: number;
  turnSpeedRadians?: number;
  fireArcRadians?: number;
  burstShotCount?: number;
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
  private readonly muzzles: THREE.Object3D[] = [];
  private readonly thrusterEffectAnchor = new THREE.Group();
  private thrusterEffect: ReturnType<typeof createPlayerThrusterEffect> | null = null;

  private readonly patrolCenter: THREE.Vector3;
  private readonly patrolRadius: number;
  private readonly patrolSpeed: number;
  private readonly patrolOrbitSpeedRadians: number;
  private readonly chaseSpeed: number;
  private readonly attackStrafeSpeed: number;
  private readonly preferredAttackDistance: number;
  private readonly turnSpeedRadians: number;
  private readonly fireArcRadians: number;
  private readonly burstShotCount: number;
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
  private readonly previousPosition = new THREE.Vector3();
  private readonly patrolDesiredPosition = new THREE.Vector3();

  private playerTarget: THREE.Object3D | null;
  private aiState: EnemyShipAiStateId = "Spawn";
  private patrolOrbitAngle = Math.random() * Math.PI * 2;
  private attackBurstShotsRemaining = 0;
  private attackBurstShotCooldownRemaining = 0;
  private attackBurstCooldownRemaining = 0;
  private nextMuzzleIndex = 0;
  private strafeSign = Math.random() < 0.5 ? -1 : 1;
  private strafeFlipTimer = randomRange(1.25, 2.6);
  private disposed = false;

  constructor(config: EnemyCannonShipConfig, scene: THREE.Scene) {
    this.scene = scene;
    this.health = createHealthComponent(config.health);
    this.targetHurtboxes = config.targetHurtboxes ?? [];
    this.playerTarget = config.playerTarget ?? null;
    this.patrolCenter = (config.patrolCenter ?? config.position ?? new THREE.Vector3()).clone();
    this.patrolRadius = Math.max(1, config.patrolRadius ?? 8);
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
    this.burstShotCount = Math.max(1, Math.floor(config.burstShotCount ?? 3));
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
    this.previousPosition.copy(this.root.position);

    this.projectileRoot.name = "enemy-cannon-ship-projectiles";
    this.scene.add(this.projectileRoot);

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
    this.health.update(deltaTime);
    this.updateAttackTimers(deltaTime);
    this.updateThrusterEffect(deltaTime);
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.playerTarget = target;
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

  faceTarget(deltaTime: number): boolean {
    if (!this.playerTarget) {
      return false;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    if (this.toTarget.lengthSq() <= 0.000001) {
      return true;
    }

    const desiredYaw = Math.atan2(this.toTarget.x, this.toTarget.z);
    const yawDelta = shortestAngleDelta(this.root.rotation.y, desiredYaw);
    const maxYawStep = this.turnSpeedRadians * deltaTime;
    this.root.rotation.y += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);

    return Math.abs(shortestAngleDelta(this.root.rotation.y, desiredYaw)) <= this.fireArcRadians * 0.5;
  }

  updatePatrolMovement(deltaTime: number): void {
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

  updateAttackMovement(deltaTime: number, distanceToTarget: number): void {
    if (distanceToTarget <= 0.000001) {
      return;
    }

    this.strafeFlipTimer -= deltaTime;
    if (this.strafeFlipTimer <= 0) {
      this.strafeSign *= -1;
      this.strafeFlipTimer = randomRange(1.0, 2.25);
    }

    this.toTarget.subVectors(this.targetWorld, this.root.position).setY(0);
    if (this.toTarget.lengthSq() <= 0.000001) {
      return;
    }
    this.toTarget.normalize();

    const radialError = distanceToTarget - this.preferredAttackDistance;
    this.strafeDirection.set(-this.toTarget.z * this.strafeSign, 0, this.toTarget.x * this.strafeSign);
    this.moveDirection.copy(this.strafeDirection);

    if (Math.abs(radialError) > 1.25) {
      this.moveDirection.addScaledVector(
        this.toTarget,
        THREE.MathUtils.clamp(radialError * 0.45, -0.9, 0.9)
      );
    }

    if (this.moveDirection.lengthSq() <= 0.000001) {
      return;
    }

    this.moveDirection.normalize();
    this.root.position.addScaledVector(this.moveDirection, this.attackStrafeSpeed * deltaTime);
  }

  tryFireBurstAttack(): void {
    if (this.attackBurstShotsRemaining <= 0 && this.attackBurstCooldownRemaining <= 0) {
      this.attackBurstShotsRemaining = this.burstShotCount;
      this.attackBurstShotCooldownRemaining = 0;
    }

    if (this.attackBurstShotsRemaining <= 0 || this.attackBurstShotCooldownRemaining > 0) {
      return;
    }

    const didFire = this.spawnLaserShot();
    if (!didFire) {
      return;
    }

    this.attackBurstShotsRemaining -= 1;
    if (this.attackBurstShotsRemaining > 0) {
      this.attackBurstShotCooldownRemaining = this.burstShotIntervalSeconds;
      return;
    }

    this.attackBurstCooldownRemaining = this.burstCooldownSeconds;
    this.attackBurstShotCooldownRemaining = 0;
  }

  resetAttackBurst(): void {
    this.attackBurstShotsRemaining = 0;
    this.attackBurstShotCooldownRemaining = 0;
  }

  onEnterDeadState(): void {
    this.hurtbox.setEnabled(false);
    this.attackBurstShotsRemaining = 0;
    this.attackBurstShotCooldownRemaining = 0;
    this.attackBurstCooldownRemaining = 0;
  }

  onAiStateChanged(stateId: EnemyShipAiStateId): void {
    this.aiState = stateId;
    if (stateId === "Patrol") {
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

  private spawnLaserShot(): boolean {
    if (this.muzzles.length <= 0) {
      return false;
    }

    const muzzle = this.muzzles[this.nextMuzzleIndex % this.muzzles.length];
    this.nextMuzzleIndex = (this.nextMuzzleIndex + 1) % this.muzzles.length;

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

    const projectile = this.projectileFactory.spawn({
      direction: this.shotDirection,
      origin: this.muzzleWorldPosition
    });
    projectile.object.removeFromParent();
    this.projectileRoot.add(projectile.object);
    this.projectiles.push(projectile);
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
    this.attackBurstShotCooldownRemaining = Math.max(
      0,
      this.attackBurstShotCooldownRemaining - deltaTime
    );
    this.attackBurstCooldownRemaining = Math.max(0, this.attackBurstCooldownRemaining - deltaTime);
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
      case "Chase":
        baseIntensity = 0.95;
        break;
      case "Attack":
        baseIntensity = 0.7;
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
    if (distance <= stopDistance || distance <= 0.000001 || speed <= 0 || deltaTime <= 0) {
      return;
    }

    this.moveDirection.normalize();
    this.root.position.addScaledVector(
      this.moveDirection,
      Math.min(speed * deltaTime, distance - stopDistance)
    );

    const desiredYaw = Math.atan2(this.moveDirection.x, this.moveDirection.z);
    const yawDelta = shortestAngleDelta(this.root.rotation.y, desiredYaw);
    const maxYawStep = this.turnSpeedRadians * deltaTime * 0.8;
    this.root.rotation.y += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);
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
      },
      undefined,
      (error) => {
        console.warn("Enemy cannon ship model failed to load. Using fallback body.", error);
      }
    );
  }
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
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
