import type {
  EnemyPrimaryAttackAction,
  EnemyPrimaryAttackSelectionPolicy
} from "./EnemyPrimaryAttackTypes";
import type { EnemyBurstTelegraphVisualState } from "./EnemyBurstWeaponController";

const INACTIVE_TELEGRAPH: EnemyBurstTelegraphVisualState = {
  active: false,
  telegraphSecondsRemaining: 0,
  telegraphDurationSeconds: 0,
  pulseSeconds: 0
};

export type EnemyPrimaryAttackLoadoutConfig = {
  actions: readonly EnemyPrimaryAttackAction[];
  selectionPolicy?: EnemyPrimaryAttackSelectionPolicy;
};

export class EnemyPrimaryAttackLoadout {
  private readonly actions: readonly EnemyPrimaryAttackAction[];
  private readonly selectionPolicy: EnemyPrimaryAttackSelectionPolicy;
  private activeActionIndex: number | null = null;
  private readyActionIndexCache: number | null = null;
  private readyActionCacheValid = false;

  constructor(config: EnemyPrimaryAttackLoadoutConfig) {
    this.actions = config.actions;
    this.selectionPolicy = config.selectionPolicy ?? "first_ready";
  }

  update(deltaTime: number): void {
    for (const action of this.actions) {
      action.update(deltaTime);
    }
    this.readyActionCacheValid = false;

    if (this.activeActionIndex !== null && !this.actions[this.activeActionIndex]?.isActive()) {
      this.activeActionIndex = null;
    }
  }

  canStartPrimaryAttack(): boolean {
    return this.getReadyActionIndex() !== null;
  }

  isAttackActionActive(): boolean {
    if (this.activeActionIndex !== null) {
      return this.actions[this.activeActionIndex]?.isActive() ?? false;
    }
    return this.actions.some((action) => action.isActive());
  }

  tryExecutePrimaryAttack(): void {
    const activeAction = this.getActiveAction();
    if (activeAction) {
      activeAction.tryExecute();
      this.readyActionCacheValid = false;
      return;
    }

    const selected = this.selectReadyAction();
    if (!selected) {
      return;
    }
    this.activeActionIndex = selected.index;
    selected.action.tryExecute();
    this.readyActionCacheValid = false;
  }

  consumePrimaryAttackFinishedEvent(): boolean {
    const activeAction = this.getActiveAction();
    if (activeAction && activeAction.consumeFinishedEvent()) {
      this.activeActionIndex = null;
      this.readyActionCacheValid = false;
      return true;
    }

    for (let i = 0; i < this.actions.length; i += 1) {
      if (this.actions[i].consumeFinishedEvent()) {
        if (this.activeActionIndex === i) {
          this.activeActionIndex = null;
        }
        this.readyActionCacheValid = false;
        return true;
      }
    }
    return false;
  }

  cancelActivePrimaryAttack(): void {
    const activeAction = this.getActiveAction();
    if (activeAction) {
      activeAction.cancelActive();
      this.activeActionIndex = null;
      this.readyActionCacheValid = false;
      return;
    }
    for (const action of this.actions) {
      action.cancelActive();
    }
    this.readyActionCacheValid = false;
  }

  resetAll(): void {
    for (const action of this.actions) {
      action.resetAll();
    }
    this.activeActionIndex = null;
    this.readyActionCacheValid = false;
  }

  getTelegraphVisualState(): EnemyBurstTelegraphVisualState {
    const activeAction = this.getActiveAction();
    if (activeAction) {
      return activeAction.getTelegraphVisualState();
    }

    for (const action of this.actions) {
      const visual = action.getTelegraphVisualState();
      if (visual.active) {
        return visual;
      }
    }
    return INACTIVE_TELEGRAPH;
  }

  private getActiveAction(): EnemyPrimaryAttackAction | null {
    if (this.activeActionIndex === null) {
      return null;
    }
    return this.actions[this.activeActionIndex] ?? null;
  }

  private selectReadyAction(): { action: EnemyPrimaryAttackAction; index: number } | null {
    const readyIndex = this.getReadyActionIndex();
    if (readyIndex !== null) {
      const action = this.actions[readyIndex];
      if (action) {
        return { action, index: readyIndex };
      }
    }

    return null;
  }

  private getReadyActionIndex(): number | null {
    if (this.readyActionCacheValid) {
      return this.readyActionIndexCache;
    }

    this.readyActionCacheValid = true;
    this.readyActionIndexCache = null;
    switch (this.selectionPolicy) {
      case "first_ready":
      default: {
        for (let i = 0; i < this.actions.length; i += 1) {
          const action = this.actions[i];
          if (!action.canStart()) {
            continue;
          }
          this.readyActionIndexCache = i;
          return i;
        }
        return this.readyActionIndexCache;
      }
    }
  }
}
