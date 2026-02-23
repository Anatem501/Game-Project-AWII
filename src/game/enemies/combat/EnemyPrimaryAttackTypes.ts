import type { EnemyBurstTelegraphVisualState } from "./EnemyBurstWeaponController";

export type EnemyPrimaryAttackSelectionPolicy = "first_ready";

export type EnemyPrimaryAttackAction = {
  readonly id: string;
  update: (deltaTime: number) => void;
  canStart: () => boolean;
  isActive: () => boolean;
  tryExecute: () => void;
  consumeFinishedEvent: () => boolean;
  cancelActive: () => void;
  resetAll: () => void;
  getTelegraphVisualState: () => EnemyBurstTelegraphVisualState;
};
