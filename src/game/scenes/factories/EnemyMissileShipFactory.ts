import * as THREE from "three";
import basicEnemyMissileShipModelUrl from "../../../assets/models/Basic-Enemy-Missile-Ship-v01.glb?url";
import microConcussiveMissileModelUrl from "../../../assets/models/Micro-Concussive-Missile-v01.glb?url";
import standardConcussiveMissileModelUrl from "../../../assets/models/Standard-Concussive-Missile-v01.glb?url";
import type { HurtboxComponent } from "../../components/combat/HurtboxComponent";
import { EnemyMissileShip } from "../../entities/EnemyMissileShip";
import { EnemyMissileShipController } from "../../enemies/EnemyMissileShipController";
import {
  createBasicEnemyMissileShipArchetype,
  type EnemyMissileShipArchetype
} from "../../enemies/data/EnemyMissileShipStats";
import { resolveOppositeHalfEdgeSpawnPosition } from "./EnemySpawnFactoryUtils";

export const ROGUE_PILOT_MISSILE_SHIP_ARCHETYPE: EnemyMissileShipArchetype =
  createBasicEnemyMissileShipArchetype(basicEnemyMissileShipModelUrl);

export function createRoguePilotEnemyMissileShip(
  scene: THREE.Scene,
  playerTarget: THREE.Object3D,
  targetHurtboxes: readonly HurtboxComponent[],
  options: {
    arenaCenter: THREE.Vector3;
    arenaEdgeRadius: number;
  }
): EnemyMissileShipController {
  const archetype = ROGUE_PILOT_MISSILE_SHIP_ARCHETYPE;
  const spawnPosition = resolveOppositeHalfEdgeSpawnPosition(playerTarget, options);

  const ship = new EnemyMissileShip(
    {
      ...archetype.ship,
      swarmMissileProjectile: {
        ...archetype.ship.swarmMissileProjectile,
        damageType: "Concussive",
        meshScale: (archetype.ship.swarmMissileProjectile?.meshScale ?? 0.9) * 0.75,
        modelUrl: microConcussiveMissileModelUrl,
        modelDesiredSize: 0.315,
        modelYawOffset: 0
      },
      homingMissileProjectile: {
        ...archetype.ship.homingMissileProjectile,
        damageType: "Concussive",
        meshScale: (archetype.ship.homingMissileProjectile?.meshScale ?? 1) * 0.75,
        modelUrl: standardConcussiveMissileModelUrl,
        modelDesiredSize: 0.465,
        modelYawOffset: 0
      },
      health: archetype.health,
      position: spawnPosition,
      patrolCenter: options.arenaCenter,
      patrolEdgeRadius: options.arenaEdgeRadius,
      playerTarget,
      targetHurtboxes
    },
    scene
  );

  return new EnemyMissileShipController({
    ship,
    ai: archetype.ai
  });
}
