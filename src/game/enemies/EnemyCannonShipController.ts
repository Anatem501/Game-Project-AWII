import type * as THREE from "three";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { StateMachine } from "../ai/StateMachine";
import { EnemyCannonShip, type EnemyCannonShipDebugSnapshot } from "../entities/EnemyCannonShip";
import type {
  EnemyShipAiConfig,
  EnemyShipAiContext,
  EnemyShipAiStateId
} from "./ai/EnemyShipAiTypes";
import { createEnemyDeadState } from "./ai/states/CreateEnemyDeadState";
import { createEnemyEngageState } from "./ai/states/CreateEnemyEngageState";
import { createEnemyFlybyState } from "./ai/states/CreateEnemyFlybyState";
import { createEnemyPatrolState } from "./ai/states/CreateEnemyPatrolState";
import { createEnemySearchState } from "./ai/states/CreateEnemySearchState";
import { createEnemyAttackState } from "./ai/states/CreateEnemyAttackState";
import { createEnemyEvadeState } from "./ai/states/CreateEnemyEvadeState";
import { createEnemySpawnState } from "./ai/states/CreateEnemySpawnState";

export type EnemyCannonShipControllerConfig = {
  ship: EnemyCannonShip;
  ai: EnemyShipAiConfig;
};

export type EnemyCannonShipControllerDebugSnapshot = EnemyCannonShipDebugSnapshot & {
  state: EnemyShipAiStateId;
};

export class EnemyCannonShipController {
  readonly root: THREE.Group;
  readonly hurtbox: HurtboxComponent;

  private readonly ship: EnemyCannonShip;
  private readonly stateMachine: StateMachine<EnemyShipAiContext, EnemyShipAiStateId>;
  private disposed = false;

  constructor(config: EnemyCannonShipControllerConfig) {
    const { ship, ai } = config;
    this.ship = ship;
    this.root = ship.root;
    this.hurtbox = ship.hurtbox;

    const context: EnemyShipAiContext = {
      agent: ship,
      config: ai,
      runtime: {
        spawnTimeRemaining: ai.spawnDurationSeconds,
        returnStateAfterEvade: "Patrol",
        searchReachedLastKnownPosition: false,
        searchHoldSecondsRemaining: 0
      }
    };

    this.stateMachine = new StateMachine(context, [
      createEnemySpawnState(),
      createEnemyPatrolState(),
      createEnemyEngageState(),
      createEnemyAttackState(),
      createEnemyFlybyState(),
      createEnemyEvadeState(),
      createEnemySearchState(),
      createEnemyDeadState()
    ], "Spawn");
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }

    const ship = this.getShip();
    ship.update(deltaTime);
    this.stateMachine.update(deltaTime);
  }

  isDestroyed(): boolean {
    return this.getShip().isDestroyed();
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.getShip().setPlayerTarget(target);
  }

  setPlayerPrimaryFireActive(isActive: boolean): void {
    this.getShip().setPlayerPrimaryFireActive(isActive);
  }

  getDebugSnapshot(): EnemyCannonShipControllerDebugSnapshot {
    const shipSnapshot = this.getShip().getDebugSnapshot();
    return {
      ...shipSnapshot,
      state: (this.stateMachine.getCurrentStateId() ?? shipSnapshot.state) as EnemyShipAiStateId
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.getShip().dispose();
  }

  private getShip(): EnemyCannonShip {
    return this.ship;
  }
}
