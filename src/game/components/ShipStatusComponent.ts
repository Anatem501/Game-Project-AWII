import * as THREE from "three";
import type { DamageBreakdown } from "./HealthComponent";
import type { DamagePacket } from "./combat/CombatTypes";
import { normalizeDamageTypeKey } from "./combat/DamageTypes";

const CRYO_DAMAGE_TYPE_KEY = normalizeDamageTypeKey("Cryo");
const ION_DAMAGE_TYPE_KEY = normalizeDamageTypeKey("Ion");
const PLASMA_DAMAGE_TYPE_KEY = normalizeDamageTypeKey("Plasma");
const VOID_DAMAGE_TYPE_KEY = normalizeDamageTypeKey("Void");

const DEFAULT_CRYO_CAPACITY = 1000;
const DEFAULT_CRYO_MAX_SPEED_REDUCTION = 0.5;
const DEFAULT_CRYO_PASSIVE_CLEAR_DELAY_SECONDS = 1.5;
const DEFAULT_CRYO_PASSIVE_CLEAR_PER_SECOND = 100;
const DEFAULT_CRYO_FROZEN_CLEAR_PER_SECOND = 200;
const DEFAULT_CRYO_POST_FROZEN_GAIN_LOCKOUT_SECONDS = 5;
const DEFAULT_PLASMA_DAMAGE_TAKEN_MULTIPLIER_WHEN_FROZEN = 1.4;
const DEFAULT_CRYO_DAMAGE_TAKEN_MULTIPLIER_WHEN_FROZEN = 1.2;
const DEFAULT_VOID_DAMAGE_TAKEN_MULTIPLIER_WHEN_FROZEN = 1.2;
const DEFAULT_ELECTROSHOCK_INTERRUPT_DURATION_SECONDS = 0.4;
const DEFAULT_ELECTROSHOCK_IMMUNITY_SECONDS = 10;
const ELECTROSHOCK_IMMUNITY_TRIGGER_HIT_COUNT = 4;
const ELECTROSHOCK_IMMUNITY_TRIGGER_WINDOW_SECONDS = 4;

export type ShipStatusConfig = {
  cryoCapacity?: number;
  cryoMaxSpeedReduction?: number;
  cryoPassiveClearDelaySeconds?: number;
  cryoPassiveClearPerSecond?: number;
  cryoFrozenClearPerSecond?: number;
  cryoPostFrozenGainLockoutSeconds?: number;
  plasmaDamageTakenMultiplierWhenCryofrozen?: number;
  cryoDamageTakenMultiplierWhenCryofrozen?: number;
  voidDamageTakenMultiplierWhenCryofrozen?: number;
  electroshockInterruptDurationSeconds?: number;
  electroshockImmunitySeconds?: number;
};

export type ShipCryoStatusSnapshot = {
  meter: number;
  capacity: number;
  ratio01: number;
  frozen: boolean;
  canGainBuildup: boolean;
  postFrozenGainLockoutSecondsRemaining: number;
  passiveClearDelaySecondsRemaining: number;
  moveSpeedMultiplier: number;
  turnRateMultiplier: number;
  plasmaDamageTakenMultiplier: number;
  cryoDamageTakenMultiplier: number;
  voidDamageTakenMultiplier: number;
};

export type ShipElectroshockStatusSnapshot = {
  meter: number;
  capacity: number;
  ratio01: number;
  electroshocked: boolean;
  canGainBuildup: boolean;
  passiveClearDelaySecondsRemaining: number;
  activeSecondsRemaining: number;
  immunitySecondsRemaining: number;
  interruptSecondsRemaining: number;
  shieldRechargeRateMultiplier: number;
  controlDisabled: boolean;
  fireDisabled: boolean;
  equipmentDisabled: boolean;
};

export type ShipInterruptionSnapshot = {
  active: boolean;
  secondsRemaining: number;
};

export type ShipStatusSnapshot = {
  cryo: ShipCryoStatusSnapshot;
  electroshock: ShipElectroshockStatusSnapshot;
  interruption: ShipInterruptionSnapshot;
};

export type ShipStatusComponent = {
  update: (deltaTime: number) => void;
  reset: () => void;
  syncMotionSample: (forward: THREE.Vector3, velocity: THREE.Vector3) => void;
  applyHeatGain: (amount: number) => number;
  applyHitStatusPayloads: (damagePacket: DamagePacket, breakdown: DamageBreakdown) => void;
  transformIncomingDamagePacket: (damagePacket: DamagePacket) => DamagePacket;
  isCryofrozen: () => boolean;
  getCryofreezeMeter: () => number;
  getCryoVisualIntensity01: () => number;
  isElectroshocked: () => boolean;
  getElectroshockMeter: () => number;
  getElectroshockVisualIntensity01: () => number;
  isInterrupted: () => boolean;
  getInterruptSecondsRemaining: () => number;
  canControlFlight: () => boolean;
  canFireWeapons: () => boolean;
  canUseEquipment: () => boolean;
  getShieldRechargeRateMultiplier: () => number;
  getMoveSpeedMultiplier: () => number;
  getTurnRateMultiplier: () => number;
  getLockedAimForward: (out: THREE.Vector3) => THREE.Vector3 | null;
  getFrozenDriftVelocity: (out: THREE.Vector3) => THREE.Vector3 | null;
  getSnapshot: () => ShipStatusSnapshot;
};

export function createShipStatusComponent(config: ShipStatusConfig = {}): ShipStatusComponent {
  const cryoCapacity = Math.max(1, config.cryoCapacity ?? DEFAULT_CRYO_CAPACITY);
  const cryoMaxSpeedReduction = THREE.MathUtils.clamp(
    config.cryoMaxSpeedReduction ?? DEFAULT_CRYO_MAX_SPEED_REDUCTION,
    0,
    0.99
  );
  const cryoPassiveClearDelaySeconds = Math.max(
    0,
    config.cryoPassiveClearDelaySeconds ?? DEFAULT_CRYO_PASSIVE_CLEAR_DELAY_SECONDS
  );
  const cryoPassiveClearPerSecond = Math.max(
    0,
    config.cryoPassiveClearPerSecond ?? DEFAULT_CRYO_PASSIVE_CLEAR_PER_SECOND
  );
  const cryoFrozenClearPerSecond = Math.max(
    0,
    config.cryoFrozenClearPerSecond ?? DEFAULT_CRYO_FROZEN_CLEAR_PER_SECOND
  );
  const cryoPostFrozenGainLockoutSeconds = Math.max(
    0,
    config.cryoPostFrozenGainLockoutSeconds ?? DEFAULT_CRYO_POST_FROZEN_GAIN_LOCKOUT_SECONDS
  );
  const plasmaDamageTakenMultiplierWhenCryofrozen = Math.max(
    1,
    config.plasmaDamageTakenMultiplierWhenCryofrozen ??
      DEFAULT_PLASMA_DAMAGE_TAKEN_MULTIPLIER_WHEN_FROZEN
  );
  const cryoDamageTakenMultiplierWhenCryofrozen = Math.max(
    1,
    config.cryoDamageTakenMultiplierWhenCryofrozen ??
      DEFAULT_CRYO_DAMAGE_TAKEN_MULTIPLIER_WHEN_FROZEN
  );
  const voidDamageTakenMultiplierWhenCryofrozen = Math.max(
    1,
    config.voidDamageTakenMultiplierWhenCryofrozen ??
      DEFAULT_VOID_DAMAGE_TAKEN_MULTIPLIER_WHEN_FROZEN
  );
  const electroshockInterruptDurationSeconds = Math.max(
    0,
    config.electroshockInterruptDurationSeconds ?? DEFAULT_ELECTROSHOCK_INTERRUPT_DURATION_SECONDS
  );
  const electroshockImmunitySeconds = Math.max(
    0,
    config.electroshockImmunitySeconds ?? DEFAULT_ELECTROSHOCK_IMMUNITY_SECONDS
  );

  const motionForwardSample = new THREE.Vector3(0, 0, -1);
  const motionVelocitySample = new THREE.Vector3();
  const frozenLockedAimForward = new THREE.Vector3(0, 0, -1);
  const frozenDriftVelocity = new THREE.Vector3();

  let cryoMeter = 0;
  let cryofrozen = false;
  let timeSinceCryoGainSeconds = Number.POSITIVE_INFINITY;
  let cryoPostFrozenGainLockoutSecondsRemaining = 0;
  let electroshocked = false;
  let electroshockImmunitySecondsRemaining = 0;
  let interruptSecondsRemaining = 0;
  const electroshockInterruptHitAgesSeconds: number[] = [];

  const getCryoRatio01 = (): number => THREE.MathUtils.clamp(cryoMeter / cryoCapacity, 0, 1);
  const getElectroshockRatio01 = (): number => (electroshocked ? 1 : 0);

  const canGainCryoBuildup = (): boolean =>
    !cryofrozen && cryoPostFrozenGainLockoutSecondsRemaining <= 0;

  const canApplyElectroshockProc = (): boolean => electroshockImmunitySecondsRemaining <= 0;

  const isInterrupted = (): boolean => interruptSecondsRemaining > 0;

  const canControlFlight = (): boolean => !cryofrozen;

  const canFireWeapons = (): boolean => !cryofrozen && !isInterrupted();

  const canUseEquipment = (): boolean => !cryofrozen;

  const getShieldRechargeRateMultiplier = (): number => 1;

  const captureFrozenMotion = (): void => {
    frozenDriftVelocity.copy(motionVelocitySample);
    frozenLockedAimForward.copy(motionForwardSample).setY(0);
    if (frozenLockedAimForward.lengthSq() <= 0.000001) {
      frozenLockedAimForward.set(0, 0, -1);
    } else {
      frozenLockedAimForward.normalize();
    }
  };

  const enterCryofrozen = (): void => {
    if (cryofrozen) {
      return;
    }
    cryofrozen = true;
    cryoMeter = Math.min(cryoCapacity, cryoMeter);
    captureFrozenMotion();
  };

  const exitCryofrozen = (): void => {
    if (!cryofrozen) {
      return;
    }
    cryofrozen = false;
    cryoMeter = 0;
    cryoPostFrozenGainLockoutSecondsRemaining = cryoPostFrozenGainLockoutSeconds;
    timeSinceCryoGainSeconds = Number.POSITIVE_INFINITY;
  };

  const removeCryoMeter = (amount: number): number => {
    const clampedAmount = Math.max(0, amount);
    if (clampedAmount <= 0 || cryoMeter <= 0) {
      return 0;
    }
    const removed = Math.min(clampedAmount, cryoMeter);
    cryoMeter = Math.max(0, cryoMeter - removed);
    if (cryofrozen && cryoMeter <= 0) {
      exitCryofrozen();
    }
    return removed;
  };

  const addCryoMeter = (amount: number): number => {
    const clampedAmount = Math.max(0, amount);
    if (clampedAmount <= 0 || !canGainCryoBuildup()) {
      return 0;
    }
    const before = cryoMeter;
    cryoMeter = Math.min(cryoCapacity, cryoMeter + clampedAmount);
    timeSinceCryoGainSeconds = 0;
    if (cryoMeter >= cryoCapacity) {
      enterCryofrozen();
    }
    return cryoMeter - before;
  };

  const pruneElectroshockInterruptHistory = (): void => {
    for (let i = electroshockInterruptHitAgesSeconds.length - 1; i >= 0; i -= 1) {
      if (electroshockInterruptHitAgesSeconds[i] > ELECTROSHOCK_IMMUNITY_TRIGGER_WINDOW_SECONDS) {
        electroshockInterruptHitAgesSeconds.splice(i, 1);
      }
    }
  };

  const triggerElectroshockInterrupt = (): void => {
    electroshocked = true;
    interruptSecondsRemaining = electroshockInterruptDurationSeconds;
    electroshockInterruptHitAgesSeconds.push(0);
    pruneElectroshockInterruptHistory();
    if (electroshockInterruptHitAgesSeconds.length <= ELECTROSHOCK_IMMUNITY_TRIGGER_HIT_COUNT) {
      return;
    }
    electroshockImmunitySecondsRemaining = electroshockImmunitySeconds;
    electroshockInterruptHitAgesSeconds.length = 0;
  };

  const transformIncomingDamagePacket = (damagePacket: DamagePacket): DamagePacket => {
    if (!cryofrozen) {
      return damagePacket;
    }
    const getFrozenVulnerabilityMultiplier = (damageType: string): number => {
      const key = normalizeDamageTypeKey(damageType);
      if (key === PLASMA_DAMAGE_TYPE_KEY) {
        return plasmaDamageTakenMultiplierWhenCryofrozen;
      }
      if (key === CRYO_DAMAGE_TYPE_KEY) {
        return cryoDamageTakenMultiplierWhenCryofrozen;
      }
      if (key === VOID_DAMAGE_TYPE_KEY) {
        return voidDamageTakenMultiplierWhenCryofrozen;
      }
      return 1;
    };

    if (
      plasmaDamageTakenMultiplierWhenCryofrozen <= 1 &&
      cryoDamageTakenMultiplierWhenCryofrozen <= 1 &&
      voidDamageTakenMultiplierWhenCryofrozen <= 1
    ) {
      return damagePacket;
    }

    let changed = false;
    let amount = damagePacket.amount;
    const rootDamageMultiplier = getFrozenVulnerabilityMultiplier(damagePacket.damageType);
    if (amount > 0 && rootDamageMultiplier > 1) {
      amount *= rootDamageMultiplier;
      changed = true;
    }

    let segments = damagePacket.segments;
    if (segments && segments.length > 0) {
      const nextSegments = segments.map((segment) => {
        const segmentMultiplier = getFrozenVulnerabilityMultiplier(segment.damageType);
        if (segment.amount > 0 && segmentMultiplier > 1) {
          changed = true;
          return {
            ...segment,
            amount: segment.amount * segmentMultiplier
          };
        }
        return segment;
      });
      if (changed) {
        segments = nextSegments;
      }
    }

    if (!changed) {
      return damagePacket;
    }

    return {
      ...damagePacket,
      amount,
      segments
    };
  };

  return {
    update: (deltaTime: number): void => {
      if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
        return;
      }

      if (cryoPostFrozenGainLockoutSecondsRemaining > 0) {
        cryoPostFrozenGainLockoutSecondsRemaining = Math.max(
          0,
          cryoPostFrozenGainLockoutSecondsRemaining - deltaTime
        );
      }
      if (electroshockImmunitySecondsRemaining > 0) {
        electroshockImmunitySecondsRemaining = Math.max(
          0,
          electroshockImmunitySecondsRemaining - deltaTime
        );
      }
      interruptSecondsRemaining = Math.max(0, interruptSecondsRemaining - deltaTime);
      for (let i = 0; i < electroshockInterruptHitAgesSeconds.length; i += 1) {
        electroshockInterruptHitAgesSeconds[i] += deltaTime;
      }
      pruneElectroshockInterruptHistory();

      if (cryoMeter <= 0) {
        timeSinceCryoGainSeconds = Number.POSITIVE_INFINITY;
      } else if (cryofrozen) {
        removeCryoMeter(cryoFrozenClearPerSecond * deltaTime);
      } else {
        timeSinceCryoGainSeconds += deltaTime;
        if (timeSinceCryoGainSeconds >= cryoPassiveClearDelaySeconds) {
          removeCryoMeter(cryoPassiveClearPerSecond * deltaTime);
        }
      }
      electroshocked = interruptSecondsRemaining > 0;
    },
    reset: (): void => {
      cryoMeter = 0;
      cryofrozen = false;
      timeSinceCryoGainSeconds = Number.POSITIVE_INFINITY;
      cryoPostFrozenGainLockoutSecondsRemaining = 0;
      electroshocked = false;
      electroshockImmunitySecondsRemaining = 0;
      interruptSecondsRemaining = 0;
      electroshockInterruptHitAgesSeconds.length = 0;
      frozenDriftVelocity.set(0, 0, 0);
      frozenLockedAimForward.set(0, 0, -1);
      motionForwardSample.set(0, 0, -1);
      motionVelocitySample.set(0, 0, 0);
    },
    syncMotionSample: (forward: THREE.Vector3, velocity: THREE.Vector3): void => {
      motionForwardSample.copy(forward).setY(0);
      if (motionForwardSample.lengthSq() <= 0.000001) {
        motionForwardSample.set(0, 0, -1);
      } else {
        motionForwardSample.normalize();
      }
      motionVelocitySample.copy(velocity);
    },
    applyHeatGain: (amount: number): number => removeCryoMeter(amount),
    applyHitStatusPayloads: (damagePacket: DamagePacket, breakdown: DamageBreakdown): void => {
      const totalLandedDamage = Math.max(
        0,
        breakdown.toShield + breakdown.toArmor + breakdown.toHull
      );
      if (totalLandedDamage <= 0) {
        return;
      }

      if (!damagePacket.statusPayloads || damagePacket.statusPayloads.length <= 0) {
        return;
      }

      const cryoEligibleLandedDamage = Math.max(0, breakdown.toArmor + breakdown.toHull);
      const nonShieldRatio =
        totalLandedDamage > 0 ? cryoEligibleLandedDamage / totalLandedDamage : 0;
      const electroshockEligibleLandedDamage = cryoEligibleLandedDamage;
      const canAttemptElectroshockProc =
        canApplyElectroshockProc() &&
        breakdown.toShield <= 0 &&
        electroshockEligibleLandedDamage > 0;

      let cryoBuildupToApply = 0;
      let shouldApplyElectroshock = false;
      for (const payload of damagePacket.statusPayloads) {
        if (payload.kind === "cryo_buildup") {
          if (nonShieldRatio > 0) {
            cryoBuildupToApply += Math.max(0, payload.amount) * nonShieldRatio;
          }
          continue;
        }
        if (payload.kind === "electroshock_on_hit" && canAttemptElectroshockProc) {
          const chance01 = THREE.MathUtils.clamp(payload.chance01, 0, 1);
          if (Math.random() < chance01) {
            shouldApplyElectroshock = true;
            break;
          }
        }
      }
      if (cryoBuildupToApply > 0) {
        addCryoMeter(cryoBuildupToApply);
      }
      if (shouldApplyElectroshock) {
        triggerElectroshockInterrupt();
      }
    },
    transformIncomingDamagePacket,
    isCryofrozen: (): boolean => cryofrozen,
    getCryofreezeMeter: (): number => cryoMeter,
    getCryoVisualIntensity01: (): number => getCryoRatio01(),
    isElectroshocked: (): boolean => electroshocked,
    getElectroshockMeter: (): number => (electroshocked ? 1 : 0),
    getElectroshockVisualIntensity01: (): number => getElectroshockRatio01(),
    isInterrupted,
    getInterruptSecondsRemaining: (): number =>
      isInterrupted() ? interruptSecondsRemaining : 0,
    canControlFlight,
    canFireWeapons,
    canUseEquipment,
    getShieldRechargeRateMultiplier,
    getMoveSpeedMultiplier: (): number => {
      if (!canControlFlight()) {
        return 0;
      }
      return 1 - getCryoRatio01() * cryoMaxSpeedReduction;
    },
    getTurnRateMultiplier: (): number => {
      if (!canControlFlight()) {
        return 0;
      }
      return 1 - getCryoRatio01() * cryoMaxSpeedReduction;
    },
    getLockedAimForward: (out: THREE.Vector3): THREE.Vector3 | null => {
      if (!cryofrozen) {
        return null;
      }
      return out.copy(frozenLockedAimForward);
    },
    getFrozenDriftVelocity: (out: THREE.Vector3): THREE.Vector3 | null => {
      if (!cryofrozen) {
        return null;
      }
      return out.copy(frozenDriftVelocity);
    },
    getSnapshot: (): ShipStatusSnapshot => {
      const ratio01 = getCryoRatio01();
      const electroshockRatio01 = getElectroshockRatio01();
      const passiveClearDelaySecondsRemaining = cryofrozen
        ? 0
        : Math.max(0, cryoPassiveClearDelaySeconds - timeSinceCryoGainSeconds);
      const interruptionSecondsRemaining = isInterrupted() ? interruptSecondsRemaining : 0;

      return {
        cryo: {
          meter: cryoMeter,
          capacity: cryoCapacity,
          ratio01,
          frozen: cryofrozen,
          canGainBuildup: canGainCryoBuildup(),
          postFrozenGainLockoutSecondsRemaining: cryoPostFrozenGainLockoutSecondsRemaining,
          passiveClearDelaySecondsRemaining: Number.isFinite(passiveClearDelaySecondsRemaining)
            ? passiveClearDelaySecondsRemaining
            : 0,
          moveSpeedMultiplier: cryofrozen ? 0 : 1 - ratio01 * cryoMaxSpeedReduction,
          turnRateMultiplier: cryofrozen ? 0 : 1 - ratio01 * cryoMaxSpeedReduction,
          plasmaDamageTakenMultiplier: cryofrozen
            ? plasmaDamageTakenMultiplierWhenCryofrozen
            : 1,
          cryoDamageTakenMultiplier: cryofrozen ? cryoDamageTakenMultiplierWhenCryofrozen : 1,
          voidDamageTakenMultiplier: cryofrozen ? voidDamageTakenMultiplierWhenCryofrozen : 1
        },
        electroshock: {
          meter: electroshocked ? 1 : 0,
          capacity: 1,
          ratio01: electroshockRatio01,
          electroshocked,
          canGainBuildup: canApplyElectroshockProc(),
          passiveClearDelaySecondsRemaining: 0,
          activeSecondsRemaining: electroshocked ? interruptSecondsRemaining : 0,
          immunitySecondsRemaining: electroshockImmunitySecondsRemaining,
          interruptSecondsRemaining: interruptionSecondsRemaining,
          shieldRechargeRateMultiplier: getShieldRechargeRateMultiplier(),
          controlDisabled: !canControlFlight(),
          fireDisabled: !canFireWeapons(),
          equipmentDisabled: !canUseEquipment()
        },
        interruption: {
          active: interruptionSecondsRemaining > 0,
          secondsRemaining: interruptionSecondsRemaining
        }
      };
    }
  };
}

export function damagePacketHasCryoBuildupPayload(damagePacket: DamagePacket): boolean {
  if (!damagePacket.statusPayloads || damagePacket.statusPayloads.length <= 0) {
    return false;
  }
  return damagePacket.statusPayloads.some(
    (payload) => payload.kind === "cryo_buildup" && payload.amount > 0
  );
}

export function damagePacketHasElectroshockOnHitPayload(damagePacket: DamagePacket): boolean {
  if (!damagePacket.statusPayloads || damagePacket.statusPayloads.length <= 0) {
    return false;
  }
  return damagePacket.statusPayloads.some(
    (payload) =>
      payload.kind === "electroshock_on_hit" &&
      THREE.MathUtils.clamp(payload.chance01, 0, 1) > 0
  );
}

export function damagePacketIsCryoDamage(damagePacket: DamagePacket): boolean {
  if (normalizeDamageTypeKey(damagePacket.damageType) === CRYO_DAMAGE_TYPE_KEY) {
    return true;
  }
  return (
    damagePacket.segments?.some(
      (segment) =>
        segment.amount > 0 && normalizeDamageTypeKey(segment.damageType) === CRYO_DAMAGE_TYPE_KEY
    ) ?? false
  );
}

export function damagePacketIsIonDamage(damagePacket: DamagePacket): boolean {
  if (normalizeDamageTypeKey(damagePacket.damageType) === ION_DAMAGE_TYPE_KEY) {
    return true;
  }
  return (
    damagePacket.segments?.some(
      (segment) =>
        segment.amount > 0 && normalizeDamageTypeKey(segment.damageType) === ION_DAMAGE_TYPE_KEY
    ) ?? false
  );
}
