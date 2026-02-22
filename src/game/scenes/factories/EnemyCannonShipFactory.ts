import type * as THREE from "three";
import basicEnemyCannonShipModelUrl from "../../../assets/models/Basic-Enemy-Cannon-Ship-v02.glb?url";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import { EnemyCannonShip } from "../../entities/EnemyCannonShip";
import { EnemyCannonShipController } from "../../enemies/EnemyCannonShipController";
import { createBasicEnemyCannonShipArchetype } from "../../enemies/data/EnemyCannonShipStats";
import { getCannonPrimaryComponentDefinition } from "../../weapons/WeaponComponentCatalog";

const enemyLaserboltPrimaryComponent = getCannonPrimaryComponentDefinition("repeating_laserbolt_fire");

export const ROGUE_PILOT_CANNON_SHIP_ARCHETYPE = createBasicEnemyCannonShipArchetype(
  basicEnemyCannonShipModelUrl,
  enemyLaserboltPrimaryComponent.projectile
);

export function createRoguePilotEnemyCannonShip(
  scene: THREE.Scene,
  playerTarget: THREE.Object3D,
  targetHurtboxes: readonly HurtboxComponent[]
): EnemyCannonShipController {
  const archetype = ROGUE_PILOT_CANNON_SHIP_ARCHETYPE;

  const ship = new EnemyCannonShip(
    {
      position: archetype.spawnPosition,
      patrolCenter: archetype.movement.patrolCenter,
      patrolRadius: archetype.movement.patrolRadius,
      patrolSpeed: archetype.movement.patrolSpeed,
      patrolOrbitSpeedRadians: archetype.movement.patrolOrbitSpeedRadians,
      chaseSpeed: archetype.movement.chaseSpeed,
      attackStrafeSpeed: archetype.movement.attackStrafeSpeed,
      preferredAttackDistance: archetype.combat.preferredAttackDistance,
      turnSpeedRadians: archetype.movement.turnSpeedRadians,
      fireArcRadians: archetype.movement.fireArcRadians,
      burstShotCount: archetype.combat.burstShotCount,
      burstShotIntervalSeconds: archetype.combat.burstShotIntervalSeconds,
      burstCooldownSeconds: archetype.combat.burstCooldownSeconds,
      hurtboxRadius: archetype.collision.hurtboxRadius,
      hurtboxLocalOffset: archetype.collision.hurtboxLocalOffset,
      health: archetype.health,
      playerTarget,
      targetHurtboxes,
      projectileOptions: archetype.combat.projectile,
      modelUrl: archetype.visual.modelUrl,
      modelYawOffset: archetype.visual.modelYawOffset,
      modelDesiredSize: archetype.visual.modelDesiredSize,
      modelHeightOffset: archetype.visual.modelHeightOffset
    },
    scene
  );

  return new EnemyCannonShipController({
    ship,
    ai: archetype.ai
  });
}
