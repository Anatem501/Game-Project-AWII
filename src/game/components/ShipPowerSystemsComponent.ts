import {
  SHIP_UPGRADE_LEVEL_MAX,
  SHIP_UPGRADE_LEVEL_UNUPGRADED
} from "./ShipUpgradesComponent";

// Level 0 represents an unpowered system so ships can start with 0 AP.
export const SHIP_POWER_LEVEL_MIN = 1;
export const SHIP_POWER_LEVEL_MAX = 5;
export const SHIP_POWER_LEVEL_UNPOWERED = 0;
export const DEFAULT_AP_PER_ENERGY_CORE_UPGRADE_LEVEL = 1;

export const SHIP_POWER_LEVEL_AP_COST: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
  5: 9
};

export const SHIP_POWER_SYSTEM_IDS = [
  "thermalOscillators",
  "energizerConduits",
  "powerRegulators",
  "projectileDeflectors",
  "structuralStabilizers",
  "automationMachinery",
  "quantumProcessors",
  "fluxReducers"
] as const;

export type ShipPowerSystemId = (typeof SHIP_POWER_SYSTEM_IDS)[number];

export type ShipPowerSystemLevels = Record<ShipPowerSystemId, number>;

export type ShipPowerSystemLevelPatch = Partial<ShipPowerSystemLevels>;

export type ShipPowerApConfig = {
  baseApPoints: number;
  energyCoreUpgradeLevel: number;
  energyCoreApPerUpgradeLevel: number;
};

export type ShipPowerSystemsState = {
  ap: ShipPowerApConfig;
  levels: ShipPowerSystemLevels;
};

export type ShipPowerApBudgetSnapshot = {
  totalApPoints: number;
  spentApPoints: number;
  availableApPoints: number;
  baseApPoints: number;
  energyCoreUpgradeLevel: number;
  energyCoreApPerUpgradeLevel: number;
  energyCoreDerivedApPoints: number;
};

export type ShipPowerSystemsComponent = {
  getState: () => ShipPowerSystemsState;
  getLevels: () => ShipPowerSystemLevels;
  getSystemLevel: (systemId: ShipPowerSystemId) => number;
  getApBudgetSnapshot: () => ShipPowerApBudgetSnapshot;
  canSetSystemLevel: (systemId: ShipPowerSystemId, level: number) => boolean;
  trySetSystemLevel: (systemId: ShipPowerSystemId, level: number) => boolean;
  applyLevels: (patch: ShipPowerSystemLevelPatch) => ShipPowerSystemLevels;
  setBaseApPoints: (points: number) => void;
  setEnergyCoreUpgradeLevel: (level: number) => void;
  setEnergyCoreApPerUpgradeLevel: (points: number) => void;
  reset: () => void;
};

export function createDefaultShipPowerSystemLevels(): ShipPowerSystemLevels {
  return {
    thermalOscillators: SHIP_POWER_LEVEL_UNPOWERED,
    energizerConduits: SHIP_POWER_LEVEL_UNPOWERED,
    powerRegulators: SHIP_POWER_LEVEL_UNPOWERED,
    projectileDeflectors: SHIP_POWER_LEVEL_UNPOWERED,
    structuralStabilizers: SHIP_POWER_LEVEL_UNPOWERED,
    automationMachinery: SHIP_POWER_LEVEL_UNPOWERED,
    quantumProcessors: SHIP_POWER_LEVEL_UNPOWERED,
    fluxReducers: SHIP_POWER_LEVEL_UNPOWERED
  };
}

export function createDefaultShipPowerSystemsState(): ShipPowerSystemsState {
  return {
    ap: {
      baseApPoints: 0,
      energyCoreUpgradeLevel: SHIP_UPGRADE_LEVEL_UNUPGRADED,
      energyCoreApPerUpgradeLevel: DEFAULT_AP_PER_ENERGY_CORE_UPGRADE_LEVEL
    },
    levels: createDefaultShipPowerSystemLevels()
  };
}

export function createShipPowerSystemsStateFromEnergyCoreUpgrade(
  energyCoreUpgradeLevel: number,
  options: {
    baseApPoints?: number;
    energyCoreApPerUpgradeLevel?: number;
    levels?: ShipPowerSystemLevelPatch;
  } = {}
): ShipPowerSystemsState {
  const defaults = createDefaultShipPowerSystemsState();
  return sanitizeShipPowerSystemsState({
    ap: {
      baseApPoints: options.baseApPoints ?? defaults.ap.baseApPoints,
      energyCoreUpgradeLevel,
      energyCoreApPerUpgradeLevel:
        options.energyCoreApPerUpgradeLevel ?? defaults.ap.energyCoreApPerUpgradeLevel
    },
    levels: {
      ...defaults.levels,
      ...(options.levels ?? {})
    }
  });
}

export function createShipPowerSystemsComponent(
  initialState: Partial<ShipPowerSystemsState> = {}
): ShipPowerSystemsComponent {
  const defaultState = createDefaultShipPowerSystemsState();
  const defaultAp = defaultState.ap;
  const defaultLevels = defaultState.levels;
  let state = sanitizeShipPowerSystemsState({
    ap: {
      baseApPoints: initialState.ap?.baseApPoints ?? defaultAp.baseApPoints,
      energyCoreUpgradeLevel:
        initialState.ap?.energyCoreUpgradeLevel ?? defaultAp.energyCoreUpgradeLevel,
      energyCoreApPerUpgradeLevel:
        initialState.ap?.energyCoreApPerUpgradeLevel ?? defaultAp.energyCoreApPerUpgradeLevel
    },
    levels: {
      ...defaultLevels,
      ...(initialState.levels ?? {})
    }
  });

  const canSetSystemLevel = (systemId: ShipPowerSystemId, level: number): boolean => {
    const targetLevel = sanitizeShipPowerSystemLevel(level);
    const nextLevels = {
      ...state.levels,
      [systemId]: targetLevel
    };
    const spentApPoints = calculateTotalShipPowerSystemsApCost(nextLevels);
    return spentApPoints <= getTotalApPoints(state.ap);
  };

  const getApBudgetSnapshot = (): ShipPowerApBudgetSnapshot => {
    const totalApPoints = getTotalApPoints(state.ap);
    const spentApPoints = calculateTotalShipPowerSystemsApCost(state.levels);
    const energyCoreDerivedApPoints =
      state.ap.energyCoreUpgradeLevel * state.ap.energyCoreApPerUpgradeLevel;
    return {
      totalApPoints,
      spentApPoints,
      availableApPoints: Math.max(0, totalApPoints - spentApPoints),
      baseApPoints: state.ap.baseApPoints,
      energyCoreUpgradeLevel: state.ap.energyCoreUpgradeLevel,
      energyCoreApPerUpgradeLevel: state.ap.energyCoreApPerUpgradeLevel,
      energyCoreDerivedApPoints
    };
  };

  return {
    getState: () => ({
      ap: { ...state.ap },
      levels: { ...state.levels }
    }),
    getLevels: () => ({ ...state.levels }),
    getSystemLevel: (systemId) => state.levels[systemId],
    getApBudgetSnapshot,
    canSetSystemLevel,
    trySetSystemLevel: (systemId, level) => {
      if (!canSetSystemLevel(systemId, level)) {
        return false;
      }
      state = {
        ...state,
        levels: {
          ...state.levels,
          [systemId]: sanitizeShipPowerSystemLevel(level)
        }
      };
      return true;
    },
    applyLevels: (patch) => {
      const nextLevels = sanitizeShipPowerSystemLevels({
        ...state.levels,
        ...patch
      });
      const totalApPoints = getTotalApPoints(state.ap);
      const spentApPoints = calculateTotalShipPowerSystemsApCost(nextLevels);
      if (spentApPoints > totalApPoints) {
        return { ...state.levels };
      }
      state = {
        ...state,
        levels: nextLevels
      };
      return { ...state.levels };
    },
    setBaseApPoints: (points) => {
      state = {
        ...state,
        ap: {
          ...state.ap,
          baseApPoints: sanitizeApPoints(points)
        }
      };
    },
    setEnergyCoreUpgradeLevel: (level) => {
      state = {
        ...state,
        ap: {
          ...state.ap,
          energyCoreUpgradeLevel: sanitizeEnergyCoreUpgradeLevel(level)
        }
      };
    },
    setEnergyCoreApPerUpgradeLevel: (points) => {
      state = {
        ...state,
        ap: {
          ...state.ap,
          energyCoreApPerUpgradeLevel: sanitizeApPoints(points)
        }
      };
    },
    reset: () => {
      state = createDefaultShipPowerSystemsState();
    }
  };
}

export function sanitizeShipPowerSystemsState(state: ShipPowerSystemsState): ShipPowerSystemsState {
  return {
    ap: {
      baseApPoints: sanitizeApPoints(state.ap.baseApPoints),
      energyCoreUpgradeLevel: sanitizeEnergyCoreUpgradeLevel(state.ap.energyCoreUpgradeLevel),
      energyCoreApPerUpgradeLevel: sanitizeApPoints(state.ap.energyCoreApPerUpgradeLevel)
    },
    levels: sanitizeShipPowerSystemLevels(state.levels)
  };
}

export function sanitizeShipPowerSystemLevels(
  levels: ShipPowerSystemLevelPatch
): ShipPowerSystemLevels {
  const defaults = createDefaultShipPowerSystemLevels();
  const sanitized = { ...defaults };
  for (const statId of SHIP_POWER_SYSTEM_IDS) {
    sanitized[statId] = sanitizeShipPowerSystemLevel(levels[statId] ?? defaults[statId]);
  }
  return sanitized;
}

export function calculateShipPowerSystemLevelApCost(level: number): number {
  const clampedLevel = sanitizeShipPowerSystemLevel(level);
  if (clampedLevel <= SHIP_POWER_LEVEL_UNPOWERED) {
    return 0;
  }
  let cost = 0;
  for (let nextLevel = SHIP_POWER_LEVEL_MIN; nextLevel <= clampedLevel; nextLevel += 1) {
    cost += SHIP_POWER_LEVEL_AP_COST[nextLevel] ?? 0;
  }
  return cost;
}

export function calculateTotalShipPowerSystemsApCost(levels: ShipPowerSystemLevels): number {
  let total = 0;
  for (const systemId of SHIP_POWER_SYSTEM_IDS) {
    total += calculateShipPowerSystemLevelApCost(levels[systemId]);
  }
  return total;
}

function getTotalApPoints(apConfig: ShipPowerApConfig): number {
  const baseApPoints = sanitizeApPoints(apConfig.baseApPoints);
  const energyCoreUpgradeLevel = sanitizeEnergyCoreUpgradeLevel(apConfig.energyCoreUpgradeLevel);
  const energyCoreApPerUpgradeLevel = sanitizeApPoints(apConfig.energyCoreApPerUpgradeLevel);
  return baseApPoints + energyCoreUpgradeLevel * energyCoreApPerUpgradeLevel;
}

function sanitizeShipPowerSystemLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return SHIP_POWER_LEVEL_UNPOWERED;
  }
  const clamped = Math.min(
    SHIP_POWER_LEVEL_MAX,
    Math.max(SHIP_POWER_LEVEL_UNPOWERED, Math.round(level))
  );
  return clamped;
}

function sanitizeApPoints(points: number): number {
  if (!Number.isFinite(points)) {
    return 0;
  }
  return Math.max(0, Math.round(points));
}

function sanitizeEnergyCoreUpgradeLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return SHIP_UPGRADE_LEVEL_UNUPGRADED;
  }
  const rounded = Math.round(level);
  return Math.min(
    SHIP_UPGRADE_LEVEL_MAX,
    Math.max(SHIP_UPGRADE_LEVEL_UNUPGRADED, rounded)
  );
}
