import * as THREE from "three";
import type { ShipController } from "../../controllers/ShipController";
import type { MobilityEquipmentComponentDefinition } from "../mobility/MobilityEquipmentComponentCatalog";
import type {
  PlayerBuiltInEquipmentAbility,
  PlayerBuiltInEquipmentAbilityHudSnapshot,
  PlayerBuiltInEquipmentAbilityInput
} from "./PlayerBuiltInEquipmentAbility";

type BoostThrustersBuiltInAbilityParams = {
  shipController: Pick<ShipController, "setForwardBoostRatio">;
  component: MobilityEquipmentComponentDefinition;
};

const EMPTY_FUEL_RECHARGE_DELAY_SECONDS = 2;

export function createBoostThrustersBuiltInAbility({
  shipController,
  component
}: BoostThrustersBuiltInAbilityParams): PlayerBuiltInEquipmentAbility {
  const maxFuelPoints = Math.max(1, Math.round(component.fuelPoints));
  const boostPointsPerSecond = 1000 / Math.max(1, component.boostMillisecondsPerPoint);
  const rechargePointsPerSecond = 1000 / Math.max(1, component.rechargeMillisecondsPerPoint);
  const rechargeDelaySeconds = Math.max(0, component.rechargeDelaySeconds);
  const forwardBoostRatio = THREE.MathUtils.clamp(component.forwardThrustSpeedRatio, 0, 2);

  let triggerHeld = false;
  let fuelPoints = maxFuelPoints;
  let rechargeDelaySecondsRemaining = 0;
  let boostActive = false;

  const setBoostRatio = (ratio: number): void => {
    shipController.setForwardBoostRatio(ratio);
  };

  const stopBoost = (): void => {
    boostActive = false;
    setBoostRatio(0);
  };

  const buildHudSnapshot = (): PlayerBuiltInEquipmentAbilityHudSnapshot => {
    const chargeProgress01BySlot: number[] = [];
    for (let slotIndex = 0; slotIndex < maxFuelPoints; slotIndex += 1) {
      const slotFuel = THREE.MathUtils.clamp(fuelPoints - slotIndex, 0, 1);
      chargeProgress01BySlot.push(slotFuel);
    }

    const fractionalFuelPoints = fuelPoints - Math.floor(fuelPoints);
    const pointsToNextWhole = fractionalFuelPoints <= 0.0001 ? 1 : 1 - fractionalFuelPoints;
    const rechargeSecondsToNextPoint = pointsToNextWhole / Math.max(0.001, rechargePointsPerSecond);
    const nextChargeSecondsRemaining =
      fuelPoints >= maxFuelPoints - 0.0001 || boostActive
        ? 0
        : rechargeDelaySecondsRemaining + rechargeSecondsToNextPoint;
    const statusLabel = boostActive
      ? "Boosting"
      : fuelPoints >= maxFuelPoints - 0.0001
        ? "Ready"
        : rechargeDelaySecondsRemaining > 0.0001
          ? "Recharge Delay"
          : "Recharging";

    return {
      label: "Boost Thrusters",
      statusLabel,
      chargeProgress01BySlot,
      chargesAvailable: Math.round(fuelPoints * 10) / 10,
      chargesMax: maxFuelPoints,
      isRecharging: !boostActive && fuelPoints < maxFuelPoints - 0.0001,
      nextChargeSecondsRemaining
    };
  };

  return {
    id: "boost_thrusters",
    update: (deltaTime: number): void => {
      const dt = Math.max(0, deltaTime);
      if (dt <= 0) {
        return;
      }

      const canBoost = triggerHeld && fuelPoints > 0.0001;
      if (canBoost) {
        boostActive = true;
        setBoostRatio(forwardBoostRatio);
        fuelPoints = Math.max(0, fuelPoints - boostPointsPerSecond * dt);
        rechargeDelaySecondsRemaining = rechargeDelaySeconds;
        if (fuelPoints <= 0.0001) {
          fuelPoints = 0;
          rechargeDelaySecondsRemaining = Math.max(
            rechargeDelaySeconds,
            EMPTY_FUEL_RECHARGE_DELAY_SECONDS
          );
          stopBoost();
        }
        return;
      }

      stopBoost();
      if (fuelPoints >= maxFuelPoints - 0.0001) {
        fuelPoints = maxFuelPoints;
        rechargeDelaySecondsRemaining = 0;
        return;
      }

      let rechargeStepSeconds = dt;
      if (rechargeDelaySecondsRemaining > 0) {
        const delayStep = Math.min(rechargeStepSeconds, rechargeDelaySecondsRemaining);
        rechargeDelaySecondsRemaining -= delayStep;
        rechargeStepSeconds -= delayStep;
      }
      if (rechargeStepSeconds <= 0) {
        return;
      }

      fuelPoints = Math.min(maxFuelPoints, fuelPoints + rechargePointsPerSecond * rechargeStepSeconds);
    },
    onTriggerPressed: (_input: PlayerBuiltInEquipmentAbilityInput): void => {
      triggerHeld = true;
    },
    onTriggerReleased: (): void => {
      triggerHeld = false;
      stopBoost();
    },
    onMovementKeysChanged: (_input: PlayerBuiltInEquipmentAbilityInput): void => {
      // Boost does not require movement key direction selection.
    },
    onInputsCleared: (): void => {
      triggerHeld = false;
      stopBoost();
    },
    getHudSnapshot: (): PlayerBuiltInEquipmentAbilityHudSnapshot => buildHudSnapshot()
  };
}
