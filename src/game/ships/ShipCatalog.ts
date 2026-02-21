import * as THREE from "three";
import type { ShipHandlingConfig } from "../controllers/ShipController";
import type { HealthConfig } from "../components/HealthComponent";
import type { PlayerThrusterVisualPreset } from "../effects/PlayerThrusterEffect";
import {
  DEFAULT_CANNON_PRIMARY_COMPONENT_ID,
  type CannonPrimaryComponentId,
  DEFAULT_MISSILE_BAY_COMPONENT_ID,
  type MissileBayComponentId
} from "../weapons/WeaponComponentCatalog";
import playerModelUrl from "../../assets/models/SpaceShip V3.glb?url";
import vagabondM2ShipModelUrl from "../../assets/models/Vagabond-m2-Ship-V01.glb?url";
import azureArrowV2ShipModelUrl from "../../assets/models/Azure-Arrow-V2-ship-v01.glb?url";
import bearclawMk2ShipModelUrl from "../../assets/models/AC-Bearclaw-mkII-Ship-V01.glb?url";
import mx4LancerShipModelUrl from "../../assets/models/Mx4-Lancer-Ship-v01.glb?url";

export type ShipMissileBayDefinition = {
  id: string;
  displayName: string;
  defaultPayloadComponentId: MissileBayComponentId;
  maxCells?: number;
};

export type ShipCannonMountDefinition = {
  defaultPrimaryComponentId: CannonPrimaryComponentId;
  displayName: string;
  id: string;
};

export type ShipDefinition = {
  id: string;
  displayName: string;
  description: string;
  previewTintHex: number;
  modelUrl: string;
  modelYawOffset: number;
  modelSizeMultiplier?: number;
  modelLocalOffset?: THREE.Vector3;
  gunHardpointLocalOffsets?: readonly THREE.Vector3[];
  autoAlignGunHardpointsToModel?: boolean;
  thrusterVisualPreset?: PlayerThrusterVisualPreset;
  thrusterEffectScale?: number;
  thrusterTrailLengthScale?: number;
  thrusterGlowOpacityScale?: number;
  cannonMounts?: readonly ShipCannonMountDefinition[];
  missileBays?: readonly ShipMissileBayDefinition[];
  defaultGunFireIntervalSeconds: number;
  defaultLoadout: readonly string[];
  handling: ShipHandlingConfig;
  health: HealthConfig;
};

const AZURE_ARROW_V2_GUN_HARDPOINTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0)
];

const AZURE_ARROW_V2_CANNON_MOUNTS: readonly ShipCannonMountDefinition[] = [
  {
    id: "cannon_mount_1",
    displayName: "Cannons Primary Fire 1",
    defaultPrimaryComponentId: "repeating_ionbolt_fire"
  },
  {
    id: "cannon_mount_2",
    displayName: "Cannons Primary Fire 2",
    defaultPrimaryComponentId: "repeating_ionbolt_fire"
  }
] as const;

const MX4_LANCER_GUN_HARDPOINTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0)
];

const MX4_LANCER_CANNON_MOUNTS: readonly ShipCannonMountDefinition[] = [
  {
    id: "cannon_mount_1",
    displayName: "Cannons Primary Fire 1",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  },
  {
    id: "cannon_mount_2",
    displayName: "Cannons Primary Fire 2",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  }
] as const;

const MX4_LANCER_MISSILE_BAYS: readonly ShipMissileBayDefinition[] = [
  {
    id: "missile_bay_1",
    displayName: "Missile Bay 1",
    defaultPayloadComponentId: "concussive_swarm_missiles",
    maxCells: 6
  },
  {
    id: "missile_bay_2",
    displayName: "Missile Bay 2",
    defaultPayloadComponentId: "concussive_swarm_missiles",
    maxCells: 6
  },
  {
    id: "missile_bay_3",
    displayName: "Missile Bay 3",
    defaultPayloadComponentId: "concussive_swarm_missiles",
    maxCells: 6
  },
  {
    id: "missile_bay_4",
    displayName: "Missile Bay 4",
    defaultPayloadComponentId: "concussive_swarm_missiles",
    maxCells: 6
  }
] as const;

const TEST_FIGHTER: ShipDefinition = {
  id: "test_fighter",
  displayName: "Azure Arrow V2",
  description: "Balanced prototype fighter with stable handling and all-round survivability.",
  previewTintHex: 0x6cc8ff,
  modelUrl: azureArrowV2ShipModelUrl,
  modelYawOffset: Math.PI * 0.5,
  gunHardpointLocalOffsets: AZURE_ARROW_V2_GUN_HARDPOINTS,
  autoAlignGunHardpointsToModel: false,
  cannonMounts: AZURE_ARROW_V2_CANNON_MOUNTS,
  thrusterEffectScale: 0.44,
  thrusterTrailLengthScale: 0.42,
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
    armorRepairEfficiency: 0.5
  }
};

const MAURADER_INTERCEPTER_GUN_HARDPOINTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.68, 1.05, -.16),
  new THREE.Vector3(-0.18, 1.05, -.1),
  new THREE.Vector3(0.18, 1.05, -.1),
  new THREE.Vector3(1.02, 1.05, -.16)
];

const MAURADER_INTERCEPTER_CANNON_MOUNTS: readonly ShipCannonMountDefinition[] = [
  {
    id: "cannon_mount_1",
    displayName: "Cannons Primary Fire 1",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  },
  {
    id: "cannon_mount_2",
    displayName: "Cannons Primary Fire 2",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  },
  {
    id: "cannon_mount_3",
    displayName: "Cannons Primary Fire 3",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  },
  {
    id: "cannon_mount_4",
    displayName: "Cannons Primary Fire 4",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  }
] as const;

const MAURADER_INTERCEPTER_MISSILE_BAYS: readonly ShipMissileBayDefinition[] = [
  {
    id: "missile_bay_1",
    displayName: "Missile Bay 1",
    defaultPayloadComponentId: DEFAULT_MISSILE_BAY_COMPONENT_ID
  }
] as const;

const BEARCLAW_MK2_GUN_HARDPOINTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(0, 0, 0)
];

const BEARCLAW_MK2_CANNON_MOUNTS: readonly ShipCannonMountDefinition[] = [
  {
    id: "cannon_mount_1",
    displayName: "Cannons Primary Fire 1",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  },
  {
    id: "cannon_mount_2",
    displayName: "Cannons Primary Fire 2",
    defaultPrimaryComponentId: DEFAULT_CANNON_PRIMARY_COMPONENT_ID
  }
] as const;

const BEARCLAW_MK2_MISSILE_BAYS: readonly ShipMissileBayDefinition[] = [
  {
    id: "missile_bay_1",
    displayName: "Missile Bay 1",
    defaultPayloadComponentId: DEFAULT_MISSILE_BAY_COMPONENT_ID,
    maxCells: 4
  },
  {
    id: "missile_bay_2",
    displayName: "Missile Bay 2",
    defaultPayloadComponentId: DEFAULT_MISSILE_BAY_COMPONENT_ID,
    maxCells: 4
  }
] as const;

const SWIFT_INTERCEPTOR: ShipDefinition = {
  id: "swift_interceptor",
  displayName: "Maurader-Intercepter",
  description: "High-speed skirmisher tuned for aggressive flanking and rapid target swaps.",
  previewTintHex: 0x77ffbc,
  modelUrl: vagabondM2ShipModelUrl,
  modelYawOffset: Math.PI * 0.5,
  modelLocalOffset: new THREE.Vector3(0.2, 0, 0),
  gunHardpointLocalOffsets: MAURADER_INTERCEPTER_GUN_HARDPOINTS,
  autoAlignGunHardpointsToModel: false,
  cannonMounts: MAURADER_INTERCEPTER_CANNON_MOUNTS,
  missileBays: MAURADER_INTERCEPTER_MISSILE_BAYS,
  thrusterEffectScale: 0.6,
  thrusterTrailLengthScale: 0.25,
  thrusterGlowOpacityScale: 0.6,
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
    armorRepairEfficiency: 0.45
  }
};

const BEARCLAW_MK2: ShipDefinition = {
  id: "vanguard_mk2",
  displayName: "AC Bearclaw Mk II",
  description: "Heavy assault chassis with reinforced armor and stable weapons hardpoints.",
  previewTintHex: 0xffa45c,
  modelUrl: bearclawMk2ShipModelUrl,
  modelYawOffset: 0,
  modelSizeMultiplier: 1.8,
  gunHardpointLocalOffsets: BEARCLAW_MK2_GUN_HARDPOINTS,
  autoAlignGunHardpointsToModel: false,
  cannonMounts: BEARCLAW_MK2_CANNON_MOUNTS,
  missileBays: BEARCLAW_MK2_MISSILE_BAYS,
  thrusterVisualPreset: "purple_rectangular",
  thrusterEffectScale: 0.62,
  thrusterTrailLengthScale: 0.24,
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
    armorRepairEfficiency: 0.56
  }
};

const MX4_LANCER: ShipDefinition = {
  id: "mx4_lancer",
  displayName: "Mx4 Lancer",
  description:
    "Multi-bay strike platform tuned for sustained missile pressure with stable dual-cannon support.",
  previewTintHex: 0xb1d6ff,
  modelUrl: mx4LancerShipModelUrl,
  modelYawOffset: 0,
  gunHardpointLocalOffsets: MX4_LANCER_GUN_HARDPOINTS,
  autoAlignGunHardpointsToModel: false,
  cannonMounts: MX4_LANCER_CANNON_MOUNTS,
  missileBays: MX4_LANCER_MISSILE_BAYS,
  thrusterEffectScale: 0.56,
  thrusterTrailLengthScale: 0.28,
  defaultGunFireIntervalSeconds: 0.2,
  defaultLoadout: ["Repeating Laserbolt Fire", "Concussive Barrage Missiles", "Targeting Uplink"],
  handling: {
    topManeuveringSpeed: 5.9,
    thrustSpeed: 7.6,
    acceleration: 10.8,
    deceleration: 4.1,
    strafeAcceleration: 20.8,
    strafeDeceleration: 15.4
  },
  health: {
    maxShield: 22,
    maxArmor: 50,
    maxHull: 96,
    shieldChargeRate: 2,
    shieldRechargeDelaySeconds: 3.1,
    hullRepairRate: 0,
    armorRepairRate: 0,
    armorRepairEfficiency: 0.52
  }
};

const SHIP_DEFINITIONS: readonly ShipDefinition[] = [
  TEST_FIGHTER,
  MX4_LANCER,
  SWIFT_INTERCEPTOR,
  BEARCLAW_MK2
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
