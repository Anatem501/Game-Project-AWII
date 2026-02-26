import * as THREE from "three";
import basicEnemyCannonShipModelUrl from "../../../assets/models/Basic-Enemy-Cannon-Ship-v02.glb?url";
import plasmaboltModelUrl from "../../../assets/models/Plasmabolt-v01.glb?url";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import type { ProjectileFactory } from "../../controllers/projectiles/ProjectileTypes";
import { EnemyCannonShip } from "../../entities/EnemyCannonShip";
import { EnemyCannonShipController } from "../../enemies/EnemyCannonShipController";
import {
  createBasicEnemyCannonShipArchetype,
  createPlasmaCannonEnemyShipArchetype,
  type EnemyCannonShipArchetype
} from "../../enemies/data/EnemyCannonShipStats";
import { createCannonPrimaryProjectileFactory } from "../../weapons/CannonProjectileFactoryResolver";
import { getCannonPrimaryComponentDefinition } from "../../weapons/WeaponComponentCatalog";
import { resolveOppositeHalfEdgeSpawnPosition } from "./EnemySpawnFactoryUtils";

const enemyLaserboltPrimaryComponent = getCannonPrimaryComponentDefinition("repeating_laserbolt_fire");
const enemyPlasmaboltPrimaryComponent = getCannonPrimaryComponentDefinition("repeating_plasmabolt_fire");

export const ROGUE_PILOT_CANNON_SHIP_ARCHETYPE = createBasicEnemyCannonShipArchetype(
  basicEnemyCannonShipModelUrl,
  enemyLaserboltPrimaryComponent.projectile
);
export const ROGUE_PILOT_PLASMA_CANNON_SHIP_ARCHETYPE = createPlasmaCannonEnemyShipArchetype(
  basicEnemyCannonShipModelUrl,
  enemyPlasmaboltPrimaryComponent.projectile
);
let enemyPlasmaCannonProjectileFactory: ProjectileFactory | null = null;

export function createRoguePilotEnemyCannonShip(
  scene: THREE.Scene,
  playerTarget: THREE.Object3D,
  targetHurtboxes: readonly HurtboxComponent[],
  options: {
    arenaCenter: THREE.Vector3;
    arenaEdgeRadius: number;
    playerManeuverSpeed: number;
  }
): EnemyCannonShipController {
  return createRoguePilotEnemyCannonShipFromArchetype(
    ROGUE_PILOT_CANNON_SHIP_ARCHETYPE,
    scene,
    playerTarget,
    targetHurtboxes,
    options
  );
}

export function createRoguePilotEnemyPlasmaCannonShip(
  scene: THREE.Scene,
  playerTarget: THREE.Object3D,
  targetHurtboxes: readonly HurtboxComponent[],
  options: {
    arenaCenter: THREE.Vector3;
    arenaEdgeRadius: number;
    playerManeuverSpeed: number;
  }
): EnemyCannonShipController {
  return createRoguePilotEnemyCannonShipFromArchetype(
    ROGUE_PILOT_PLASMA_CANNON_SHIP_ARCHETYPE,
    scene,
    playerTarget,
    targetHurtboxes,
    options
  );
}

function createRoguePilotEnemyCannonShipFromArchetype(
  archetype: EnemyCannonShipArchetype,
  scene: THREE.Scene,
  playerTarget: THREE.Object3D,
  targetHurtboxes: readonly HurtboxComponent[],
  options: {
    arenaCenter: THREE.Vector3;
    arenaEdgeRadius: number;
    playerManeuverSpeed: number;
  }
): EnemyCannonShipController {
  const spawnPosition = resolveOppositeHalfEdgeSpawnPosition(playerTarget, options);
  const playerManeuverSpeed = Math.max(0.001, options.playerManeuverSpeed);
  const isPlasmaVariant = archetype.id === ROGUE_PILOT_PLASMA_CANNON_SHIP_ARCHETYPE.id;

  const ship = new EnemyCannonShip(
    {
      position: spawnPosition,
      patrolCenter: options.arenaCenter,
      patrolPattern: "center_pass_edge",
      patrolRadius: archetype.movement.patrolRadius,
      patrolEdgeRadius: options.arenaEdgeRadius,
      patrolCenterPassOffsetMin: 5,
      patrolCenterPassOffsetMax: 14,
      patrolSpeed: playerManeuverSpeed,
      patrolOrbitSpeedRadians: archetype.movement.patrolOrbitSpeedRadians,
      chaseSpeed: playerManeuverSpeed,
      attackStrafeSpeed: playerManeuverSpeed,
      preferredAttackDistance: archetype.combat.preferredAttackDistance,
      turnSpeedRadians: archetype.movement.turnSpeedRadians,
      fireArcRadians: archetype.movement.fireArcRadians,
      burstShotCount: archetype.combat.burstShotCount,
      burstTelegraphSeconds: archetype.combat.burstTelegraphSeconds,
      burstShotIntervalSeconds: archetype.combat.burstShotIntervalSeconds,
      burstCooldownSeconds: archetype.combat.burstCooldownSeconds,
      primaryShotHeatCost: archetype.combat.primaryShotHeatCost,
      primaryAttackHeatCost: archetype.combat.primaryAttackHeatCost,
      hurtboxRadius: archetype.collision.hurtboxRadius,
      hurtboxLocalOffset: archetype.collision.hurtboxLocalOffset,
      health: archetype.health,
      resourceConfig: archetype.resource,
      playerTarget,
      targetHurtboxes,
      projectileFactory: isPlasmaVariant ? getEnemyPlasmaCannonProjectileFactory() : undefined,
      projectileOptions: archetype.combat.projectile,
      muzzleTelegraphOuterColorHex: archetype.combat.projectile.color,
      muzzleTelegraphInnerBaseColorHex:
        archetype.combat.projectile.emissive ?? archetype.combat.projectile.color,
      muzzleTelegraphInnerPeakColorHex: archetype.combat.projectile.color,
      shieldBubbleEffectOptions: isPlasmaVariant ? { circularizeXZ: true } : undefined,
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

export function disposeEnemyCannonShipFactoryResources(): void {
  enemyPlasmaCannonProjectileFactory?.dispose?.();
  enemyPlasmaCannonProjectileFactory = null;
}

function getEnemyPlasmaCannonProjectileFactory(): ProjectileFactory {
  if (enemyPlasmaCannonProjectileFactory) {
    return enemyPlasmaCannonProjectileFactory;
  }

  enemyPlasmaCannonProjectileFactory = createCannonPrimaryProjectileFactory(
    "repeating_plasmabolt_fire",
    {
      faction: "enemy",
      assets: {
        plasmaboltModelUrl
      }
    }
  );
  return enemyPlasmaCannonProjectileFactory;
}
