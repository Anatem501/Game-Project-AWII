import * as THREE from "three";
import type { LaserBoltFactoryOptions } from "../controllers/projectiles/LaserBoltFactory";

export const CANNON_PRIMARY_COMPONENT_OPTIONS = [
  "repeating_laserbolt_fire",
  "laserbeam_pulse_fire",
  "electromagnetic_railgun",
  "explosive_shell_fire",
  "solar_seeker_shots",
  "void_seeker_fire",
  "rapid_chaingun_fire",
  "repeating_plasmabolt_fire",
  "repeating_voidbolt_fire",
  "repeating_ionbolt_fire",
  "repeating_cryoshard_fire",
  "plasma_arc_shots",
  "burst_ion_arc_fire",
  "burst_acid_fire",
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

const RAPID_CHAINGUN_SHOTS_PER_BELT = 200;
const RAPID_CHAINGUN_RELOAD_SECONDS = 5;

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
  completeBurstOnRelease?: boolean;
  reloadAfterShots?: number;
  reloadDurationSeconds?: number;
  shareReloadAcrossHardpoints?: boolean;
  hitscanPulse?: {
    pulseDurationSeconds: number;
    maxDistance: number;
    beamThickness: number;
    damage: number;
    damageType?: string;
    hitSparkIntervalSeconds?: number;
    beamColor?: number;
    beamCoreColor?: number;
    effectStyle?: "default" | "electromagnetic_railgun" | "explosive_shell_fire";
    explosionRadius?: number;
    explosionDamage?: number;
  };
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
    energyCost: 1,
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
  laserbeam_pulse_fire: {
    id: "laserbeam_pulse_fire",
    name: "Laserbeam Pulse",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Laser",
    energyCost: 6,
    fireIntervalSeconds: 1.2,
    description:
      "Hitscan laser pulse emitter. Fires a sustained green beam pulse that lances forward, sparks on contact, and fades before the next charge cycle.",
    hitscanPulse: {
      pulseDurationSeconds: 0.6,
      maxDistance: 260,
      beamThickness: 0.08,
      damage: 10,
      hitSparkIntervalSeconds: 0.08
    },
    projectile: {
      color: 0x72ff9a,
      emissive: 0x2dff55,
      emissiveIntensity: 2.25,
      speed: 16,
      lifetimeSeconds: 2,
      length: 0.44,
      thickness: 0.06,
      damage: 10,
      collisionRadius: 0.08
    }
  },
  electromagnetic_railgun: {
    id: "electromagnetic_railgun",
    name: "Electromagnic Railgun Shot",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Kinetic",
    energyCost: 10,
    fireIntervalSeconds: 1.35,
    description:
      "High-impact electromagnetic railgun shot. Fires a thin white kinetic beam with dark blue underlayer and electrical discharge along the beam path.",
    hitscanPulse: {
      pulseDurationSeconds: 0.28,
      maxDistance: 320,
      beamThickness: 0.04,
      damage: 34,
      damageType: "Kinetic",
      beamColor: 0x0d2f8f,
      beamCoreColor: 0xf4fbff,
      effectStyle: "electromagnetic_railgun",
      hitSparkIntervalSeconds: 0.08
    },
    projectile: {
      color: 0xe6f7ff,
      emissive: 0xaed8ff,
      emissiveIntensity: 1.5,
      speed: 20,
      lifetimeSeconds: 1,
      length: 0.2,
      thickness: 0.04,
      damage: 34,
      damageType: "Kinetic",
      collisionRadius: 0.04
    }
  },
  explosive_shell_fire: {
    id: "explosive_shell_fire",
    name: "Explosive Shell Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Concussive",
    fireIntervalSeconds: 1.2,
    reloadAfterShots: 5,
    reloadDurationSeconds: 4,
    shareReloadAcrossHardpoints: false,
    description:
      "Fast artillery shell projectile that detonates on impact and deals concussive blast damage in a small area.",
    projectile: {
      color: 0xd1ab58,
      emissive: 0xa8601f,
      emissiveIntensity: 0.82,
      speed: 58,
      lifetimeSeconds: 1.5,
      length: 0.28,
      thickness: 0.09,
      damage: 20,
      damageType: "Concussive",
      collisionRadius: 0.08
    }
  },
  solar_seeker_shots: {
    id: "solar_seeker_shots",
    name: "Solarseeker Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Solar",
    heatCost: 1,
    energyCost: 1,
    fireIntervalSeconds: 1.2,
    description:
      "Golden solar seekers with a bright star core and guided trail. Gains moderate homing when fired over an enemy target.",
    projectile: {
      color: 0xffcc55,
      emissive: 0xfff1b0,
      emissiveIntensity: 3.4,
      speed: 14,
      lifetimeSeconds: 2.8,
      length: 0.52,
      thickness: 0.12,
      damage: 14,
      damageType: "Solar",
      collisionRadius: 0.12
    }
  },
  void_seeker_fire: {
    id: "void_seeker_fire",
    name: "Voidseeker Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Void",
    heatCost: 1,
    energyCost: 1,
    fireIntervalSeconds: 1.2,
    description:
      "Void seekers with a dark orb core, vortex halo, orbiting void shards, and guided violet trail. Gains moderate homing when fired over an enemy target.",
    projectile: {
      color: 0x6f63ff,
      emissive: 0xb0b7ff,
      emissiveIntensity: 3.1,
      speed: 14,
      lifetimeSeconds: 2.8,
      length: 0.52,
      thickness: 0.12,
      damage: 14,
      damageType: "Void",
      collisionRadius: 0.12
    }
  },
  rapid_chaingun_fire: {
    id: "rapid_chaingun_fire",
    name: "Rapid Chaingun Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Kinetic",
    heatCost: 1,
    fireIntervalSeconds: 0.1,
    reloadAfterShots: RAPID_CHAINGUN_SHOTS_PER_BELT,
    reloadDurationSeconds: RAPID_CHAINGUN_RELOAD_SECONDS,
    shareReloadAcrossHardpoints: true,
    description:
      "High-rate kinetic chaingun stream with compact gray bullets, hot tracer tails, bright muzzle sparks, and yellow impact sparks.",
    projectile: {
      color: 0xa0a0a0,
      emissive: 0x141414,
      emissiveIntensity: 0.35,
      speed: 36,
      lifetimeSeconds: 1.15,
      length: 0.08,
      thickness: 0.02,
      damage: 2,
      damageType: "Kinetic",
      collisionRadius: 0.02
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
    energyCost: 2,
    fireIntervalSeconds: 0.8,
    description:
      "Void-tuned bolt stream using the plasmabolt chassis with a dark core and pale violet shell glow. Uses a small energy draw with no heat cost.",
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
    energyCost: 2,
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
      statusPayloads: [{ kind: "electroshock_on_hit", chance01: 0.1 }],
      collisionRadius: 0.08
    }
  },
  repeating_cryoshard_fire: {
    id: "repeating_cryoshard_fire",
    name: "Repeating Cryoshard Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Cryo / Kinetic",
    heatCost: 0,
    energyCost: 0,
    fireIntervalSeconds: 0.6,
    description:
      "Repeating cryoshard stream with cold glassy frost shards. Deals split cryogenic and kinetic impact damage.",
    projectile: {
      color: 0x8edbff,
      emissive: 0xd8f4ff,
      emissiveIntensity: 1.95,
      speed: 16,
      lifetimeSeconds: 2,
      length: 0.48,
      thickness: 0.065,
      damage: 4,
      damageType: "Cryo",
      additionalDamageSegments: [{ amount: 4, damageType: "Kinetic" }],
      statusPayloads: [{ kind: "cryo_buildup", amount: 50 }],
      collisionRadius: 0.08
    }
  },
  plasma_arc_shots: {
    id: "plasma_arc_shots",
    name: "Plasma Arc Shots",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Plasma",
    heatCost: 4,
    fireIntervalSeconds: 1,
    description:
      "Long-range plasma arc shots that pierce through multiple enemies with wide arcing plasma particle trails.",
    projectile: {
      color: 0xff8d63,
      emissive: 0xffc8a6,
      emissiveIntensity: 2.5,
      speed: 18,
      lifetimeSeconds: 1.8,
      length: 0.82,
      thickness: 0.12,
      damage: 8,
      damageType: "Plasma",
      collisionRadius: 0.14
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
    completeBurstOnRelease: true,
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
      statusPayloads: [{ kind: "electroshock_on_hit", chance01: 0.1 }],
      collisionRadius: 0.15
    }
  },
  burst_acid_fire: {
    id: "burst_acid_fire",
    name: "Rapid Acid Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Acid",
    heatCost: 1,
    energyCost: 0,
    fireIntervalSeconds: 0.4,
    reloadAfterShots: 8,
    reloadDurationSeconds: 2,
    shareReloadAcrossHardpoints: false,
    description:
      "Acid glob launcher with a steady 400ms cadence and a short reload cycle after 20 corrosive shots.",
    projectile: {
      color: 0xc8ff52,
      emissive: 0x7dff32,
      emissiveIntensity: 2.8,
      speed: 14,
      lifetimeSeconds: 2.2,
      length: 0.1265625,
      thickness: 0.031640625,
      damage: 4,
      damageType: "Acid",
      collisionRadius: 0.038671875
    }
  },
  cryowave_fire: {
    id: "cryowave_fire",
    name: "Cryowave Fire",
    weaponType: "Cannons",
    fireType: "Primary",
    damageType: "Cryo",
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
      damageType: "Cryo",
      statusPayloads: [{ kind: "cryo_buildup", amount: 100 }],
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
