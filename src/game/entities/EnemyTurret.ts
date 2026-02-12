import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type {
  ProjectileFactory,
  ProjectileInstance
} from "../controllers/projectiles/ProjectileTypes";

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1);

export type EnemyTurretConfig = {
  fireIntervalSeconds?: number;
  detectionRange?: number;
  fireRange?: number;
  turnSpeedRadians?: number;
  firingArcRadians?: number;
  localPosition?: THREE.Vector3;
  muzzleLocalOffset?: THREE.Vector3;
  modelUrl?: string;
  modelYawOffset?: number;
  modelDesiredSize?: number;
  autoFire?: boolean;
  playerTarget?: THREE.Object3D | null;
  projectileFactory: ProjectileFactory;
};

export class EnemyTurret {
  readonly root: THREE.Group;

  private readonly projectileFactory: ProjectileFactory;
  private readonly projectileRoot: THREE.Group;
  private readonly muzzle: THREE.Object3D;
  private readonly fireIntervalSeconds: number;
  private readonly detectionRange: number;
  private readonly fireRange: number;
  private readonly turnSpeedRadians: number;
  private readonly firingArcRadians: number;
  private readonly autoFire: boolean;

  private readonly turretWorldPosition = new THREE.Vector3();
  private readonly muzzleWorldPosition = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly fallbackForward = new THREE.Vector3();
  private readonly shotDirection = new THREE.Vector3();
  private readonly targetWorld = new THREE.Vector3();
  private readonly projectiles: ProjectileInstance[] = [];

  private playerTarget: THREE.Object3D | null = null;
  private detectedPlayer = false;
  private fireCooldownSeconds = 0;

  constructor(parent: THREE.Object3D, projectileRoot: THREE.Group, config: EnemyTurretConfig) {
    this.projectileFactory = config.projectileFactory;
    this.projectileRoot = projectileRoot;
    this.fireIntervalSeconds = Math.max(0.001, config.fireIntervalSeconds ?? 0.6);
    this.detectionRange = Math.max(0, config.detectionRange ?? 20);
    this.fireRange = Math.max(0, config.fireRange ?? 18);
    this.turnSpeedRadians = Math.max(0, config.turnSpeedRadians ?? THREE.MathUtils.degToRad(150));
    this.firingArcRadians = THREE.MathUtils.clamp(
      config.firingArcRadians ?? THREE.MathUtils.degToRad(22),
      0,
      Math.PI
    );
    this.autoFire = config.autoFire ?? true;
    this.playerTarget = config.playerTarget ?? null;

    this.root = new THREE.Group();
    this.root.position.copy(config.localPosition ?? new THREE.Vector3(0, 0.3, 0));
    parent.add(this.root);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.26, 0.24, 12),
      new THREE.MeshStandardMaterial({
        color: 0x2f3f58,
        roughness: 0.65,
        metalness: 0.25
      })
    );
    body.rotation.x = Math.PI / 2;
    this.root.add(body);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(config.muzzleLocalOffset ?? new THREE.Vector3(0, 0.05, 0.72));
    this.root.add(this.muzzle);

    if (config.modelUrl) {
      this.loadOptionalModel(config.modelUrl, config.modelYawOffset ?? 0, config.modelDesiredSize ?? 1.1);
    }
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.playerTarget = target;
  }

  isPlayerDetected(): boolean {
    return this.detectedPlayer;
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }

    this.updateProjectiles(deltaTime);
    this.fireCooldownSeconds = Math.max(0, this.fireCooldownSeconds - deltaTime);

    if (!this.playerTarget) {
      this.detectedPlayer = false;
      return;
    }

    this.playerTarget.getWorldPosition(this.targetWorld);

    this.root.getWorldPosition(this.turretWorldPosition);
    this.toTarget.subVectors(this.targetWorld, this.turretWorldPosition).setY(0);
    const distanceToTarget = this.toTarget.length();
    this.detectedPlayer =
      distanceToTarget > 0.0001 && distanceToTarget <= this.detectionRange;
    if (!this.detectedPlayer) {
      return;
    }

    const desiredYaw = Math.atan2(this.toTarget.x, this.toTarget.z);
    const yawDelta = shortestAngleDelta(this.root.rotation.y, desiredYaw);
    const maxYawStep = this.turnSpeedRadians * deltaTime;
    this.root.rotation.y += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);

    const alignedDelta = Math.abs(shortestAngleDelta(this.root.rotation.y, desiredYaw));
    if (alignedDelta > this.firingArcRadians * 0.5) {
      return;
    }

    if (!this.autoFire || distanceToTarget > this.fireRange) {
      return;
    }

    if (this.fireCooldownSeconds > 0) {
      return;
    }

    this.spawnShot();
    this.fireCooldownSeconds = this.fireIntervalSeconds;
  }

  dispose(): void {
    for (const projectile of this.projectiles) {
      projectile.dispose?.();
      projectile.object.removeFromParent();
    }
    this.projectiles.length = 0;
    this.root.removeFromParent();
  }

  private spawnShot(): void {
    this.muzzle.getWorldPosition(this.muzzleWorldPosition);
    this.shotDirection.subVectors(this.targetWorld, this.muzzleWorldPosition);

    if (this.shotDirection.lengthSq() <= 0.000001) {
      this.root.getWorldDirection(this.fallbackForward);
      this.fallbackForward.setY(0);
      if (this.fallbackForward.lengthSq() <= 0.000001) {
        this.fallbackForward.copy(FORWARD_AXIS);
      } else {
        this.fallbackForward.normalize();
      }
      this.shotDirection.copy(this.fallbackForward);
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
  }

  private updateProjectiles(deltaTime: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      if (projectile.update(deltaTime)) {
        continue;
      }

      projectile.object.removeFromParent();
      projectile.dispose?.();
      this.projectiles.splice(i, 1);
    }
  }

  private loadOptionalModel(modelUrl: string, modelYawOffset: number, desiredSize: number): void {
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = modelYawOffset;
        normalizeModel(model, desiredSize);
        alignModelToGround(model);
        this.root.add(model);
      },
      undefined,
      (error) => {
        console.warn("Enemy turret model failed to load. Using fallback body.", error);
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

function alignModelToGround(modelRoot: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  modelRoot.position.y -= bounds.min.y;
}
