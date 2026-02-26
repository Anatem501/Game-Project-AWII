import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { resolveHitboxAgainstHurtboxes } from "../components/combat/HitboxHurtboxCollision";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { createLaserBoltFactory } from "../controllers/projectiles/LaserBoltFactory";
import { createLaserHitSparkExplosionSystem } from "../effects/LaserHitSparkExplosionSystem";
import { createPlasmaHitImplosionSystem } from "../effects/PlasmaHitImplosionSystem";
import { createPlasmaMuzzleGlobBurstSystem } from "../effects/PlasmaMuzzleGlobBurstSystem";
import { createShipGunSparkBurstSystem } from "../effects/ShipGunSparkBurstSystem";
import type {
  ProjectileFactory,
  ProjectileInstance
} from "../controllers/projectiles/ProjectileTypes";

const DEFAULT_MUZZLE_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(4, 0.5, -0.4),
  new THREE.Vector3(4, 0.5, 0.4)
];
const DEFAULT_MUZZLE_SOCKET_NAMES: readonly string[] = ["Cannon01", "Cannon02"];
const DEFAULT_HORIZONTAL_SPREAD_RADIANS = THREE.MathUtils.degToRad(10);

type MuzzleLocalTransform = {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
};

export type EnemyDualLaserBoltTurretConfig = {
  position?: THREE.Vector3;
  detectionRange?: number;
  fireRange?: number;
  perGunFireIntervalSeconds?: number;
  fireIntervalSeconds?: number;
  burstShotCount?: number;
  burstCooldownMinSeconds?: number;
  burstCooldownMaxSeconds?: number;
  turnSpeedRadians?: number;
  firingArcRadians?: number;
  modelUrl?: string;
  modelYawOffset?: number;
  modelDesiredSize?: number;
  modelHeightOffset?: number;
  aimYawOffsetRadians?: number;
  muzzleLocalOffsets?: readonly THREE.Vector3[];
  muzzleSocketNames?: readonly string[];
  autoFire?: boolean;
  playerTarget?: THREE.Object3D | null;
  projectileFactory?: ProjectileFactory;
  projectileFaction?: string | null;
  projectileSpeed?: number;
  horizontalSpreadRadians?: number;
  additionalSpreadAtMaxSpeedRadians?: number;
  targetSpeedForMaxSpread?: number;
  leadFactor?: number;
  aimUpdateIntervalSeconds?: number;
  burstWindupMinSeconds?: number;
  burstWindupMaxSeconds?: number;
  targetHurtboxes?: readonly HurtboxComponent[];
  consumeShotCost?: () => boolean;
  getFireIntervalMultiplier?: () => number;
  getTurnRateMultiplier?: () => number;
  getLockedAimWorldDirection?: (out: THREE.Vector3) => THREE.Vector3 | null;
};

export class EnemyDualLaserBoltTurret {
  readonly root: THREE.Group;

  private readonly scene: THREE.Scene;
  private readonly projectileRoot: THREE.Group;
  private readonly projectileFactory: ProjectileFactory;
  private readonly ownedProjectileFactory?: ProjectileFactory;
  private readonly sparkBursts: ReturnType<typeof createShipGunSparkBurstSystem>;
  private readonly plasmaMuzzleGlobs: ReturnType<typeof createPlasmaMuzzleGlobBurstSystem>;
  private readonly hitSparkExplosions: ReturnType<typeof createLaserHitSparkExplosionSystem>;
  private readonly plasmaHitImplosions: ReturnType<typeof createPlasmaHitImplosionSystem>;
  private readonly muzzles: THREE.Object3D[] = [];
  private readonly projectiles: ProjectileInstance[] = [];
  private readonly targetHurtboxes: readonly HurtboxComponent[];

  private readonly detectionRange: number;
  private readonly fireRange: number;
  private readonly perGunFireIntervalSeconds: number;
  private readonly burstShotCount: number;
  private readonly burstCooldownMinSeconds: number;
  private readonly burstCooldownMaxSeconds: number;
  private readonly turnSpeedRadians: number;
  private readonly firingArcRadians: number;
  private readonly autoFire: boolean;
  private muzzleLocalTransforms: readonly MuzzleLocalTransform[];
  private readonly muzzleSocketNames: readonly string[];
  private readonly aimYawOffsetRadians: number;
  private readonly horizontalSpreadRadians: number;
  private readonly additionalSpreadAtMaxSpeedRadians: number;
  private readonly targetSpeedForMaxSpread: number;
  private readonly projectileSpeed: number;
  private readonly leadFactor: number;
  private readonly aimUpdateIntervalSeconds: number;
  private readonly burstWindupMinSeconds: number;
  private readonly burstWindupMaxSeconds: number;
  private readonly consumeShotCost?: () => boolean;
  private readonly getFireIntervalMultiplier?: () => number;
  private readonly getTurnRateMultiplier?: () => number;
  private readonly getLockedAimWorldDirection?: (out: THREE.Vector3) => THREE.Vector3 | null;

  private readonly turretWorldPosition = new THREE.Vector3();
  private readonly muzzleWorldPosition = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly toTargetLocal = new THREE.Vector3();
  private readonly aimNodeParentQuaternion = new THREE.Quaternion();
  private readonly aimNodeParentQuaternionInverse = new THREE.Quaternion();
  private readonly targetWorld = new THREE.Vector3();
  private readonly aimTargetWorld = new THREE.Vector3();
  private readonly previousTargetWorld = new THREE.Vector3();
  private readonly targetVelocityWorld = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly fallbackForward = new THREE.Vector3();
  private readonly lockedAimDirectionWorld = new THREE.Vector3();

  private readonly fallbackAimNode = new THREE.Group();
  private playerTarget: THREE.Object3D | null = null;
  private aimNode: THREE.Object3D;
  private detectedPlayer = false;
  private fireCooldownSeconds = 0;
  private burstCooldownSeconds = 0;
  private aimUpdateCooldownSeconds = 0;
  private burstWindupSeconds = 0;
  private isBurstPrimed = false;
  private shotsRemainingInBurst: number;
  private nextMuzzleIndex = 0;
  private disposed = false;
  private hasPreviousTargetWorld = false;

  constructor(scene: THREE.Scene, config: EnemyDualLaserBoltTurretConfig) {
    this.scene = scene;
    this.detectionRange = Math.max(0, config.detectionRange ?? 30);
    this.fireRange = Math.max(0, config.fireRange ?? 26);
    const configuredPerGunInterval =
      config.perGunFireIntervalSeconds ?? config.fireIntervalSeconds ?? 0.22;
    this.perGunFireIntervalSeconds = Math.max(0.001, configuredPerGunInterval);
    this.burstShotCount = Math.max(1, Math.floor(config.burstShotCount ?? 12));
    this.burstCooldownMinSeconds = Math.max(0, config.burstCooldownMinSeconds ?? 2);
    this.burstCooldownMaxSeconds = Math.max(
      this.burstCooldownMinSeconds,
      config.burstCooldownMaxSeconds ?? 5
    );
    this.turnSpeedRadians = Math.max(
      0,
      config.turnSpeedRadians ?? THREE.MathUtils.degToRad(180)
    );
    this.firingArcRadians = THREE.MathUtils.clamp(
      config.firingArcRadians ?? THREE.MathUtils.degToRad(18),
      0,
      Math.PI
    );
    this.muzzleLocalTransforms = (config.muzzleLocalOffsets ?? DEFAULT_MUZZLE_LOCAL_OFFSETS).map(
      (offset) => ({
        position: offset.clone(),
        rotation: new THREE.Quaternion()
      })
    );
    this.muzzleSocketNames =
      config.muzzleSocketNames && config.muzzleSocketNames.length > 0
        ? [...config.muzzleSocketNames]
        : [...DEFAULT_MUZZLE_SOCKET_NAMES];
    this.aimYawOffsetRadians = config.aimYawOffsetRadians ?? 0;
    this.horizontalSpreadRadians = Math.max(
      0,
      config.horizontalSpreadRadians ?? DEFAULT_HORIZONTAL_SPREAD_RADIANS
    );
    this.additionalSpreadAtMaxSpeedRadians = Math.max(
      0,
      config.additionalSpreadAtMaxSpeedRadians ?? THREE.MathUtils.degToRad(4)
    );
    this.targetSpeedForMaxSpread = Math.max(0.001, config.targetSpeedForMaxSpread ?? 12);
    this.projectileSpeed = Math.max(0.001, config.projectileSpeed ?? 16);
    this.leadFactor = THREE.MathUtils.clamp(config.leadFactor ?? 0.6, 0, 1);
    this.aimUpdateIntervalSeconds = Math.max(0, config.aimUpdateIntervalSeconds ?? 0.2);
    this.burstWindupMinSeconds = Math.max(0, config.burstWindupMinSeconds ?? 0.2);
    this.burstWindupMaxSeconds = Math.max(
      this.burstWindupMinSeconds,
      config.burstWindupMaxSeconds ?? 0.35
    );
    this.consumeShotCost = config.consumeShotCost;
    this.getFireIntervalMultiplier = config.getFireIntervalMultiplier;
    this.getTurnRateMultiplier = config.getTurnRateMultiplier;
    this.getLockedAimWorldDirection = config.getLockedAimWorldDirection;
    this.autoFire = config.autoFire ?? true;
    this.targetHurtboxes = config.targetHurtboxes ?? [];
    this.playerTarget = config.playerTarget ?? null;
    this.shotsRemainingInBurst = this.burstShotCount;

    if (config.projectileFactory) {
      this.projectileFactory = config.projectileFactory;
    } else {
      this.ownedProjectileFactory = createLaserBoltFactory({
        faction: config.projectileFaction ?? "enemy",
        speed: this.projectileSpeed
      });
      this.projectileFactory = this.ownedProjectileFactory;
    }

    this.root = new THREE.Group();
    this.root.position.copy(config.position ?? new THREE.Vector3());
    this.scene.add(this.root);

    this.aimNode = this.fallbackAimNode;
    this.root.add(this.fallbackAimNode);

    this.projectileRoot = new THREE.Group();
    this.scene.add(this.projectileRoot);
    this.sparkBursts = createShipGunSparkBurstSystem(this.scene);
    this.plasmaMuzzleGlobs = createPlasmaMuzzleGlobBurstSystem(this.scene);
    this.hitSparkExplosions = createLaserHitSparkExplosionSystem(this.scene);
    this.plasmaHitImplosions = createPlasmaHitImplosionSystem(this.scene);

    this.createMuzzles();

    if (config.modelUrl) {
      this.loadOptionalModel(
        config.modelUrl,
        config.modelYawOffset ?? 0,
        config.modelDesiredSize ?? 1.6,
        config.modelHeightOffset ?? 0
      );
    } else {
      this.createFallbackBody();
    }
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.playerTarget = target;
  }

  isPlayerDetected(): boolean {
    return this.detectedPlayer;
  }

  getMuzzleObjects(): readonly THREE.Object3D[] {
    return this.muzzles;
  }

  getAimWorldDirection(out: THREE.Vector3): THREE.Vector3 {
    this.aimNode.getWorldDirection(out);
    out.setY(0);
    if (out.lengthSq() <= 0.000001) {
      out.set(0, 0, 1);
    } else {
      out.normalize();
    }
    return out;
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }

    this.updateProjectiles(deltaTime);
    this.sparkBursts.update(deltaTime);
    this.plasmaMuzzleGlobs.update(deltaTime);
    this.hitSparkExplosions.update(deltaTime);
    this.plasmaHitImplosions.update(deltaTime);
    this.fireCooldownSeconds = Math.max(0, this.fireCooldownSeconds - deltaTime);
    this.burstCooldownSeconds = Math.max(0, this.burstCooldownSeconds - deltaTime);
    this.aimUpdateCooldownSeconds = Math.max(0, this.aimUpdateCooldownSeconds - deltaTime);
    this.burstWindupSeconds = Math.max(0, this.burstWindupSeconds - deltaTime);

    if (!this.playerTarget) {
      this.detectedPlayer = false;
      this.hasPreviousTargetWorld = false;
      this.isBurstPrimed = false;
      this.burstWindupSeconds = 0;
      return;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);
    this.updateTargetVelocity(deltaTime);

    this.root.getWorldPosition(this.turretWorldPosition);
    this.toTarget.subVectors(this.targetWorld, this.turretWorldPosition).setY(0);
    const distanceToTarget = this.toTarget.length();
    this.detectedPlayer =
      distanceToTarget > 0.0001 && distanceToTarget <= this.detectionRange;
    if (!this.detectedPlayer) {
      this.isBurstPrimed = false;
      this.burstWindupSeconds = 0;
      return;
    }

    const lockedAimDirection = this.getLockedAimWorldDirection?.(this.lockedAimDirectionWorld) ?? null;
    if (lockedAimDirection && lockedAimDirection.lengthSq() > 0.000001) {
      this.lockedAimDirectionWorld.copy(lockedAimDirection).setY(0).normalize();
      this.aimTargetWorld
        .copy(this.turretWorldPosition)
        .addScaledVector(
          this.lockedAimDirectionWorld,
          Math.max(this.fireRange, distanceToTarget, 8)
        );
      this.toTarget.copy(this.lockedAimDirectionWorld);
    } else {
      this.updateAimTargetAtInterval(this.turretWorldPosition);
      this.toTarget.subVectors(this.aimTargetWorld, this.turretWorldPosition).setY(0);
      if (this.toTarget.lengthSq() <= 0.000001) {
        this.toTarget.subVectors(this.targetWorld, this.turretWorldPosition).setY(0);
      }
    }

    const desiredYaw = Math.atan2(this.toTarget.x, this.toTarget.z);
    const localDesiredYaw = this.getLocalDesiredYaw(desiredYaw);
    const localDesiredYawWithOffset = localDesiredYaw + this.aimYawOffsetRadians;
    const yawDelta = shortestAngleDelta(this.aimNode.rotation.y, localDesiredYawWithOffset);
    const turnRateMultiplier = THREE.MathUtils.clamp(this.getTurnRateMultiplier?.() ?? 1, 0, 4);
    const maxYawStep = this.turnSpeedRadians * turnRateMultiplier * deltaTime;
    this.aimNode.rotation.y += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);

    const alignedDelta = Math.abs(
      shortestAngleDelta(this.aimNode.rotation.y, localDesiredYawWithOffset)
    );
    if (alignedDelta > this.firingArcRadians * 0.5) {
      return;
    }

    if (!this.autoFire || distanceToTarget > this.fireRange) {
      this.isBurstPrimed = false;
      this.burstWindupSeconds = 0;
      return;
    }

    if (this.fireCooldownSeconds > 0) {
      return;
    }
    if (this.burstCooldownSeconds > 0) {
      return;
    }
    if (!this.isBurstPrimed) {
      this.isBurstPrimed = true;
      this.burstWindupSeconds = randomRange(
        this.burstWindupMinSeconds,
        this.burstWindupMaxSeconds
      );
      return;
    }
    if (this.burstWindupSeconds > 0) {
      return;
    }

    const didFire = this.spawnAlternatingShot();
    const fireIntervalMultiplier = Math.max(1, this.getFireIntervalMultiplier?.() ?? 1);
    this.fireCooldownSeconds = this.getInterleavedShotIntervalSeconds() * fireIntervalMultiplier;
    if (!didFire) {
      return;
    }

    this.shotsRemainingInBurst -= 1;
    if (this.shotsRemainingInBurst <= 0) {
      this.shotsRemainingInBurst = this.burstShotCount;
      this.isBurstPrimed = false;
      this.burstWindupSeconds = 0;
      this.burstCooldownSeconds = randomRange(
        this.burstCooldownMinSeconds,
        this.burstCooldownMaxSeconds
      );
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const projectile of this.projectiles) {
      projectile.dispose?.();
      projectile.object.removeFromParent();
    }
    this.projectiles.length = 0;

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

    this.projectileRoot.clear();
    this.projectileRoot.removeFromParent();
    this.sparkBursts.dispose();
    this.plasmaMuzzleGlobs.dispose();
    this.hitSparkExplosions.dispose();
    this.plasmaHitImplosions.dispose();
    this.root.removeFromParent();
    this.ownedProjectileFactory?.dispose?.();
  }

  private createFallbackBody(): void {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 0.5, 14),
      new THREE.MeshStandardMaterial({
        color: 0x39465d,
        roughness: 0.68,
        metalness: 0.28
      })
    );
    base.position.y = 0.25;
    this.root.add(base);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 0.35, 0.95),
      new THREE.MeshStandardMaterial({
        color: 0x4f5b72,
        roughness: 0.58,
        metalness: 0.34
      })
    );
    head.position.set(0, 0.62, 0);
    this.fallbackAimNode.add(head);
  }

  private createMuzzles(): void {
    for (const muzzleTransform of this.muzzleLocalTransforms) {
      const muzzle = new THREE.Object3D();
      muzzle.position.copy(muzzleTransform.position);
      muzzle.quaternion.copy(muzzleTransform.rotation);
      this.aimNode.add(muzzle);
      this.muzzles.push(muzzle);
    }
  }

  private rebuildMuzzlesForAimNode(
    nextLocalTransforms: readonly MuzzleLocalTransform[] = this.muzzleLocalTransforms
  ): void {
    for (const muzzle of this.muzzles) {
      muzzle.removeFromParent();
    }
    this.muzzles.length = 0;
    this.muzzleLocalTransforms = nextLocalTransforms.map((muzzleTransform) => ({
      position: muzzleTransform.position.clone(),
      rotation: muzzleTransform.rotation.clone()
    }));
    this.createMuzzles();
  }

  private spawnAlternatingShot(): boolean {
    if (this.muzzles.length === 0) {
      return false;
    }
    if (this.consumeShotCost && !this.consumeShotCost()) {
      return false;
    }

    const muzzle = this.muzzles[this.nextMuzzleIndex];
    this.nextMuzzleIndex = (this.nextMuzzleIndex + 1) % this.muzzles.length;

    muzzle.getWorldPosition(this.muzzleWorldPosition);
    this.shotDirection.subVectors(this.aimTargetWorld, this.muzzleWorldPosition);

    if (this.shotDirection.lengthSq() <= 0.000001) {
      this.aimNode.getWorldDirection(this.fallbackForward);
      this.fallbackForward.setY(0);
      if (this.fallbackForward.lengthSq() <= 0.000001) {
        this.fallbackForward.set(0, 0, 1);
      } else {
        this.fallbackForward.normalize();
      }
      this.shotDirection.copy(this.fallbackForward);
    } else {
      this.shotDirection.normalize();
    }

    const targetSpeedFactor = THREE.MathUtils.clamp(
      this.targetVelocityWorld.length() / this.targetSpeedForMaxSpread,
      0,
      1
    );
    const maxSpreadRadians =
      this.horizontalSpreadRadians +
      this.additionalSpreadAtMaxSpeedRadians * targetSpeedFactor;
    if (maxSpreadRadians > 0) {
      const yawSpread = randomRange(-maxSpreadRadians, maxSpreadRadians);
      this.shotDirection.applyAxisAngle(THREE.Object3D.DEFAULT_UP, yawSpread).normalize();
    }

    const projectile = this.projectileFactory.spawn({
      direction: this.shotDirection,
      origin: this.muzzleWorldPosition
    });
    if (projectile.hitbox?.damageType === "Plasma") {
      this.plasmaMuzzleGlobs.spawnBurst(this.muzzleWorldPosition, this.shotDirection);
    } else {
      this.sparkBursts.spawnBurst(this.muzzleWorldPosition, this.shotDirection);
    }

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
        const isPlasmaHit = projectile.hitbox?.damageType === "Plasma";
        if (isPlasmaHit) {
          this.plasmaHitImplosions.spawnImplosion(
            projectile.object.position,
            projectile.hitbox?.collisionArea.radius
          );
        } else {
          projectile.object.getWorldDirection(this.fallbackForward);
          this.hitSparkExplosions.spawnExplosion(projectile.object.position, this.fallbackForward);
        }
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

  private getInterleavedShotIntervalSeconds(): number {
    const gunCount = Math.max(1, this.muzzles.length);
    return this.perGunFireIntervalSeconds / gunCount;
  }

  private updateTargetVelocity(deltaTime: number): void {
    if (!this.hasPreviousTargetWorld || deltaTime <= 0) {
      this.targetVelocityWorld.set(0, 0, 0);
      this.previousTargetWorld.copy(this.targetWorld);
      this.hasPreviousTargetWorld = true;
      return;
    }

    this.targetVelocityWorld
      .subVectors(this.targetWorld, this.previousTargetWorld)
      .multiplyScalar(1 / deltaTime);
    this.previousTargetWorld.copy(this.targetWorld);
  }

  private predictAimTarget(origin: THREE.Vector3): void {
    const distanceToTarget = origin.distanceTo(this.targetWorld);
    const travelTimeSeconds = THREE.MathUtils.clamp(
      distanceToTarget / this.projectileSpeed,
      0,
      2
    );
    this.aimTargetWorld
      .copy(this.targetWorld)
      .addScaledVector(this.targetVelocityWorld, travelTimeSeconds * this.leadFactor);
  }

  private updateAimTargetAtInterval(origin: THREE.Vector3): void {
    if (this.aimUpdateCooldownSeconds > 0) {
      return;
    }

    this.predictAimTarget(origin);
    this.aimUpdateCooldownSeconds = this.aimUpdateIntervalSeconds;
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
        alignModelToGround(model);
        model.position.y += modelHeightOffset;
        this.root.add(model);

        const gunNode = findGunTurretNode(model);
        if (gunNode) {
          this.aimNode = gunNode;
          const socketOffsets = extractSocketLocalOffsets(
            this.aimNode,
            model,
            this.muzzleSocketNames
          );
          if (socketOffsets.length > 0) {
            this.rebuildMuzzlesForAimNode(socketOffsets);
          } else {
            this.rebuildMuzzlesForAimNode();
          }
        }
      },
      undefined,
      (error) => {
        console.warn("Enemy dual laser turret model failed to load.", error);
      }
    );
  }

  private getLocalDesiredYaw(desiredWorldYaw: number): number {
    const aimParent = this.aimNode.parent;
    if (!aimParent) {
      return desiredWorldYaw;
    }

    aimParent.getWorldQuaternion(this.aimNodeParentQuaternion);
    this.aimNodeParentQuaternionInverse.copy(this.aimNodeParentQuaternion).invert();
    this.toTargetLocal.copy(this.toTarget).applyQuaternion(this.aimNodeParentQuaternionInverse).setY(0);

    if (this.toTargetLocal.lengthSq() <= 0.000001) {
      return this.aimNode.rotation.y;
    }

    return Math.atan2(this.toTargetLocal.x, this.toTargetLocal.z);
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

function alignModelToGround(modelRoot: THREE.Object3D): void {
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

function findGunTurretNode(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((node) => {
    if (found) {
      return;
    }

    const normalized = node.name.replace(/\s+/g, "").toLowerCase();
    if (
      normalized.includes("gunturret") ||
      normalized.includes("cannonturret") ||
      normalized === "turret"
    ) {
      found = node;
    }
  });
  return found;
}

function extractSocketLocalOffsets(
  relativeTo: THREE.Object3D,
  model: THREE.Object3D,
  socketNames: readonly string[]
): MuzzleLocalTransform[] {
  const worldPosition = new THREE.Vector3();
  const worldRotation = new THREE.Quaternion();
  const relativeToWorldRotation = new THREE.Quaternion();
  const relativeToWorldRotationInverse = new THREE.Quaternion();
  relativeTo.getWorldQuaternion(relativeToWorldRotation);
  relativeToWorldRotationInverse.copy(relativeToWorldRotation).invert();
  const offsets: MuzzleLocalTransform[] = [];
  for (const socketName of socketNames) {
    const socketNode = findSocketNodeByName(model, socketName);
    if (!socketNode) {
      continue;
    }
    socketNode.getWorldPosition(worldPosition);
    socketNode.getWorldQuaternion(worldRotation);
    offsets.push({
      position: relativeTo.worldToLocal(worldPosition.clone()),
      rotation: relativeToWorldRotationInverse.clone().multiply(worldRotation).normalize()
    });
  }
  return offsets;
}

function findSocketNodeByName(model: THREE.Object3D, socketName: string): THREE.Object3D | null {
  const normalizedTargetName = normalizeSocketName(socketName);
  let found: THREE.Object3D | null = null;
  model.traverse((node) => {
    if (found) {
      return;
    }
    if (normalizeSocketName(node.name) === normalizedTargetName) {
      found = node;
    }
  });
  return found;
}

function normalizeSocketName(name: string): string {
  const compactName = name.replace(/\s+/g, "").toLowerCase();
  if (compactName.length <= 0) {
    return compactName;
  }

  // Blender and DCC exports often append numeric suffixes (e.g. ".001").
  return compactName.replace(/\.\d+$/, "");
}
