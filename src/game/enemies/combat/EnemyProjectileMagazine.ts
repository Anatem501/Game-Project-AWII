export type EnemyProjectileMagazineConfig = {
  capacity: number;
  reloadSeconds: number;
};

export class EnemyProjectileMagazine {
  private readonly capacity: number;
  private readonly reloadSeconds: number;

  private shotsRemaining: number;
  private reloadSecondsRemaining = 0;

  constructor(config: EnemyProjectileMagazineConfig) {
    this.capacity = Math.max(1, Math.floor(config.capacity));
    this.reloadSeconds = Math.max(0, config.reloadSeconds);
    this.shotsRemaining = this.capacity;
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0 || this.reloadSecondsRemaining <= 0) {
      return;
    }

    this.reloadSecondsRemaining = Math.max(0, this.reloadSecondsRemaining - deltaTime);
    if (this.reloadSecondsRemaining <= 0) {
      this.shotsRemaining = this.capacity;
    }
  }

  canConsume(count: number): boolean {
    const roundedCount = Math.max(1, Math.floor(count));
    return !this.isReloading() && this.shotsRemaining >= roundedCount;
  }

  tryConsume(count: number): boolean {
    const roundedCount = Math.max(1, Math.floor(count));
    if (!this.canConsume(roundedCount)) {
      return false;
    }

    this.shotsRemaining = Math.max(0, this.shotsRemaining - roundedCount);
    if (this.shotsRemaining <= 0) {
      this.reloadSecondsRemaining = this.reloadSeconds;
    }
    return true;
  }

  isReloading(): boolean {
    return this.reloadSecondsRemaining > 0;
  }

  getShotsRemaining(): number {
    return this.shotsRemaining;
  }

  getCapacity(): number {
    return this.capacity;
  }

  getReloadSecondsRemaining(): number {
    return this.reloadSecondsRemaining;
  }

  reset(): void {
    this.shotsRemaining = this.capacity;
    this.reloadSecondsRemaining = 0;
  }
}
