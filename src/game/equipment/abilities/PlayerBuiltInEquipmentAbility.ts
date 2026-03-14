export type PlayerBuiltInEquipmentAbilityInput = {
  pressedKeys: ReadonlySet<string>;
  repeat: boolean;
};

export type PlayerBuiltInEquipmentAbilityHudSnapshot = {
  label: string;
  statusLabel?: string;
  chargeProgress01BySlot: readonly number[];
  chargesAvailable: number;
  chargesMax: number;
  isRecharging: boolean;
  nextChargeSecondsRemaining: number;
};

// Ship equipment abilities can interpret trigger/movement inputs differently per ability.
export type PlayerBuiltInEquipmentAbility = {
  id: string;
  update: (deltaTime: number) => void;
  onTriggerPressed: (input: PlayerBuiltInEquipmentAbilityInput) => void;
  onTriggerReleased: () => void;
  onMovementKeysChanged: (input: PlayerBuiltInEquipmentAbilityInput) => void;
  onInputsCleared: () => void;
  getHudSnapshot: () => PlayerBuiltInEquipmentAbilityHudSnapshot | null;
  isActive?: () => boolean;
};
