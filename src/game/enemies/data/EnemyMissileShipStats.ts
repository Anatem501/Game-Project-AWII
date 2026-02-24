import * as THREE from "three";
import type { HealthConfig } from "../../components/HealthComponent";
import type { EnemyShipAiConfig } from "../ai/EnemyShipAiTypes";
import type { EnemyMissileShipConfig } from "../../entities/EnemyMissileShip";

export type EnemyMissileShipArchetype = {
  id: string;
  displayName: string;
  respawnSeconds: number;
  health: HealthConfig;
  ai: EnemyShipAiConfig;
  ship: Omit<EnemyMissileShipConfig, "health" | "playerTarget" | "targetHurtboxes" | "position" | "patrolCenter">;
};

export function createBasicEnemyMissileShipArchetype(
  modelUrl?: string
): EnemyMissileShipArchetype {
  const preferredAttackDistance = 27;
  return {
    id: "basic_enemy_missile_ship",
    displayName: "Basic Enemy Missile Ship",
    respawnSeconds: 8,
    health: {
      maxArmor: 55,
      maxHull: 110,
      maxShield: 0,
      shieldChargeRate: 0,
      armorRepairRate: 0,
      hullRepairRate: 0
    },
    ai: {
      spawnDurationSeconds: 0.55,
      passiveSensorRange: 54,
      passiveSensorLoseRange: 66,
      preferredAttackDistance,
      aimVisionRange: 39,
      aimVisionFovRadians: THREE.MathUtils.degToRad(70),
      evadeRearThreatRange: 34,
      evadeCooldownSeconds: 6,
      patrolEvadeChance01: 0.2,
      patrolEvadeRearBonusChance01: 0.2,
      engageEvadeChance01: 0.6,
      engageEvadeRearBonusChance01: 0.2,
      searchEvadeChance01: 0.2,
      searchEvadeRearBonusChance01: 0.2,
      evadeDurationSeconds: 3,
      evadeStrafeSwitchCountMin: 1,
      evadeStrafeSwitchCountMax: 3,
      evadeInitialStrafeSwitchIntervalMinSeconds: 0.25,
      evadeInitialStrafeSwitchIntervalMaxSeconds: 0.7,
      evadeStrafeSwitchIntervalMinSeconds: 0.35,
      evadeStrafeSwitchIntervalMaxSeconds: 0.9,
      searchHoldSeconds: 2,
      circleDurationSeconds: 1.9
    },
    ship: {
      patrolPattern: "center_pass_edge",
      patrolRadius: 12,
      patrolSpeed: 4.4,
      patrolOrbitSpeedRadians: 0.35,
      attackSpeed: 5.4,
      fleeSpeed: 6.1,
      preferredAttackDistance,
      turnSpeedRadians: THREE.MathUtils.degToRad(150),
      fireArcRadians: THREE.MathUtils.degToRad(16),
      aimLeadFactor: 0.92,
      projectileSpeedForLead: 13,
      swarmAttackCooldownSeconds: 2.35,
      homingAttackCooldownSeconds: 32,
      homingLockSeconds: 2.5,
      generalAttackCooldownSeconds: 2.5,
      swarmAttackHeatCost: 1.6,
      homingAttackHeatCost: 4.2,
      magazineCapacity: 16,
      reloadSeconds: 8,
      resourceConfig: {
        maxHeat: 12,
        heatDissipationPerSecond: 1.9,
        heatDissipationDelaySeconds: 0.6,
        maxEnergy: 0,
        energyRechargePerSecond: 0
      },
      swarmMissileProjectile: {
        speed: 10,
        lifetimeSeconds: 4.5,
        damage: 12,
        collisionRadius: 0.28,
        splineWildness: 0.9,
        reticleScatterRadius: 1.1
      },
      homingMissileProjectile: {
        speed: 13,
        lifetimeSeconds: 3.1,
        damage: 22,
        collisionRadius: 0.34,
        homingTurnRateRadians: THREE.MathUtils.degToRad(32)
      },
      hurtboxRadius: 1.65,
      hurtboxLocalOffset: new THREE.Vector3(0, 1.0, 0),
      modelUrl,
      modelYawOffset: Math.PI,
      modelDesiredSize: 2.05,
      modelHeightOffset: 0
    }
  };
}
