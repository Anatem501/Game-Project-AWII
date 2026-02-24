import * as THREE from "three";
import { resolveHitboxAgainstHurtboxes } from "../../components/combat/HitboxHurtboxCollision";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import { createFrostHitCrystalBurstSystem } from "../../effects/FrostHitCrystalBurstSystem";
import { createIonHitElectricBurstSystem } from "../../effects/IonHitElectricBurstSystem";
import { createLaserHitSparkExplosionSystem } from "../../effects/LaserHitSparkExplosionSystem";
import { createPlasmaHitImplosionSystem } from "../../effects/PlasmaHitImplosionSystem";
import { createVoidHitVortexSystem } from "../../effects/VoidHitVortexSystem";
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
  private readonly hitSparkExplosions: ReturnType<typeof createLaserHitSparkExplosionSystem>;
  private readonly ionHitBursts: ReturnType<typeof createIonHitElectricBurstSystem>;
  private readonly frostHitBursts: ReturnType<typeof createFrostHitCrystalBurstSystem>;
  private readonly plasmaHitImplosions: ReturnType<typeof createPlasmaHitImplosionSystem>;
  private readonly voidHitVortices: ReturnType<typeof createVoidHitVortexSystem>;
  private readonly fallbackForward = new THREE.Vector3(0, 0, 1);

  constructor(config: EnemyProjectileRuntimeConfig) {
    this.projectileFactory = config.projectileFactory;
    this.targetHurtboxes = config.targetHurtboxes;
    this.root.name = config.rootName ?? "enemy-projectiles";
    config.scene.add(this.root);
    this.hitSparkExplosions = createLaserHitSparkExplosionSystem(config.scene);
    this.ionHitBursts = createIonHitElectricBurstSystem(config.scene);
    this.frostHitBursts = createFrostHitCrystalBurstSystem(config.scene);
    this.plasmaHitImplosions = createPlasmaHitImplosionSystem(config.scene);
    this.voidHitVortices = createVoidHitVortexSystem(config.scene);
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
        this.spawnHitEffect(projectile);
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

    this.hitSparkExplosions.update(deltaTime);
    this.ionHitBursts.update(deltaTime);
    this.frostHitBursts.update(deltaTime);
    this.plasmaHitImplosions.update(deltaTime);
    this.voidHitVortices.update(deltaTime);
  }

  getActiveCount(): number {
    return this.projectiles.length;
  }

  dispose(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      this.disposeProjectileAtIndex(i);
    }
    this.projectiles.length = 0;
    this.hitSparkExplosions.dispose();
    this.ionHitBursts.dispose();
    this.frostHitBursts.dispose();
    this.plasmaHitImplosions.dispose();
    this.voidHitVortices.dispose();
    this.root.clear();
    this.root.removeFromParent();
  }

  private spawnHitEffect(projectile: ProjectileInstance): void {
    const damageType = projectile.hitbox?.damageType;
    const effectScale = Math.max(0.1, projectile.effectScale ?? 1);
    if (damageType === "Plasma") {
      this.plasmaHitImplosions.spawnImplosion(
        projectile.object.position,
        projectile.hitbox?.collisionArea.radius
      );
      return;
    }

    projectile.object.getWorldDirection(this.fallbackForward);
    if (this.fallbackForward.lengthSq() <= 0.000001) {
      this.fallbackForward.set(0, 0, 1);
    } else {
      this.fallbackForward.normalize();
    }

    if (damageType === "Ion") {
      this.ionHitBursts.spawnBurst(projectile.object.position, this.fallbackForward, effectScale);
      return;
    }
    if (damageType === "Frost") {
      this.frostHitBursts.spawnBurst(projectile.object.position, this.fallbackForward, effectScale);
      return;
    }
    if (damageType === "Void") {
      this.voidHitVortices.spawnVortex(
        projectile.object.position,
        this.fallbackForward,
        projectile.hitbox?.collisionArea.radius
      );
      return;
    }
    this.hitSparkExplosions.spawnExplosion(projectile.object.position, this.fallbackForward);
  }

  private disposeProjectileAtIndex(index: number): void {
    const projectile = this.projectiles[index];
    projectile.object.removeFromParent();
    projectile.dispose?.();
    this.projectiles.splice(index, 1);
  }
}
