import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  createHealthComponent,
  type DamageBreakdown,
  type DamageType,
  type HealthComponent,
  type HealthConfig,
  type HealthSnapshot
} from "../components/HealthComponent";

export type EnemyShipConfig = {
  health: HealthConfig;
  position?: THREE.Vector3;
  modelUrl?: string;
  modelYawOffset?: number;
  autoRemoveOnDestroyed?: boolean;
};

export class EnemyShip {
  readonly root: THREE.Group;

  private readonly scene: THREE.Scene;
  private readonly health: HealthComponent;
  private autoRemoveOnDestroyed: boolean;
  private disposed = false;

  constructor(private readonly config: EnemyShipConfig, scene: THREE.Scene) {
    this.scene = scene;
    this.health = createHealthComponent(config.health);
    this.autoRemoveOnDestroyed = config.autoRemoveOnDestroyed ?? true;

    this.root = new THREE.Group();
    this.root.position.copy(config.position ?? new THREE.Vector3());
    this.scene.add(this.root);

    this.createFallbackBody();
    this.loadOptionalModel(config.modelUrl, config.modelYawOffset ?? 0);
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }

    this.health.update(deltaTime);

    if (this.health.getSnapshot().destroyed && this.autoRemoveOnDestroyed) {
      this.dispose();
    }
  }

  applyDamage(amount: number, damageType?: DamageType): DamageBreakdown {
    return this.health.applyDamage(amount, damageType);
  }

  getHealthSnapshot(): HealthSnapshot {
    return this.health.getSnapshot();
  }

  isDestroyed(): boolean {
    return this.health.getSnapshot().destroyed;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

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
  }

  private createFallbackBody(): void {
    const hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.6, 1.4, 4, 10),
      new THREE.MeshStandardMaterial({
        color: 0x5c6274,
        roughness: 0.7,
        metalness: 0.25
      })
    );
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 0.75;
    this.root.add(hull);
  }

  private loadOptionalModel(modelUrl: string | undefined, modelYawOffset: number): void {
    if (!modelUrl) {
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = modelYawOffset;
        normalizeModel(model, 2.1);
        alignModelToGround(model);
        this.root.add(model);
      },
      undefined,
      (error) => {
        console.warn("Enemy ship model failed to load. Using fallback body.", error);
      }
    );
  }
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
