import * as THREE from "three";
import type { HealthConfig } from "../../components/HealthComponent";
import type { ShipResourceConfig } from "../../components/ShipResourceComponent";
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
  burstTelegraphSeconds: number;
  burstShotIntervalSeconds: number;
  burstCooldownSeconds: number;
  primaryShotHeatCost: number;
  primaryAttackHeatCost?: number;
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
  resource?: ShipResourceConfig;
  ai: EnemyShipAiConfig;
  movement: EnemyCannonShipMovementStats;
  combat: EnemyCannonShipCombatStats;
  visual: EnemyCannonShipVisualStats;
  collision: EnemyCannonShipCollisionStats;
};

export const BASIC_CANNON_SHIP_ARCHETYPE_ID = "basic_enemy_cannon_ship";
export const PLASMA_CANNON_SHIP_ARCHETYPE_ID = "plasma_cannon_enemy_ship";

export function createBasicEnemyCannonShipArchetype(
  modelUrl: string,
  projectile: LaserBoltFactoryOptions
): EnemyCannonShipArchetype {
  const spawnPosition = new THREE.Vector3(20, -1, -6);
  const preferredAttackDistance = 15;
  return {
    id: BASIC_CANNON_SHIP_ARCHETYPE_ID,
    displayName: "Basic Enemy Cannon Ship",
    spawnPosition,
    respawnSeconds: 5,
    health: {
      maxArmor: 0,
      maxHull: 150,
      maxShield: 0,
      shieldChargeRate: 0,
      armorRepairRate: 0,
      hullRepairRate: 0
    },
    resource: {
      maxHeat: 14,
      heatDissipationPerSecond: 3.1,
      heatDissipationDelaySeconds: 0.5,
      maxEnergy: 0,
      energyRechargePerSecond: 0
    },
    ai: {
      spawnDurationSeconds: 0.45,
      passiveSensorRange: 34,
      passiveSensorLoseRange: 44,
      preferredAttackDistance,
      aimVisionRange: 26,
      aimVisionFovRadians: THREE.MathUtils.degToRad(95),
      evadeRearThreatRange: 24,
      evadeCooldownSeconds: 6,
      patrolEvadeChance01: 0.2,
      patrolEvadeRearBonusChance01: 0.2,
      engageEvadeChance01: 0.6,
      engageEvadeRearBonusChance01: 0.2,
      flybyEvadeChance01: 0.6,
      flybyEvadeRearBonusChance01: 0.2,
      searchEvadeChance01: 0.2,
      searchEvadeRearBonusChance01: 0.2,
      flybyDurationSeconds: 2.8,
      flybyTurnbackThresholdSeconds: 1,
      evadeDurationSeconds: 3,
      evadeStrafeSwitchCountMin: 1,
      evadeStrafeSwitchCountMax: 4,
      evadeInitialStrafeSwitchIntervalMinSeconds: 0.25,
      evadeInitialStrafeSwitchIntervalMaxSeconds: 0.8,
      evadeStrafeSwitchIntervalMinSeconds: 0.35,
      evadeStrafeSwitchIntervalMaxSeconds: 0.95,
      searchHoldSeconds: 2
    },
    movement: {
      patrolCenter: spawnPosition.clone(),
      patrolRadius: 9,
      patrolSpeed: 8.5,
      patrolOrbitSpeedRadians: 0.6,
      chaseSpeed: 13,
      attackStrafeSpeed: 9.5,
      turnSpeedRadians: THREE.MathUtils.degToRad(180),
      fireArcRadians: THREE.MathUtils.degToRad(20)
    },
    combat: {
      preferredAttackDistance,
      burstShotCount: 4,
      burstTelegraphSeconds: 0.45,
      burstShotIntervalSeconds: 0.14,
      burstCooldownSeconds: 1.85,
      primaryShotHeatCost: 1.35,
      projectile: {
        ...projectile,
        faction: "enemy"
      }
    },
    visual: {
      modelUrl,
      modelYawOffset: Math.PI,
      modelDesiredSize: 1.68
    },
    collision: {
      hurtboxRadius: 1.45,
      hurtboxLocalOffset: new THREE.Vector3(0, 1.05, 0)
    }
  };
}

export function createPlasmaCannonEnemyShipArchetype(
  modelUrl: string,
  projectile: LaserBoltFactoryOptions
): EnemyCannonShipArchetype {
  const base = createBasicEnemyCannonShipArchetype(modelUrl, projectile);
  return {
    ...base,
    id: PLASMA_CANNON_SHIP_ARCHETYPE_ID,
    displayName: "Plasma Cannon Enemy Ship",
    respawnSeconds: 7,
    health: {
      ...base.health,
      maxShield: 60,
      shieldChargeRate: 2,
      shieldRechargeDelaySeconds: 20,
      maxHull: 80,
      maxArmor: 0
    },
    resource: {
      maxHeat: 20,
      heatDissipationPerSecond: 1,
      heatDissipationDelaySeconds: 12,
      maxEnergy: 0,
      energyRechargePerSecond: 0
    },
    ai: {
      ...base.ai,
      aimVisionRange: 30,
      preferredAttackDistance: base.ai.preferredAttackDistance + 2
    },
    movement: {
      ...base.movement,
      fireArcRadians: THREE.MathUtils.degToRad(18)
    },
    combat: {
      ...base.combat,
      preferredAttackDistance: base.combat.preferredAttackDistance + 2,
      burstTelegraphSeconds: 0.5,
      burstCooldownSeconds: 2.2,
      primaryShotHeatCost: 0,
      primaryAttackHeatCost: 7,
      projectile: {
        ...projectile,
        faction: "enemy"
      }
    }
  };
}
