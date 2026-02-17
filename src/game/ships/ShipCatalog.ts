import * as THREE from "three";
import type { ShipHandlingConfig } from "../controllers/ShipController";
import type { HealthConfig } from "../components/HealthComponent";
import playerModelUrl from "../../assets/models/SpaceShip V3.glb?url";

export type ShipDefinition = {
  id: string;
  displayName: string;
  modelUrl: string;
  modelYawOffset: number;
  gunHardpointLocalOffsets?: readonly THREE.Vector3[];
  autoAlignGunHardpointsToModel?: boolean;
  defaultGunFireIntervalSeconds: number;
  handling: ShipHandlingConfig;
  health: HealthConfig;
};

const TEST_FIGHTER: ShipDefinition = {
  id: "test_fighter",
  displayName: "Test Fighter",
  modelUrl: playerModelUrl,
  modelYawOffset: Math.PI * 0.5,
  defaultGunFireIntervalSeconds: 0.2,
  handling: {
    topManeuveringSpeed: 6,
    thrustSpeed: 7.5,
    acceleration: 11.5,
    deceleration: 4.2,
    strafeAcceleration: 22,
    strafeDeceleration: 16
  },
  health: {
    maxShield: 20,
    maxArmor: 40,
    maxHull: 80,
    shieldChargeRate: 2,
    shieldRechargeDelaySeconds: 3,
    hullRepairRate: 0,
    armorRepairRate: 0,
    armorRepairEfficiency: 0.5,
    damageMultipliers: {
      default: {
        shield: 1,
        armor: 1,
        hull: 1
      },
      Laser: { shield: 1.15, armor: 0.9, hull: 1 },
      Ion: { shield: 1.35, armor: 0.82, hull: 0.9 },
      Plasma: { shield: 0.9, armor: 1.2, hull: 1.1 },
      Solar: { shield: 1.1, armor: 1, hull: 1.05 },
      Cryo: { shield: 0.95, armor: 1.05, hull: 1.05 },
      Void: { shield: 1, armor: 0.95, hull: 1.25 },
      Acid: { shield: 0.85, armor: 1.3, hull: 1.05 },
      Kinetic: { shield: 0.9, armor: 1.1, hull: 1 },
      Concussive: { shield: 0.95, armor: 1.15, hull: 1.08 }
    }
  }
};

const SHIP_CATALOG: Record<string, ShipDefinition> = {
  [TEST_FIGHTER.id]: TEST_FIGHTER
};

export const DEFAULT_SHIP_ID = TEST_FIGHTER.id;

export function getShipDefinition(shipId = DEFAULT_SHIP_ID): ShipDefinition {
  return SHIP_CATALOG[shipId] ?? SHIP_CATALOG[DEFAULT_SHIP_ID];
}
