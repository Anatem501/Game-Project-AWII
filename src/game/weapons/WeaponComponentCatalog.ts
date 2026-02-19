import type { LaserBoltFactoryOptions } from "../controllers/projectiles/LaserBoltFactory";

export const CANNON_PRIMARY_COMPONENT_OPTIONS = [
  "repeating_laserbolt_fire",
  "focused_laserburst_fire",
  "heavy_laserlance_fire"
] as const;

export type CannonPrimaryComponentId = (typeof CANNON_PRIMARY_COMPONENT_OPTIONS)[number];

export const MISSILE_BAY_COMPONENT_OPTIONS = [
  "concussive_barrage_missiles",
  "concussive_swarm_missiles"
] as const;

export type MissileBayComponentId = (typeof MISSILE_BAY_COMPONENT_OPTIONS)[number];

export const ENERGY_LAUNCHER_COMPONENT_OPTIONS = ["arc_plasma_emitter"] as const;

export type EnergyLauncherComponentId = (typeof ENERGY_LAUNCHER_COMPONENT_OPTIONS)[number];

export const DEFAULT_CANNON_PRIMARY_COMPONENT_ID: CannonPrimaryComponentId =
  "repeating_laserbolt_fire";
export const DEFAULT_MISSILE_BAY_COMPONENT_ID: MissileBayComponentId = "concussive_barrage_missiles";
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

export type MissileTargetLockingConfig = {
  acquireSeconds: number;
  maxLocksPerTarget?: number;
  reticleRadiusPadding: number;
  progressDecayDelaySeconds: number;
  progressDecaySeconds: number;
};

export type MissileFlightMode = "homing" | "spline";
export type MissileModelAssetId = "standard_concussive" | "micro_concussive";
export type MissileReloadMode = "per_round" | "full_magazine";

export type MissileBayComponentDefinition = WeaponComponentPresentation & {
  id: MissileBayComponentId;
  burstFireIntervalSeconds: number;
  explosionRadius: number;
  proximityFuseRadius: number;
  reloadSeconds: number;
  triggerFireIntervalSeconds: number;
  missileDamage: number;
  missileLifetimeSeconds: number;
  missileSpeed: number;
  missileModelAssetId?: MissileModelAssetId;
  flightMode?: MissileFlightMode;
  missilesPerShot?: number;
  randomizeCellSelection?: boolean;
  reloadMode?: MissileReloadMode;
  fallbackAimMaxAngleDegrees?: number;
  fallbackAimDistance?: number;
  predictiveLeadFactor?: number;
  reticleScatterRadius?: number;
  splineWildness?: number;
  useLockStacks?: boolean;
  targetLocking: MissileTargetLockingConfig;
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

const MISSILE_BAY_COMPONENTS: Record<MissileBayComponentId, MissileBayComponentDefinition> = {
  concussive_barrage_missiles: {
    id: "concussive_barrage_missiles",
    name: "Concussive Barrage missiles",
    weaponType: "Missile Bay",
    fireType: "Payload",
    damageType: "Concussive",
    description:
      "Standard Concussive Missile V01 payload. Missiles launch in straight-flight barrages and detonate in a medium blast area.",
    burstFireIntervalSeconds: 0.12,
    explosionRadius: 3.25,
    proximityFuseRadius: 1.25,
    reloadSeconds: 1,
    triggerFireIntervalSeconds: 0.35,
    missileDamage: 26,
    missileLifetimeSeconds: 2.5,
    missileSpeed: 16,
    targetLocking: {
      acquireSeconds: 0.6,
      maxLocksPerTarget: 1,
      reticleRadiusPadding: 2.5,
      progressDecayDelaySeconds: 2,
      progressDecaySeconds: 2.5
    }
  },
  concussive_swarm_missiles: {
    id: "concussive_swarm_missiles",
    name: "Concussive Swarm Missiles",
    weaponType: "Missile Bay",
    fireType: "Payload",
    damageType: "Concussive",
    description:
      "Micro-concussive swarm payload that launches triple randomized missiles per volley with predictive lock-strike behavior.",
    burstFireIntervalSeconds: 2.5,
    explosionRadius: 2.4,
    proximityFuseRadius: 1.1,
    reloadSeconds: 2,
    triggerFireIntervalSeconds: 2.5,
    missileDamage: 12,
    missileLifetimeSeconds: 4,
    missileSpeed: 10,
    missileModelAssetId: "micro_concussive",
    flightMode: "spline",
    missilesPerShot: 2,
    randomizeCellSelection: true,
    reloadMode: "full_magazine",
    fallbackAimMaxAngleDegrees: 60,
    fallbackAimDistance: 40,
    predictiveLeadFactor: 0.9,
    reticleScatterRadius: 2.5,
    splineWildness: 1.35,
    useLockStacks: true,
    targetLocking: {
      acquireSeconds: 0.15,
      maxLocksPerTarget: 24,
      reticleRadiusPadding: 2.5,
      progressDecayDelaySeconds: 2,
      progressDecaySeconds: 2.5
    }
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

export function getMissileBayComponentDefinition(
  componentId: MissileBayComponentId
): MissileBayComponentDefinition {
  return (
    MISSILE_BAY_COMPONENTS[componentId] ?? MISSILE_BAY_COMPONENTS.concussive_barrage_missiles
  );
}

export function getEnergyLauncherComponentDefinition(
  componentId: EnergyLauncherComponentId
): EnergyLauncherComponentDefinition {
  return ENERGY_LAUNCHER_COMPONENTS[componentId] ?? ENERGY_LAUNCHER_COMPONENTS.arc_plasma_emitter;
}
