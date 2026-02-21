import { normalizeDamageTypeKey, type DamageType } from "./combat/DamageTypes";

const DEFAULT_MIN_ENERGY_RATIO = 0.5;
const DEFAULT_PLASMA_HEAT_PER_DAMAGE = 0.6;
const DEFAULT_HEAT_DISSIPATION_DELAY_SECONDS = 0.4;
const DEFAULT_ENERGY_RECHARGE_DELAY_SECONDS = 0.8;
const OVERHEAT_CLEAR_DURATION_SECONDS = 3;
const LOW_POWER_FIRE_INTERVAL_MULTIPLIER = 2;
const PLASMA_DAMAGE_TYPE_KEY = normalizeDamageTypeKey("Plasma");

export type WeaponResourceCost = {
  energyCost?: number;
  heatCost?: number;
};

export type ShipResourceConfig = {
  maxHeat: number;
  heatDissipationPerSecond: number;
  heatDissipationDelaySeconds?: number;
  maxEnergy: number;
  energyRechargePerSecond: number;
  energyRechargeDelaySeconds?: number;
  minEnergyRatio?: number;
  plasmaHeatPerDamage?: number;
};

export type ShipResourceSnapshot = {
  heat: {
    current: number;
    max: number;
    overheated: boolean;
  };
  energy: {
    current: number;
    max: number;
    min: number;
    lowPower: boolean;
  };
  weaponFireIntervalMultiplier: number;
  energyEquipmentEnabled: boolean;
  heatEquipmentEnabled: boolean;
};

export type ShipResourceComponent = {
  update: (deltaTime: number) => void;
  tryConsumeWeaponCost: (cost: WeaponResourceCost) => boolean;
  applyIncomingDamageHeat: (damageType: DamageType, incomingDamage: number) => void;
  getWeaponFireIntervalMultiplier: () => number;
  canFireCannons: () => boolean;
  canUseEnergyEquipment: () => boolean;
  canUseHeatEquipment: () => boolean;
  getSnapshot: () => ShipResourceSnapshot;
  reset: () => void;
};

export function createShipResourceComponent(config: ShipResourceConfig): ShipResourceComponent {
  const maxHeat = clampMin(config.maxHeat, 0);
  const heatDissipationPerSecond = clampMin(config.heatDissipationPerSecond, 0);
  const heatDissipationDelaySeconds = clampMin(
    config.heatDissipationDelaySeconds ?? DEFAULT_HEAT_DISSIPATION_DELAY_SECONDS,
    0
  );
  const maxEnergy = clampMin(config.maxEnergy, 0);
  const energyRechargePerSecond = clampMin(config.energyRechargePerSecond, 0);
  const energyRechargeDelaySeconds = clampMin(
    config.energyRechargeDelaySeconds ?? DEFAULT_ENERGY_RECHARGE_DELAY_SECONDS,
    0
  );
  const minEnergyRatio = clamp(config.minEnergyRatio ?? DEFAULT_MIN_ENERGY_RATIO, 0, 1);
  const minEnergy = -maxEnergy * minEnergyRatio;
  const plasmaHeatPerDamage = clampMin(
    config.plasmaHeatPerDamage ?? DEFAULT_PLASMA_HEAT_PER_DAMAGE,
    0
  );

  let heat = 0;
  let energy = maxEnergy;
  let overheated = false;
  let heatDissipationDelayRemaining = 0;
  let energyRechargeDelayRemaining = 0;
  let overheatClearSecondsRemaining = 0;
  let overheatHeatStart = 0;

  const addHeat = (amount: number): void => {
    if (maxHeat <= 0 || amount <= 0) {
      return;
    }
    if (overheated) {
      return;
    }
    heat += amount;
    heatDissipationDelayRemaining = heatDissipationDelaySeconds;
    if (heat > maxHeat) {
      overheated = true;
      overheatClearSecondsRemaining = OVERHEAT_CLEAR_DURATION_SECONDS;
      overheatHeatStart = Math.max(heat, maxHeat);
      heatDissipationDelayRemaining = 0;
    }
  };

  const canUseEnergyEquipment = (): boolean => {
    if (maxEnergy <= 0) {
      return true;
    }
    return energy > 0;
  };

  const getWeaponFireIntervalMultiplier = (): number => {
    if (maxEnergy > 0 && energy <= 0) {
      return LOW_POWER_FIRE_INTERVAL_MULTIPLIER;
    }
    return 1;
  };

  const update = (deltaTime: number): void => {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (overheated) {
      overheatClearSecondsRemaining = Math.max(0, overheatClearSecondsRemaining - deltaTime);
      const clearProgress01 =
        OVERHEAT_CLEAR_DURATION_SECONDS > 0
          ? overheatClearSecondsRemaining / OVERHEAT_CLEAR_DURATION_SECONDS
          : 0;
      heat = Math.max(0, overheatHeatStart * clearProgress01);
      if (overheatClearSecondsRemaining <= 0) {
        heat = 0;
        overheated = false;
        overheatHeatStart = 0;
      }
    } else {
      heatDissipationDelayRemaining = Math.max(0, heatDissipationDelayRemaining - deltaTime);
      if (heat > 0 && heatDissipationDelayRemaining <= 0) {
        heat = Math.max(0, heat - heatDissipationPerSecond * deltaTime);
      }
    }

    energyRechargeDelayRemaining = Math.max(0, energyRechargeDelayRemaining - deltaTime);

    if (maxEnergy > 0 && energy < maxEnergy && energyRechargeDelayRemaining <= 0) {
      energy = Math.min(maxEnergy, energy + energyRechargePerSecond * deltaTime);
    }
  };

  const tryConsumeWeaponCost = (cost: WeaponResourceCost): boolean => {
    const heatCost = clampMin(cost.heatCost ?? 0, 0);
    const energyCost = clampMin(cost.energyCost ?? 0, 0);

    if (heatCost > 0 && overheated) {
      return false;
    }

    if (heatCost > 0) {
      addHeat(heatCost);
    }
    if (energyCost > 0 && maxEnergy > 0) {
      energy = Math.max(minEnergy, energy - energyCost);
      energyRechargeDelayRemaining = energyRechargeDelaySeconds;
    }

    return true;
  };

  const applyIncomingDamageHeat = (damageType: DamageType, incomingDamage: number): void => {
    if (maxHeat <= 0) {
      return;
    }
    if (normalizeDamageTypeKey(damageType) !== PLASMA_DAMAGE_TYPE_KEY) {
      return;
    }
    const clampedDamage = clampMin(incomingDamage, 0);
    if (clampedDamage <= 0) {
      return;
    }
    addHeat(clampedDamage * plasmaHeatPerDamage);
  };

  const getSnapshot = (): ShipResourceSnapshot => ({
    heat: {
      current: heat,
      max: maxHeat,
      overheated
    },
    energy: {
      current: energy,
      max: maxEnergy,
      min: minEnergy,
      lowPower: maxEnergy > 0 && energy <= 0
    },
    weaponFireIntervalMultiplier: getWeaponFireIntervalMultiplier(),
    energyEquipmentEnabled: canUseEnergyEquipment(),
    heatEquipmentEnabled: !overheated
  });

  return {
    update,
    tryConsumeWeaponCost,
    applyIncomingDamageHeat,
    getWeaponFireIntervalMultiplier,
    canFireCannons: () => !overheated,
    canUseEnergyEquipment,
    canUseHeatEquipment: () => !overheated,
    getSnapshot,
    reset: () => {
      heat = 0;
      energy = maxEnergy;
      overheated = false;
      heatDissipationDelayRemaining = 0;
      energyRechargeDelayRemaining = 0;
      overheatClearSecondsRemaining = 0;
      overheatHeatStart = 0;
    }
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampMin(value: number, min: number): number {
  return Math.max(min, value);
}
