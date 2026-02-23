import type { EnemyPrimaryAttackAction } from "./EnemyPrimaryAttackTypes";

export type EnemyBurstWeaponControllerConfig = {
  id?: string;
  shotCount: number;
  telegraphSeconds: number;
  shotIntervalSeconds: number;
  burstCooldownSeconds: number;
  generalAttackCooldownSeconds?: number;
  executeShot: () => boolean;
};

export type EnemyBurstWeaponDebugSnapshot = {
  burstCooldownSecondsRemaining: number;
  burstShotCooldownSecondsRemaining: number;
  burstShotsRemaining: number;
};

export type EnemyBurstTelegraphVisualState = {
  active: boolean;
  telegraphSecondsRemaining: number;
  telegraphDurationSeconds: number;
  pulseSeconds: number;
};

export class EnemyBurstWeaponController implements EnemyPrimaryAttackAction {
  readonly id: string;
  private readonly shotCount: number;
  private readonly telegraphSeconds: number;
  private readonly shotIntervalSeconds: number;
  private readonly burstCooldownSeconds: number;
  private readonly generalAttackCooldownSeconds: number;
  private readonly executeShotCallback: () => boolean;

  private burstShotsRemaining = 0;
  private burstTelegraphSecondsRemaining = 0;
  private burstTelegraphQueued = false;
  private burstShotCooldownRemaining = 0;
  private burstCooldownRemaining = 0;
  private generalAttackCooldownRemaining = 0;
  private burstFinishedEventPending = false;
  private telegraphPulseSeconds = 0;

  constructor(config: EnemyBurstWeaponControllerConfig) {
    this.id = config.id ?? "burst";
    this.shotCount = Math.max(1, Math.floor(config.shotCount));
    this.telegraphSeconds = Math.max(0, config.telegraphSeconds);
    this.shotIntervalSeconds = Math.max(0.03, config.shotIntervalSeconds);
    this.burstCooldownSeconds = Math.max(0, config.burstCooldownSeconds);
    this.generalAttackCooldownSeconds = Math.max(0, config.generalAttackCooldownSeconds ?? 0);
    this.executeShotCallback = config.executeShot;
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }

    this.burstTelegraphSecondsRemaining = Math.max(0, this.burstTelegraphSecondsRemaining - deltaTime);
    this.burstShotCooldownRemaining = Math.max(0, this.burstShotCooldownRemaining - deltaTime);
    this.burstCooldownRemaining = Math.max(0, this.burstCooldownRemaining - deltaTime);
    this.generalAttackCooldownRemaining = Math.max(0, this.generalAttackCooldownRemaining - deltaTime);
    this.telegraphPulseSeconds += deltaTime;
  }

  canStartAttack(): boolean {
    return (
      this.generalAttackCooldownRemaining <= 0 &&
      this.burstCooldownRemaining <= 0 &&
      !this.burstTelegraphQueued &&
      this.burstShotsRemaining <= 0
    );
  }

  isAttackActionActive(): boolean {
    return this.burstTelegraphQueued || this.burstShotsRemaining > 0;
  }

  tryExecute(): void {
    if (
      this.burstShotsRemaining <= 0 &&
      !this.burstTelegraphQueued &&
      this.burstCooldownRemaining <= 0 &&
      this.generalAttackCooldownRemaining <= 0
    ) {
      this.burstTelegraphQueued = true;
      this.burstTelegraphSecondsRemaining = this.telegraphSeconds > 0 ? this.telegraphSeconds : 0;
      return;
    }

    if (this.burstTelegraphQueued) {
      if (this.burstTelegraphSecondsRemaining > 0) {
        return;
      }
      this.burstTelegraphQueued = false;
      this.burstShotsRemaining = this.shotCount;
      this.burstShotCooldownRemaining = 0;
    }

    if (this.burstShotsRemaining <= 0 || this.burstShotCooldownRemaining > 0) {
      return;
    }

    if (!this.executeShotCallback()) {
      return;
    }

    this.burstShotsRemaining -= 1;
    if (this.burstShotsRemaining > 0) {
      this.burstShotCooldownRemaining = this.shotIntervalSeconds;
      return;
    }

    this.burstCooldownRemaining = this.burstCooldownSeconds;
    this.generalAttackCooldownRemaining = this.generalAttackCooldownSeconds;
    this.burstShotCooldownRemaining = 0;
    this.burstFinishedEventPending = true;
  }

  consumeBurstFinishedEvent(): boolean {
    if (!this.burstFinishedEventPending) {
      return false;
    }
    this.burstFinishedEventPending = false;
    return true;
  }

  cancelActiveAttack(): void {
    this.burstShotsRemaining = 0;
    this.burstTelegraphSecondsRemaining = 0;
    this.burstTelegraphQueued = false;
    this.burstShotCooldownRemaining = 0;
    this.burstFinishedEventPending = false;
  }

  resetAll(): void {
    this.cancelActiveAttack();
    this.burstCooldownRemaining = 0;
    this.generalAttackCooldownRemaining = 0;
  }

  getDebugSnapshot(): EnemyBurstWeaponDebugSnapshot {
    return {
      burstCooldownSecondsRemaining: this.burstCooldownRemaining,
      burstShotCooldownSecondsRemaining: this.burstShotCooldownRemaining,
      burstShotsRemaining: this.burstShotsRemaining
    };
  }

  getTelegraphVisualState(): EnemyBurstTelegraphVisualState {
    return {
      active: this.burstTelegraphQueued && this.burstTelegraphSecondsRemaining > 0,
      telegraphSecondsRemaining: this.burstTelegraphSecondsRemaining,
      telegraphDurationSeconds: this.telegraphSeconds,
      pulseSeconds: this.telegraphPulseSeconds
    };
  }

  canStart(): boolean {
    return this.canStartAttack();
  }

  isActive(): boolean {
    return this.isAttackActionActive();
  }

  consumeFinishedEvent(): boolean {
    return this.consumeBurstFinishedEvent();
  }

  cancelActive(): void {
    this.cancelActiveAttack();
  }
}
