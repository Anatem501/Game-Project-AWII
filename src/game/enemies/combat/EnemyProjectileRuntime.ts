import * as THREE from "three";
import { resolveHitboxAgainstHurtboxes } from "../../components/combat/HitboxHurtboxCollision";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import type {
  ProjectileFactory,
  ProjectileInstance
} from "../../controllers/projectiles/ProjectileTypes";

export type EnemyProjectileRuntimeConfig = {
  scene: THREE.Scene;
  projectileFactory: ProjectileFactory;
  targetHurtboxes: readonly HurtboxComponent[];
  rootName?: string;
};

export class EnemyProjectileRuntime {
  readonly root = new THREE.Group();

  private readonly projectileFactory: ProjectileFactory;
  private readonly targetHurtboxes: readonly HurtboxComponent[];
  private readonly projectiles: ProjectileInstance[] = [];

  constructor(config: EnemyProjectileRuntimeConfig) {
    this.projectileFactory = config.projectileFactory;
    this.targetHurtboxes = config.targetHurtboxes;
    this.root.name = config.rootName ?? "enemy-projectiles";
    config.scene.add(this.root);
  }

  spawn(origin: THREE.Vector3, direction: THREE.Vector3): ProjectileInstance {
    const projectile = this.projectileFactory.spawn({ origin, direction });
    projectile.object.removeFromParent();
    this.root.add(projectile.object);
    this.projectiles.push(projectile);
    return projectile;
  }

  update(deltaTime: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = this.projectiles[i];
      const collision = resolveHitboxAgainstHurtboxes(projectile.hitbox, this.targetHurtboxes);
      if (collision) {
        if (projectile.beginDestroy?.("collision")) {
          continue;
        }
        this.disposeProjectileAtIndex(i);
        continue;
      }

      if (projectile.update(deltaTime)) {
        continue;
      }

      if (projectile.beginDestroy?.("expired")) {
        continue;
      }
      this.disposeProjectileAtIndex(i);
    }
  }

  getActiveCount(): number {
    return this.projectiles.length;
  }

  dispose(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      this.disposeProjectileAtIndex(i);
    }
    this.projectiles.length = 0;
    this.root.clear();
    this.root.removeFromParent();
  }

  private disposeProjectileAtIndex(index: number): void {
    const projectile = this.projectiles[index];
    projectile.object.removeFromParent();
    projectile.dispose?.();
    this.projectiles.splice(index, 1);
  }
}
