export type PlayerBuiltInEquipmentAbilityInput = {
  pressedKeys: ReadonlySet<string>;
  repeat: boolean;
};

export type PlayerBuiltInEquipmentAbilityHudSnapshot = {
  label: string;
  chargeProgress01BySlot: readonly number[];
  chargesAvailable: number;
  chargesMax: number;
  isRecharging: boolean;
  nextChargeSecondsRemaining: number;
};

// Built-in ship equipment abilities are triggered by the shared "Space" input and
// can interpret movement keys differently per ship/ability.
export type PlayerBuiltInEquipmentAbility = {
  id: string;
  update: (deltaTime: number) => void;
  onTriggerPressed: (input: PlayerBuiltInEquipmentAbilityInput) => void;
  onTriggerReleased: () => void;
  onMovementKeysChanged: (input: PlayerBuiltInEquipmentAbilityInput) => void;
  onInputsCleared: () => void;
  getHudSnapshot: () => PlayerBuiltInEquipmentAbilityHudSnapshot | null;
};
