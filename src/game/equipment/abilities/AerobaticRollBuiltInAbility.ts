import * as THREE from "three";
import type { ShipController, ShipTemporaryManeuverKind } from "../../controllers/ShipController";
import type {
  PlayerBuiltInEquipmentAbility,
  PlayerBuiltInEquipmentAbilityInput,
  PlayerBuiltInEquipmentAbilityHudSnapshot
} from "./PlayerBuiltInEquipmentAbility";

const AEROBATIC_ROLL_CHARGE_RECHARGE_SECONDS = 4;
const AEROBATIC_ROLL_MAX_CHARGES = 2;

type AerobaticRollBuiltInAbilityParams = {
  shipController: Pick<ShipController, "startTemporaryManeuver">;
  chargeRechargeSeconds?: number;
  maxCharges?: number;
};

export function createAerobaticRollBuiltInAbility({
  shipController,
  chargeRechargeSeconds = AEROBATIC_ROLL_CHARGE_RECHARGE_SECONDS,
  maxCharges = AEROBATIC_ROLL_MAX_CHARGES
}: AerobaticRollBuiltInAbilityParams): PlayerBuiltInEquipmentAbility {
  let triggerHeld = false;
  const clampedMaxCharges = Math.max(1, Math.floor(maxCharges));
  const rechargeDurationSeconds = Math.max(0.001, chargeRechargeSeconds);
  const chargeTimersSecondsRemaining = Array.from({ length: clampedMaxCharges }, () => 0);

  const tryActivate = (input: PlayerBuiltInEquipmentAbilityInput): void => {
    if (input.repeat) {
      return;
    }
    const maneuverKind = resolveAerobaticRollManeuver(input.pressedKeys);
    if (!maneuverKind) {
      return;
    }
    const availableChargeIndex = chargeTimersSecondsRemaining.findIndex((seconds) => seconds <= 0.001);
    if (availableChargeIndex < 0) {
      return;
    }
    if (!shipController.startTemporaryManeuver(maneuverKind)) {
      return;
    }
    chargeTimersSecondsRemaining[availableChargeIndex] = rechargeDurationSeconds;
  };

  const buildHudSnapshot = (): PlayerBuiltInEquipmentAbilityHudSnapshot => {
    let chargesAvailable = 0;
    let nextChargeSecondsRemaining = Number.POSITIVE_INFINITY;
    const chargeProgress01BySlot = chargeTimersSecondsRemaining.map((secondsRemaining) => {
      if (secondsRemaining <= 0.001) {
        chargesAvailable += 1;
        nextChargeSecondsRemaining = Math.min(nextChargeSecondsRemaining, 0);
        return 1;
      }
      nextChargeSecondsRemaining = Math.min(nextChargeSecondsRemaining, secondsRemaining);
      return 1 - THREE.MathUtils.clamp(secondsRemaining / rechargeDurationSeconds, 0, 1);
    });

    return {
      label: "Aerobatic Roll",
      chargeProgress01BySlot,
      chargesAvailable,
      chargesMax: clampedMaxCharges,
      isRecharging: chargesAvailable < clampedMaxCharges,
      nextChargeSecondsRemaining:
        nextChargeSecondsRemaining === Number.POSITIVE_INFINITY ? 0 : nextChargeSecondsRemaining
    };
  };

  return {
    id: "aerobatic_roll",
    update: (deltaTime: number): void => {
      if (deltaTime <= 0) {
        return;
      }
      for (let i = 0; i < chargeTimersSecondsRemaining.length; i += 1) {
        if (chargeTimersSecondsRemaining[i] <= 0) {
          continue;
        }
        chargeTimersSecondsRemaining[i] = Math.max(0, chargeTimersSecondsRemaining[i] - deltaTime);
      }
    },
    onTriggerPressed: (input: PlayerBuiltInEquipmentAbilityInput): void => {
      triggerHeld = true;
      tryActivate(input);
    },
    onTriggerReleased: (): void => {
      triggerHeld = false;
    },
    onMovementKeysChanged: (input: PlayerBuiltInEquipmentAbilityInput): void => {
      if (!triggerHeld) {
        return;
      }
      tryActivate(input);
    },
    onInputsCleared: (): void => {
      triggerHeld = false;
    },
    getHudSnapshot: (): PlayerBuiltInEquipmentAbilityHudSnapshot => buildHudSnapshot()
  };
}

function resolveAerobaticRollManeuver(
  pressedKeys: ReadonlySet<string>
): ShipTemporaryManeuverKind | null {
  const hasA = pressedKeys.has("a");
  const hasD = pressedKeys.has("d");
  const hasW = pressedKeys.has("w");

  if (hasA && !hasD) {
    return "side_roll_left";
  }
  if (hasD && !hasA) {
    return "side_roll_right";
  }
  if (hasW && !hasA && !hasD) {
    return "forward_barrel_roll";
  }
  return null;
}
