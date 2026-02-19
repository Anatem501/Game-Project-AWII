import type { LaserBoltFactoryOptions } from "../controllers/projectiles/LaserBoltFactory";

export const CANNON_PRIMARY_COMPONENT_OPTIONS = [
  "repeating_laserbolt_fire",
  "focused_laserburst_fire",
  "heavy_laserlance_fire"
] as const;

export type CannonPrimaryComponentId = (typeof CANNON_PRIMARY_COMPONENT_OPTIONS)[number];

export const CANNON_SECONDARY_COMPONENT_OPTIONS = ["charged_laser_spike_secondary"] as const;

export type CannonSecondaryComponentId = (typeof CANNON_SECONDARY_COMPONENT_OPTIONS)[number];

export const MISSILE_BAY_COMPONENT_OPTIONS = ["micro_missile_swarm_bay"] as const;

export type MissileBayComponentId = (typeof MISSILE_BAY_COMPONENT_OPTIONS)[number];

export const ENERGY_LAUNCHER_COMPONENT_OPTIONS = ["arc_plasma_emitter"] as const;

export type EnergyLauncherComponentId = (typeof ENERGY_LAUNCHER_COMPONENT_OPTIONS)[number];

export const DEFAULT_CANNON_PRIMARY_COMPONENT_ID: CannonPrimaryComponentId =
  "repeating_laserbolt_fire";
export const DEFAULT_CANNON_SECONDARY_COMPONENT_ID: CannonSecondaryComponentId =
  "charged_laser_spike_secondary";
export const DEFAULT_MISSILE_BAY_COMPONENT_ID: MissileBayComponentId = "micro_missile_swarm_bay";
export const DEFAULT_ENERGY_LAUNCHER_COMPONENT_ID: EnergyLauncherComponentId =
  "arc_plasma_emitter";

type WeaponComponentPresentation = {
  name: string;
  weaponType: string;
  fireType: string;
  damageType: string;
  description: string;
};

export type CannonPrimaryComponentDefinition = WeaponComponentPresentation & {
  id: CannonPrimaryComponentId;
  fireIntervalSeconds?: number;
  projectile: LaserBoltFactoryOptions;
};

export type CannonSecondaryComponentDefinition = WeaponComponentPresentation & {
  id: CannonSecondaryComponentId;
  fireIntervalSeconds: number;
  projectile: LaserBoltFactoryOptions;
};

export type MissileBayComponentDefinition = WeaponComponentPresentation & {
  id: MissileBayComponentId;
};

export type EnergyLauncherComponentDefinition = WeaponComponentPresentation & {
  id: EnergyLauncherComponentId;
};

const CANNON_PRIMARY_COMPONENTS: Record<
  CannonPrimaryComponentId,
  CannonPrimaryComponentDefinition
> = {
  repeating_laserbolt_fire: {
    id: "repeating_laserbolt_fire",
    name: "Repeating Laserbolt Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Laser",
    description:
      "Standard green laserbolt stream used by current ship loadouts. Reliable baseline primary fire.",
    projectile: {
      color: 0x72ff9a,
      emissive: 0x2dff55,
      emissiveIntensity: 2.25,
      speed: 28,
      lifetimeSeconds: 2,
      length: 0.44,
      thickness: 0.06,
      damage: 8,
      collisionRadius: 0.08
    }
  },
  focused_laserburst_fire: {
    id: "focused_laserburst_fire",
    name: "Focused Laserburst Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Laser",
    description:
      "Higher-cadence focused laser bolts with tighter projectile profile and improved velocity.",
    fireIntervalSeconds: 0.15,
    projectile: {
      color: 0x9df7ff,
      emissive: 0x42d8ff,
      emissiveIntensity: 2.35,
      speed: 34,
      lifetimeSeconds: 1.8,
      length: 0.42,
      thickness: 0.048,
      damage: 6.5,
      collisionRadius: 0.065
    }
  },
  heavy_laserlance_fire: {
    id: "heavy_laserlance_fire",
    name: "Heavy Laserlance Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Laser",
    description:
      "Lower-cadence heavy laser lances with thicker projectiles and stronger single-shot impact.",
    fireIntervalSeconds: 0.3,
    projectile: {
      color: 0xb3ff9c,
      emissive: 0x5dff7a,
      emissiveIntensity: 2.6,
      speed: 24,
      lifetimeSeconds: 2.2,
      length: 0.72,
      thickness: 0.11,
      damage: 15,
      collisionRadius: 0.12
    }
  }
};

const CANNON_SECONDARY_COMPONENTS: Record<
  CannonSecondaryComponentId,
  CannonSecondaryComponentDefinition
> = {
  charged_laser_spike_secondary: {
    id: "charged_laser_spike_secondary",
    name: "Charged Laser Spike",
    weaponType: "Cannons",
    fireType: "Secondary",
    damageType: "Laser",
    description:
      "Charged secondary cannon burst that fires slower but hits significantly harder than primary fire.",
    fireIntervalSeconds: 0.72,
    projectile: {
      color: 0xeab2ff,
      emissive: 0xb14dff,
      emissiveIntensity: 2.7,
      speed: 22,
      lifetimeSeconds: 2.1,
      length: 0.9,
      thickness: 0.12,
      damage: 24,
      collisionRadius: 0.14
    }
  }
};

const MISSILE_BAY_COMPONENTS: Record<MissileBayComponentId, MissileBayComponentDefinition> = {
  micro_missile_swarm_bay: {
    id: "micro_missile_swarm_bay",
    name: "Micro Missile Swarm Bay",
    weaponType: "Missile Bay",
    fireType: "Secondary",
    damageType: "Explosive",
    description:
      "Foundation component for upcoming missile bay functionality. Launch logic and tracking are in progress."
  }
};

const ENERGY_LAUNCHER_COMPONENTS: Record<
  EnergyLauncherComponentId,
  EnergyLauncherComponentDefinition
> = {
  arc_plasma_emitter: {
    id: "arc_plasma_emitter",
    name: "Arc Plasma Emitter",
    weaponType: "Energy Launcher",
    fireType: "Secondary",
    damageType: "Energy",
    description:
      "Foundation component for upcoming energy launcher weapons. Projectile behavior is in progress."
  }
};

export function getCannonPrimaryComponentDefinition(
  componentId: CannonPrimaryComponentId
): CannonPrimaryComponentDefinition {
  return CANNON_PRIMARY_COMPONENTS[componentId] ?? CANNON_PRIMARY_COMPONENTS.repeating_laserbolt_fire;
}

export function getCannonSecondaryComponentDefinition(
  componentId: CannonSecondaryComponentId
): CannonSecondaryComponentDefinition {
  return (
    CANNON_SECONDARY_COMPONENTS[componentId] ??
    CANNON_SECONDARY_COMPONENTS.charged_laser_spike_secondary
  );
}

export function getMissileBayComponentDefinition(
  componentId: MissileBayComponentId
): MissileBayComponentDefinition {
  return MISSILE_BAY_COMPONENTS[componentId] ?? MISSILE_BAY_COMPONENTS.micro_missile_swarm_bay;
}

export function getEnergyLauncherComponentDefinition(
  componentId: EnergyLauncherComponentId
): EnergyLauncherComponentDefinition {
  return ENERGY_LAUNCHER_COMPONENTS[componentId] ?? ENERGY_LAUNCHER_COMPONENTS.arc_plasma_emitter;
}

