import {
  DEFAULT_DAMAGE_TYPE,
  normalizeDamageTypeKey,
  type DamageType
} from "./combat/DamageTypes";

export type HealthLayer = "shield" | "armor" | "hull";
export type { DamageType } from "./combat/DamageTypes";
export type DamageMultiplierMap = Partial<
  Record<DamageType | "default", Partial<Record<HealthLayer, number>>>
>;

export type HealthConfig = {
  maxShield: number;
  maxArmor: number;
  maxHull: number;
  shieldChargeRate: number;
  shieldRechargeDelaySeconds?: number;
  hullRepairRate?: number;
  armorRepairRate?: number;
  armorRepairEfficiency?: number;
  damageMultipliers?: DamageMultiplierMap;
};

export type HealthSnapshot = {
  shield: { current: number; max: number };
  armor: { current: number; max: number };
  hull: { current: number; max: number };
  shieldChargeRate: number;
  shieldRechargeDelaySeconds: number;
  shieldRechargeDelayRemaining: number;
  hullRepairRate: number;
  armorRepairRate: number;
  armorRepairEfficiency: number;
  armorDamageTaken: number;
  armorRepairApplied: number;
  armorRepairBudgetRemaining: number;
  destroyed: boolean;
};

export type DamageBreakdown = {
  incomingBaseDamage: number;
  damageType: DamageType;
  toShield: number;
  toArmor: number;
  toHull: number;
  unabsorbedBaseDamage: number;
  destroyed: boolean;
};

export type HealthComponent = {
  update: (deltaTime: number) => void;
  applyDamage: (amount: number, damageType?: DamageType) => DamageBreakdown;
  repairShield: (amount: number) => number;
  repairHull: (amount: number) => number;
  repairArmor: (amount: number) => number;
  reset: () => void;
  getSnapshot: () => HealthSnapshot;
};

const DEFAULT_MULTIPLIER = 1;
const DEFAULT_ARMOR_REPAIR_EFFICIENCY = 0.5;

export const GLOBAL_DAMAGE_MULTIPLIERS: DamageMultiplierMap = {
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
};

export function createHealthComponent(config: HealthConfig): HealthComponent {
  const maxShield = clampMin(config.maxShield, 0);
  const maxArmor = clampMin(config.maxArmor, 0);
  const maxHull = clampMin(config.maxHull, 0);

  const shieldChargeRate = clampMin(config.shieldChargeRate, 0);
  const shieldRechargeDelaySeconds = clampMin(config.shieldRechargeDelaySeconds ?? 0, 0);
  const hullRepairRate = clampMin(config.hullRepairRate ?? 0, 0);
  const armorRepairRate = clampMin(config.armorRepairRate ?? 0, 0);
  const armorRepairEfficiency = clamp(
    config.armorRepairEfficiency ?? DEFAULT_ARMOR_REPAIR_EFFICIENCY,
    0,
    1
  );

  let shield = maxShield;
  let armor = maxArmor;
  let hull = maxHull;
  let armorDamageTaken = 0;
  let armorRepairApplied = 0;
  let shieldRechargeDelayRemaining = 0;
  const normalizedDamageMultipliers = normalizeDamageMultipliers(
    mergeDamageMultipliers(GLOBAL_DAMAGE_MULTIPLIERS, config.damageMultipliers)
  );

  const getDamageMultiplier = (damageType: DamageType, layer: HealthLayer): number => {
    const layerMultipliers = normalizedDamageMultipliers[normalizeDamageTypeKey(damageType)];
    const fallbackLayerMultipliers = normalizedDamageMultipliers.default;
    const raw =
      layerMultipliers?.[layer] ??
      fallbackLayerMultipliers?.[layer] ??
      DEFAULT_MULTIPLIER;
    return clampMin(raw, 0);
  };

  const applyDamageToLayer = (
    layerHealth: number,
    remainingBaseDamage: number,
    multiplier: number
  ): { damageApplied: number; remainingBaseDamage: number; updatedLayerHealth: number } => {
    if (remainingBaseDamage <= 0 || multiplier <= 0 || layerHealth <= 0) {
      return { damageApplied: 0, remainingBaseDamage, updatedLayerHealth: layerHealth };
    }

    const scaledIncomingDamage = remainingBaseDamage * multiplier;
    const damageApplied = Math.min(layerHealth, scaledIncomingDamage);
    const baseDamageAbsorbed = damageApplied / multiplier;

    return {
      damageApplied,
      remainingBaseDamage: Math.max(0, remainingBaseDamage - baseDamageAbsorbed),
      updatedLayerHealth: layerHealth - damageApplied
    };
  };

  const repairShield = (amount: number): number => {
    if (amount <= 0 || shield >= maxShield) {
      return 0;
    }

    const recovered = Math.min(amount, maxShield - shield);
    shield += recovered;
    return recovered;
  };

  const repairHull = (amount: number): number => {
    if (amount <= 0 || hull >= maxHull) {
      return 0;
    }

    const recovered = Math.min(amount, maxHull - hull);
    hull += recovered;
    return recovered;
  };

  const repairArmor = (amount: number): number => {
    if (amount <= 0 || armor >= maxArmor) {
      return 0;
    }

    const maxRepairBudget = armorDamageTaken * armorRepairEfficiency;
    const remainingRepairBudget = Math.max(0, maxRepairBudget - armorRepairApplied);
    if (remainingRepairBudget <= 0) {
      return 0;
    }

    const recovered = Math.min(amount, maxArmor - armor, remainingRepairBudget);
    armor += recovered;
    armorRepairApplied += recovered;
    return recovered;
  };

  const applyDamage = (amount: number, damageType = DEFAULT_DAMAGE_TYPE): DamageBreakdown => {
    const incomingBaseDamage = clampMin(amount, 0);
    if (incomingBaseDamage <= 0) {
      return {
        incomingBaseDamage: 0,
        damageType,
        toShield: 0,
        toArmor: 0,
        toHull: 0,
        unabsorbedBaseDamage: 0,
        destroyed: hull <= 0
      };
    }

    let remainingBaseDamage = incomingBaseDamage;

    const shieldResult = applyDamageToLayer(
      shield,
      remainingBaseDamage,
      getDamageMultiplier(damageType, "shield")
    );
    shield = shieldResult.updatedLayerHealth;
    remainingBaseDamage = shieldResult.remainingBaseDamage;

    const armorResult = applyDamageToLayer(
      armor,
      remainingBaseDamage,
      getDamageMultiplier(damageType, "armor")
    );
    armor = armorResult.updatedLayerHealth;
    remainingBaseDamage = armorResult.remainingBaseDamage;
    armorDamageTaken += armorResult.damageApplied;

    const hullResult = applyDamageToLayer(
      hull,
      remainingBaseDamage,
      getDamageMultiplier(damageType, "hull")
    );
    hull = hullResult.updatedLayerHealth;
    remainingBaseDamage = hullResult.remainingBaseDamage;
    if (shieldRechargeDelaySeconds > 0) {
      shieldRechargeDelayRemaining = shieldRechargeDelaySeconds;
    }

    return {
      incomingBaseDamage,
      damageType,
      toShield: shieldResult.damageApplied,
      toArmor: armorResult.damageApplied,
      toHull: hullResult.damageApplied,
      unabsorbedBaseDamage: remainingBaseDamage,
      destroyed: hull <= 0
    };
  };

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    shieldRechargeDelayRemaining = Math.max(0, shieldRechargeDelayRemaining - deltaTime);
    if (shieldRechargeDelayRemaining <= 0 && shieldChargeRate > 0) {
      repairShield(shieldChargeRate * deltaTime);
    }
    if (hullRepairRate > 0) {
      repairHull(hullRepairRate * deltaTime);
    }
    if (armorRepairRate > 0) {
      repairArmor(armorRepairRate * deltaTime);
    }
  };

  const getSnapshot = (): HealthSnapshot => {
    const maxRepairBudget = armorDamageTaken * armorRepairEfficiency;
    const armorRepairBudgetRemaining = Math.max(0, maxRepairBudget - armorRepairApplied);

    return {
      shield: { current: shield, max: maxShield },
      armor: { current: armor, max: maxArmor },
      hull: { current: hull, max: maxHull },
      shieldChargeRate,
      shieldRechargeDelaySeconds,
      shieldRechargeDelayRemaining,
      hullRepairRate,
      armorRepairRate,
      armorRepairEfficiency,
      armorDamageTaken,
      armorRepairApplied,
      armorRepairBudgetRemaining,
      destroyed: hull <= 0
    };
  };

  return {
    update,
    applyDamage,
    repairShield,
    repairHull,
    repairArmor,
    reset: () => {
      shield = maxShield;
      armor = maxArmor;
      hull = maxHull;
      armorDamageTaken = 0;
      armorRepairApplied = 0;
      shieldRechargeDelayRemaining = 0;
    },
    getSnapshot
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampMin(value: number, min: number): number {
  return Math.max(min, value);
}

function normalizeDamageMultipliers(
  multipliers: DamageMultiplierMap | undefined
): Record<string, Partial<Record<HealthLayer, number>>> {
  const normalized: Record<string, Partial<Record<HealthLayer, number>>> = {};
  if (!multipliers) {
    return normalized;
  }

  for (const [key, layerMultipliers] of Object.entries(multipliers)) {
    normalized[normalizeDamageTypeKey(key)] = layerMultipliers ?? {};
  }

  return normalized;
}

function mergeDamageMultipliers(
  base: DamageMultiplierMap,
  overrides: DamageMultiplierMap | undefined
): DamageMultiplierMap {
  const merged: DamageMultiplierMap = {};

  for (const [key, layerMultipliers] of Object.entries(base)) {
    merged[key] = { ...(layerMultipliers ?? {}) };
  }

  if (!overrides) {
    return merged;
  }

  for (const [key, layerMultipliers] of Object.entries(overrides)) {
    merged[key] = {
      ...(merged[key] ?? {}),
      ...(layerMultipliers ?? {})
    };
  }

  return merged;
}
