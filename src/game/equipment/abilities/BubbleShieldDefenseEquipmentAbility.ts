import * as THREE from "three";
import type { DefenseEquipmentComponentDefinition } from "../defense/DefenseEquipmentComponentCatalog";
import type {
  PlayerBuiltInEquipmentAbility,
  PlayerBuiltInEquipmentAbilityHudSnapshot,
  PlayerBuiltInEquipmentAbilityInput
} from "./PlayerBuiltInEquipmentAbility";

const MIN_DURATION_SECONDS = 0.1;
const MIN_RECHARGE_SECONDS = 0.001;

type BubbleShieldDefenseEquipmentAbilityParams = {
  component: DefenseEquipmentComponentDefinition;
};

export function createBubbleShieldDefenseEquipmentAbility({
  component
}: BubbleShieldDefenseEquipmentAbilityParams): PlayerBuiltInEquipmentAbility {
  const maxCharges = Math.max(1, Math.floor(component.maxCharges));
  const durationSeconds = Math.max(MIN_DURATION_SECONDS, component.durationSeconds);
  const rechargeSecondsPerCharge = Math.max(
    MIN_RECHARGE_SECONDS,
    component.rechargeSecondsPerCharge
  );
  const chargeTimersSecondsRemaining = Array.from({ length: maxCharges }, () => 0);

  let triggerHeld = false;
  let activeSecondsRemaining = 0;

  const tryActivate = (input: PlayerBuiltInEquipmentAbilityInput): void => {
    if (input.repeat || activeSecondsRemaining > 0.001) {
      return;
    }
    const availableChargeIndex = chargeTimersSecondsRemaining.findIndex((seconds) => seconds <= 0.001);
    if (availableChargeIndex < 0) {
      return;
    }
    chargeTimersSecondsRemaining[availableChargeIndex] = rechargeSecondsPerCharge;
    activeSecondsRemaining = durationSeconds;
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
      return 1 - THREE.MathUtils.clamp(secondsRemaining / rechargeSecondsPerCharge, 0, 1);
    });

    const isActive = activeSecondsRemaining > 0.001;
    const statusLabel = isActive ? "Active" : chargesAvailable > 0 ? "Ready" : "Recharging";

    return {
      label: component.name,
      statusLabel,
      chargeProgress01BySlot,
      chargesAvailable,
      chargesMax: maxCharges,
      isRecharging: chargesAvailable < maxCharges,
      nextChargeSecondsRemaining:
        nextChargeSecondsRemaining === Number.POSITIVE_INFINITY ? 0 : nextChargeSecondsRemaining
    };
  };

  return {
    id: "bubble_shield",
    update: (deltaTime: number): void => {
      const dt = Math.max(0, deltaTime);
      if (dt <= 0) {
        return;
      }
      if (activeSecondsRemaining > 0) {
        activeSecondsRemaining = Math.max(0, activeSecondsRemaining - dt);
      }
      for (let i = 0; i < chargeTimersSecondsRemaining.length; i += 1) {
        if (chargeTimersSecondsRemaining[i] <= 0) {
          continue;
        }
        chargeTimersSecondsRemaining[i] = Math.max(0, chargeTimersSecondsRemaining[i] - dt);
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
    getHudSnapshot: (): PlayerBuiltInEquipmentAbilityHudSnapshot => buildHudSnapshot(),
    isActive: (): boolean => activeSecondsRemaining > 0.001
  };
}
