import * as THREE from "three";
import basicEnemyCannonShipModelUrl from "../../../assets/models/Basic-Enemy-Cannon-Ship-v02.glb?url";
import plasmaboltModelUrl from "../../../assets/models/Plasmabolt-v01.glb?url";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import { EnemyCannonShip } from "../../entities/EnemyCannonShip";
import { EnemyCannonShipController } from "../../enemies/EnemyCannonShipController";
import {
  createBasicEnemyCannonShipArchetype,
  createPlasmaCannonEnemyShipArchetype,
  type EnemyCannonShipArchetype
} from "../../enemies/data/EnemyCannonShipStats";
import { createCannonPrimaryProjectileFactory } from "../../weapons/CannonProjectileFactoryResolver";
import { getCannonPrimaryComponentDefinition } from "../../weapons/WeaponComponentCatalog";

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
const enemyPlasmaCannonProjectileFactory = createCannonPrimaryProjectileFactory(
  "repeating_plasmabolt_fire",
  {
    faction: "enemy",
    assets: {
      plasmaboltModelUrl
    }
  }
);

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
      projectileFactory: isPlasmaVariant ? enemyPlasmaCannonProjectileFactory : undefined,
      projectileOptions: archetype.combat.projectile,
      muzzleTelegraphOuterColorHex: archetype.combat.projectile.color,
      muzzleTelegraphInnerBaseColorHex:
        archetype.combat.projectile.emissive ?? archetype.combat.projectile.color,
      muzzleTelegraphInnerPeakColorHex: archetype.combat.projectile.color,
      shieldBubbleEffectOptions:
        archetype.id === ROGUE_PILOT_PLASMA_CANNON_SHIP_ARCHETYPE.id
          ? { circularizeXZ: true }
          : undefined,
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

function resolveOppositeHalfEdgeSpawnPosition(
  playerTarget: THREE.Object3D,
  options: {
  arenaCenter: THREE.Vector3;
  arenaEdgeRadius: number;
  playerManeuverSpeed: number;
  }
): THREE.Vector3 {
  const playerWorldPosition = new THREE.Vector3();
  const playerForward = new THREE.Vector3();
  playerTarget.getWorldPosition(playerWorldPosition);
  const toPlayer = new THREE.Vector3(
    playerWorldPosition.x - options.arenaCenter.x,
    0,
    playerWorldPosition.z - options.arenaCenter.z
  );

  let referenceAngle: number;
  if (toPlayer.lengthSq() > 0.000001) {
    referenceAngle = Math.atan2(toPlayer.x, toPlayer.z);
  } else {
    // If the player is at the center, use facing direction as the reference side.
    playerTarget.getWorldDirection(playerForward);
    playerForward.setY(0);
    if (playerForward.lengthSq() <= 0.000001) {
      referenceAngle = Math.random() * Math.PI * 2;
    } else {
      playerForward.normalize();
      referenceAngle = Math.atan2(playerForward.x, playerForward.z);
    }
  }

  const oppositeCenterAngle = referenceAngle + Math.PI;
  const spawnAngle = oppositeCenterAngle + randomRange(-Math.PI * 0.5, Math.PI * 0.5);
  return new THREE.Vector3(
    options.arenaCenter.x + Math.sin(spawnAngle) * options.arenaEdgeRadius,
    playerWorldPosition.y,
    options.arenaCenter.z + Math.cos(spawnAngle) * options.arenaEdgeRadius
  );
}

function randomRange(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
