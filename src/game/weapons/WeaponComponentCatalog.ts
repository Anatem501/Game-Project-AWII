import * as THREE from "three";
import type { LaserBoltFactoryOptions } from "../controllers/projectiles/LaserBoltFactory";

export const CANNON_PRIMARY_COMPONENT_OPTIONS = [
  "repeating_laserbolt_fire",
  "repeating_plasmabolt_fire",
  "repeating_voidbolt_fire",
  "repeating_ionbolt_fire",
  "burst_ion_arc_fire",
  "cryowave_fire"
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
  heatCost?: number;
  energyCost?: number;
};

export type CannonPrimaryComponentDefinition = WeaponComponentPresentation & {
  id: CannonPrimaryComponentId;
  fireIntervalSeconds?: number;
  fireIntervalSequenceSeconds?: readonly number[];
  fireIntervalMultiplierScope?: "all_steps" | "burst_gap_only";
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
  homingTurnRateRadiansPerSecond?: number;
  missileModelAssetId?: MissileModelAssetId;
  flightMode?: MissileFlightMode;
  missilesPerShot?: number;
  randomizeCellSelection?: boolean;
  reloadMode?: MissileReloadMode;
  allowLockTargetSwap?: boolean;
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
    energyCost: 3,
    description:
      "Standard green laserbolt stream used by current ship loadouts. Reliable baseline primary fire.",
    projectile: {
      color: 0x72ff9a,
      emissive: 0x2dff55,
      emissiveIntensity: 2.25,
      speed: 16,
      lifetimeSeconds: 2,
      length: 0.44,
      thickness: 0.06,
      damage: 8,
      collisionRadius: 0.08
    }
  },
  repeating_plasmabolt_fire: {
    id: "repeating_plasmabolt_fire",
    name: "Repeating Plasmabolt Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Plasma",
    heatCost: 4,
    description:
      "Standard red-hot plasmabolt stream. Matches repeating laserbolt cadence with stronger thermal visual profile.",
    projectile: {
      color: 0xff6a74,
      emissive: 0xff4554,
      emissiveIntensity: 3.2,
      speed: 18,
      lifetimeSeconds: 2,
      length: 0.44,
      thickness: 0.06,
      damage: 8,
      damageType: "Plasma",
      collisionRadius: 0.08
    }
  },
  repeating_voidbolt_fire: {
    id: "repeating_voidbolt_fire",
    name: "Repeating Voidbolt Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Void",
    heatCost: 0,
    energyCost: 0,
    fireIntervalSeconds: 0.8,
    description:
      "Void-tuned bolt stream using the plasmabolt chassis with a dark core and pale violet shell glow. Does not consume heat or energy.",
    projectile: {
      color: 0x06060a,
      emissive: 0x140a26,
      emissiveIntensity: 2.9,
      speed: 18,
      lifetimeSeconds: 2,
      length: 0.44,
      thickness: 0.06,
      damage: 8,
      damageType: "Void",
      collisionRadius: 0.08
    }
  },
  repeating_ionbolt_fire: {
    id: "repeating_ionbolt_fire",
    name: "Repeating Ionbolt Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Ion",
    energyCost: 4,
    description:
      "Electrified ionbolt stream with layered glow and animated electrical arcs for sustained suppression.",
    projectile: {
      color: 0x73bcff,
      emissive: 0xf0fbff,
      emissiveIntensity: 3.1,
      speed: 18,
      lifetimeSeconds: 2,
      length: 0.44,
      thickness: 0.06,
      damage: 8,
      damageType: "Ion",
      collisionRadius: 0.08
    }
  },
  burst_ion_arc_fire: {
    id: "burst_ion_arc_fire",
    name: "Burst Ion Arc Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Ion",
    energyCost: 4,
    fireIntervalSeconds: 0.5,
    fireIntervalSequenceSeconds: [0.1, 0.1, 1.5],
    fireIntervalMultiplierScope: "burst_gap_only",
    description:
      "Burst-fired ion arc emitter that launches widening ion arcs with piercing ion discharge.",
    projectile: {
      color: 0x73bcff,
      emissive: 0xf0fbff,
      emissiveIntensity: 3.15,
      speed: 15,
      lifetimeSeconds: 1,
      length: 0.8,
      thickness: 0.12,
      damage: 8,
      damageType: "Ion",
      collisionRadius: 0.15
    }
  },
  cryowave_fire: {
    id: "cryowave_fire",
    name: "Cryowave Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Frost",
    fireIntervalSeconds: 0.75,
    description:
      "Cryogenic wave projector that launches frosted arc waves with icy socket trails.",
    projectile: {
      color: 0x8fd9ff,
      emissive: 0xe9fbff,
      emissiveIntensity: 2.7,
      speed: 18,
      lifetimeSeconds: 1.9,
      length: 0.86,
      thickness: 0.08,
      damage: 8,
      damageType: "Frost",
      collisionRadius: 0.11
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
    heatCost: 0,
    energyCost: 0,
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
    homingTurnRateRadiansPerSecond: THREE.MathUtils.degToRad(132),
    allowLockTargetSwap: true,
    targetLocking: {
      acquireSeconds: 0.5,
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
    heatCost: 12,
    description:
      "Micro-concussive swarm payload that launches triple randomized missiles per volley with predictive lock-strike behavior.",
    burstFireIntervalSeconds: 2.5,
    explosionRadius: 2.4,
    proximityFuseRadius: 1.1,
    reloadSeconds: 2,
    triggerFireIntervalSeconds: 2.5,
    missileDamage: 12,
    missileLifetimeSeconds: 4,
    missileSpeed: 13,
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
