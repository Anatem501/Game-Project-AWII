import type { EnemyBurstTelegraphVisualState } from "./EnemyBurstWeaponController";
import type { EnemyPrimaryAttackAction } from "./EnemyPrimaryAttackTypes";

const INACTIVE_TELEGRAPH: EnemyBurstTelegraphVisualState = {
  active: false,
  telegraphSecondsRemaining: 0,
  telegraphDurationSeconds: 0,
  pulseSeconds: 0
};

export class EnemyCooldownCallbackAttackAction implements EnemyPrimaryAttackAction {
  readonly id: string;

  private readonly cooldownSeconds: number;
  private readonly executeCallback: () => boolean;
  private readonly canStartCallback?: () => boolean;
  private cooldownRemaining = 0;
  private finishedEventPending = false;

  constructor(config: {
    id: string;
    cooldownSeconds: number;
    execute: () => boolean;
    canStart?: () => boolean;
  }) {
    this.id = config.id;
    this.cooldownSeconds = Math.max(0, config.cooldownSeconds);
    this.executeCallback = config.execute;
    this.canStartCallback = config.canStart;
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaTime);
  }

  canStart(): boolean {
    return this.cooldownRemaining <= 0 && (this.canStartCallback?.() ?? true);
  }

  isActive(): boolean {
    return false;
  }

  tryExecute(): void {
    if (!this.canStart()) {
      return;
    }
    if (!this.executeCallback()) {
      return;
    }
    this.cooldownRemaining = this.cooldownSeconds;
    this.finishedEventPending = true;
  }

  consumeFinishedEvent(): boolean {
    if (!this.finishedEventPending) {
      return false;
    }
    this.finishedEventPending = false;
    return true;
  }

  cancelActive(): void {
    this.finishedEventPending = false;
  }

  resetAll(): void {
    this.cooldownRemaining = 0;
    this.finishedEventPending = false;
  }

  getTelegraphVisualState(): EnemyBurstTelegraphVisualState {
    return INACTIVE_TELEGRAPH;
  }
}

export class EnemyLockOnCallbackAttackAction implements EnemyPrimaryAttackAction {
  readonly id: string;

  private readonly lockSeconds: number;
  private readonly cooldownSeconds: number;
  private readonly executeCallback: () => boolean;
  private readonly canStartCallback?: () => boolean;
  private readonly canMaintainLockCallback?: () => boolean;
  private readonly progressDecaySeconds: number;
  private readonly progressDecayDelaySeconds: number;

  private lockQueued = false;
  private lockProgressSeconds = 0;
  private cooldownRemaining = 0;
  private telegraphPulseSeconds = 0;
  private finishedEventPending = false;
  private progressDecayDelayRemaining = 0;

  constructor(config: {
    id: string;
    lockSeconds: number;
    cooldownSeconds: number;
    execute: () => boolean;
    canStart?: () => boolean;
    canMaintainLock?: () => boolean;
    progressDecaySeconds?: number;
    progressDecayDelaySeconds?: number;
  }) {
    this.id = config.id;
    this.lockSeconds = Math.max(0, config.lockSeconds);
    this.cooldownSeconds = Math.max(0, config.cooldownSeconds);
    this.executeCallback = config.execute;
    this.canStartCallback = config.canStart;
    this.canMaintainLockCallback = config.canMaintainLock;
    this.progressDecaySeconds = Math.max(0.05, config.progressDecaySeconds ?? this.lockSeconds * 0.9);
    this.progressDecayDelaySeconds = Math.max(0, config.progressDecayDelaySeconds ?? 0);
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaTime);
    this.telegraphPulseSeconds += deltaTime;

    if (!this.lockQueued) {
      return;
    }

    const hasLockContact = this.canMaintainLockCallback?.() ?? true;
    if (hasLockContact) {
      this.progressDecayDelayRemaining = this.progressDecayDelaySeconds;
      this.lockProgressSeconds = Math.min(this.lockSeconds, this.lockProgressSeconds + deltaTime);
      return;
    }

    if (this.progressDecayDelayRemaining > 0) {
      this.progressDecayDelayRemaining = Math.max(0, this.progressDecayDelayRemaining - deltaTime);
      return;
    }

    const decayRate = this.lockSeconds / Math.max(0.05, this.progressDecaySeconds);
    this.lockProgressSeconds = Math.max(0, this.lockProgressSeconds - deltaTime * decayRate);
  }

  canStart(): boolean {
    return this.cooldownRemaining <= 0 && (this.canStartCallback?.() ?? true) && !this.lockQueued;
  }

  isActive(): boolean {
    return this.lockQueued;
  }

  tryExecute(): void {
    if (!this.lockQueued) {
      if (!this.canStart()) {
        return;
      }
      this.lockQueued = true;
      this.progressDecayDelayRemaining = this.progressDecayDelaySeconds;
      return;
    }

    const hasLockContact = this.canMaintainLockCallback?.() ?? true;
    if (!hasLockContact || this.lockProgressSeconds < this.lockSeconds) {
      return;
    }

    if (!this.executeCallback()) {
      this.lockQueued = false;
      this.progressDecayDelayRemaining = 0;
      return;
    }

    this.lockQueued = false;
    this.progressDecayDelayRemaining = 0;
    this.cooldownRemaining = this.cooldownSeconds;
    this.finishedEventPending = true;
  }

  consumeFinishedEvent(): boolean {
    if (!this.finishedEventPending) {
      return false;
    }
    this.finishedEventPending = false;
    return true;
  }

  cancelActive(): void {
    this.lockQueued = false;
    this.lockProgressSeconds = 0;
    this.progressDecayDelayRemaining = 0;
    this.finishedEventPending = false;
  }

  resetAll(): void {
    this.cancelActive();
    this.cooldownRemaining = 0;
  }

  getTelegraphVisualState(): EnemyBurstTelegraphVisualState {
    const remaining = Math.max(0, this.lockSeconds - this.lockProgressSeconds);
    return {
      active: this.lockQueued,
      telegraphSecondsRemaining: remaining,
      telegraphDurationSeconds: this.lockSeconds,
      pulseSeconds: this.telegraphPulseSeconds
    };
  }
}
