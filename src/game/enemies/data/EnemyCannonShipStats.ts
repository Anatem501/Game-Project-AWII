import * as THREE from "three";
import type { HealthConfig } from "../../components/HealthComponent";
import type { LaserBoltFactoryOptions } from "../../controllers/projectiles/LaserBoltFactory";
import type { EnemyShipAiConfig } from "../ai/EnemyShipAiTypes";

export type EnemyCannonShipMovementStats = {
  patrolCenter: THREE.Vector3;
  patrolRadius: number;
  patrolSpeed: number;
  patrolOrbitSpeedRadians: number;
  chaseSpeed: number;
  attackStrafeSpeed: number;
  turnSpeedRadians: number;
  fireArcRadians: number;
};

export type EnemyCannonShipCombatStats = {
  preferredAttackDistance: number;
  burstShotCount: number;
  burstShotIntervalSeconds: number;
  burstCooldownSeconds: number;
  projectile: LaserBoltFactoryOptions;
};

export type EnemyCannonShipVisualStats = {
  modelUrl: string;
  modelYawOffset: number;
  modelDesiredSize: number;
  modelHeightOffset?: number;
};

export type EnemyCannonShipCollisionStats = {
  hurtboxRadius: number;
  hurtboxLocalOffset: THREE.Vector3;
};

export type EnemyCannonShipArchetype = {
  id: string;
  displayName: string;
  spawnPosition: THREE.Vector3;
  respawnSeconds: number;
  health: HealthConfig;
  ai: EnemyShipAiConfig;
  movement: EnemyCannonShipMovementStats;
  combat: EnemyCannonShipCombatStats;
  visual: EnemyCannonShipVisualStats;
  collision: EnemyCannonShipCollisionStats;
};

export const BASIC_CANNON_SHIP_ARCHETYPE_ID = "basic_enemy_cannon_ship";

export function createBasicEnemyCannonShipArchetype(
  modelUrl: string,
  projectile: LaserBoltFactoryOptions
): EnemyCannonShipArchetype {
  const spawnPosition = new THREE.Vector3(20, -1, -6);
  const preferredAttackDistance = 15;
  const attackRange = 19;
  return {
    id: BASIC_CANNON_SHIP_ARCHETYPE_ID,
    displayName: "Basic Enemy Cannon Ship",
    spawnPosition,
    respawnSeconds: 5,
    health: {
      maxArmor: 40,
      maxHull: 80,
      maxShield: 0,
      shieldChargeRate: 0,
      armorRepairRate: 0,
      hullRepairRate: 0
    },
    ai: {
      spawnDurationSeconds: 0.45,
      detectionRange: 34,
      loseTargetRange: 44,
      attackRange,
      attackDisengageRangeMultiplier: 1.15,
      preferredAttackDistance
    },
    movement: {
      patrolCenter: spawnPosition.clone(),
      patrolRadius: 9,
      patrolSpeed: 6,
      patrolOrbitSpeedRadians: 0.6,
      chaseSpeed: 10,
      attackStrafeSpeed: 7,
      turnSpeedRadians: THREE.MathUtils.degToRad(180),
      fireArcRadians: THREE.MathUtils.degToRad(20)
    },
    combat: {
      preferredAttackDistance,
      burstShotCount: 3,
      burstShotIntervalSeconds: 0.14,
      burstCooldownSeconds: 1.85,
      projectile: {
        ...projectile,
        faction: "enemy"
      }
    },
    visual: {
      modelUrl,
      modelYawOffset: Math.PI,
      modelDesiredSize: 2.8
    },
    collision: {
      hurtboxRadius: 1.45,
      hurtboxLocalOffset: new THREE.Vector3(0, 1.05, 0)
    }
  };
}
