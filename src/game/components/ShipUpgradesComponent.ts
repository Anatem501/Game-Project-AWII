export const SHIP_UPGRADE_LEVEL_MIN = 1;
export const SHIP_UPGRADE_LEVEL_MAX = 10;
export const SHIP_UPGRADE_LEVEL_UNUPGRADED = 0;

export const SHIP_UPGRADE_STAT_IDS = [
  "cannons",
  "missileBays",
  "torpedoLaunchers",
  "beamEmitters",
  "shield",
  "armor",
  "hull",
  "defenses",
  "thrusters",
  "equipmentHardpoints",
  "energyCore"
] as const;

export type ShipUpgradeStatId = (typeof SHIP_UPGRADE_STAT_IDS)[number];

export type ShipUpgradeLevels = Record<ShipUpgradeStatId, number>;

export type ShipUpgradeLevelPatch = Partial<ShipUpgradeLevels>;

export type ShipUpgradesComponent = {
  getLevels: () => ShipUpgradeLevels;
  getLevel: (statId: ShipUpgradeStatId) => number;
  setLevel: (statId: ShipUpgradeStatId, level: number) => number;
  applyLevels: (levels: ShipUpgradeLevelPatch) => ShipUpgradeLevels;
  reset: () => void;
};

export function createDefaultShipUpgradeLevels(): ShipUpgradeLevels {
  return {
    cannons: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    missileBays: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    torpedoLaunchers: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    beamEmitters: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    shield: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    armor: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    hull: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    defenses: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    thrusters: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    equipmentHardpoints: SHIP_UPGRADE_LEVEL_UNUPGRADED,
    energyCore: SHIP_UPGRADE_LEVEL_UNUPGRADED
  };
}

export function createShipUpgradesComponent(
  initialLevels: ShipUpgradeLevelPatch = {}
): ShipUpgradesComponent {
  let levels = sanitizeShipUpgradeLevels(initialLevels);

  return {
    getLevels: () => ({ ...levels }),
    getLevel: (statId) => levels[statId],
    setLevel: (statId, level) => {
      const nextLevel = sanitizeShipUpgradeLevel(level);
      levels = {
        ...levels,
        [statId]: nextLevel
      };
      return nextLevel;
    },
    applyLevels: (patch) => {
      levels = sanitizeShipUpgradeLevels({
        ...levels,
        ...patch
      });
      return { ...levels };
    },
    reset: () => {
      levels = createDefaultShipUpgradeLevels();
    }
  };
}

export function sanitizeShipUpgradeLevels(levels: ShipUpgradeLevelPatch): ShipUpgradeLevels {
  const defaults = createDefaultShipUpgradeLevels();
  const sanitized = { ...defaults };
  for (const statId of SHIP_UPGRADE_STAT_IDS) {
    sanitized[statId] = sanitizeShipUpgradeLevel(levels[statId] ?? defaults[statId]);
  }
  return sanitized;
}

function sanitizeShipUpgradeLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return SHIP_UPGRADE_LEVEL_UNUPGRADED;
  }
  const clamped = Math.min(
    SHIP_UPGRADE_LEVEL_MAX,
    Math.max(SHIP_UPGRADE_LEVEL_UNUPGRADED, Math.round(level))
  );
  return clamped;
}
