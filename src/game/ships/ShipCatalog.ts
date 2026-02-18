import * as THREE from "three";
import type { ShipHandlingConfig } from "../controllers/ShipController";
import type { HealthConfig } from "../components/HealthComponent";
import playerModelUrl from "../../assets/models/SpaceShip V3.glb?url";

export type ShipDefinition = {
  id: string;
  displayName: string;
  description: string;
  previewTintHex: number;
  modelUrl: string;
  modelYawOffset: number;
  gunHardpointLocalOffsets?: readonly THREE.Vector3[];
  autoAlignGunHardpointsToModel?: boolean;
  defaultGunFireIntervalSeconds: number;
  defaultLoadout: readonly string[];
  handling: ShipHandlingConfig;
  health: HealthConfig;
};

const TEST_FIGHTER: ShipDefinition = {
  id: "test_fighter",
  displayName: "Test Fighter",
  description: "Balanced prototype fighter with stable handling and all-round survivability.",
  previewTintHex: 0x6cc8ff,
  modelUrl: playerModelUrl,
  modelYawOffset: Math.PI * 0.5,
  defaultGunFireIntervalSeconds: 0.2,
  defaultLoadout: ["Dual Pulse Cannons", "Micro Missile Rack", "Nanite Repair Kit"],
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

const SWIFT_INTERCEPTOR: ShipDefinition = {
  id: "swift_interceptor",
  displayName: "Swift Interceptor",
  description: "High-speed skirmisher tuned for aggressive flanking and rapid target swaps.",
  previewTintHex: 0x77ffbc,
  modelUrl: playerModelUrl,
  modelYawOffset: Math.PI * 0.5,
  defaultGunFireIntervalSeconds: 0.16,
  defaultLoadout: ["Twin Light Lasers", "EMP Dart Pod", "Overdrive Thrusters"],
  handling: {
    topManeuveringSpeed: 6.7,
    thrustSpeed: 8.9,
    acceleration: 13.2,
    deceleration: 4.8,
    strafeAcceleration: 24.5,
    strafeDeceleration: 18.5
  },
  health: {
    maxShield: 24,
    maxArmor: 30,
    maxHull: 68,
    shieldChargeRate: 2.5,
    shieldRechargeDelaySeconds: 2.8,
    hullRepairRate: 0,
    armorRepairRate: 0,
    armorRepairEfficiency: 0.45,
    damageMultipliers: {
      default: {
        shield: 1,
        armor: 1,
        hull: 1
      },
      Laser: { shield: 1.1, armor: 0.95, hull: 1 },
      Ion: { shield: 1.3, armor: 0.85, hull: 0.92 },
      Plasma: { shield: 0.95, armor: 1.25, hull: 1.12 },
      Solar: { shield: 1.08, armor: 1, hull: 1.03 },
      Cryo: { shield: 0.92, armor: 1.08, hull: 1.06 },
      Void: { shield: 1, armor: 0.97, hull: 1.22 },
      Acid: { shield: 0.88, armor: 1.28, hull: 1.06 },
      Kinetic: { shield: 0.93, armor: 1.06, hull: 1.02 },
      Concussive: { shield: 0.96, armor: 1.12, hull: 1.08 }
    }
  }
};

const VANGUARD_MK2: ShipDefinition = {
  id: "vanguard_mk2",
  displayName: "Vanguard Mk II",
  description: "Heavier frontline chassis that trades agility for armor depth and durability.",
  previewTintHex: 0xffa45c,
  modelUrl: playerModelUrl,
  modelYawOffset: Math.PI * 0.5,
  defaultGunFireIntervalSeconds: 0.28,
  defaultLoadout: ["Heavy Laser Lances", "Flak Burst Tube", "Reactive Armor Field"],
  handling: {
    topManeuveringSpeed: 5.2,
    thrustSpeed: 6.8,
    acceleration: 9.4,
    deceleration: 3.7,
    strafeAcceleration: 17.8,
    strafeDeceleration: 13.8
  },
  health: {
    maxShield: 14,
    maxArmor: 68,
    maxHull: 118,
    shieldChargeRate: 1.6,
    shieldRechargeDelaySeconds: 3.6,
    hullRepairRate: 0,
    armorRepairRate: 0,
    armorRepairEfficiency: 0.56,
    damageMultipliers: {
      default: {
        shield: 1,
        armor: 1,
        hull: 1
      },
      Laser: { shield: 1.14, armor: 0.88, hull: 0.97 },
      Ion: { shield: 1.28, armor: 0.8, hull: 0.9 },
      Plasma: { shield: 0.9, armor: 1.18, hull: 1.08 },
      Solar: { shield: 1.06, armor: 1, hull: 1.02 },
      Cryo: { shield: 0.94, armor: 1.02, hull: 1.04 },
      Void: { shield: 1, armor: 0.92, hull: 1.19 },
      Acid: { shield: 0.86, armor: 1.24, hull: 1.03 },
      Kinetic: { shield: 0.9, armor: 1.12, hull: 0.98 },
      Concussive: { shield: 0.94, armor: 1.18, hull: 1.06 }
    }
  }
};

const SHIP_DEFINITIONS: readonly ShipDefinition[] = [
  TEST_FIGHTER,
  SWIFT_INTERCEPTOR,
  VANGUARD_MK2
];

const SHIP_CATALOG: Record<string, ShipDefinition> = Object.fromEntries(
  SHIP_DEFINITIONS.map((ship) => [ship.id, ship])
);

export const DEFAULT_SHIP_ID = TEST_FIGHTER.id;

export function getShipDefinition(shipId = DEFAULT_SHIP_ID): ShipDefinition {
  return SHIP_CATALOG[shipId] ?? SHIP_CATALOG[DEFAULT_SHIP_ID];
}

export function listShipDefinitions(): readonly ShipDefinition[] {
  return SHIP_DEFINITIONS;
}
