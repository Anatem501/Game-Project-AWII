import type * as THREE from "three";
import type { HurtboxComponent } from "../components/combat/HurtboxComponent";
import { StateMachine } from "../ai/StateMachine";
import { EnemyMissileShip, type EnemyMissileShipDebugSnapshot } from "../entities/EnemyMissileShip";
import type {
  EnemyShipAiConfig,
  EnemyShipAiContext,
  EnemyShipAiStateId
} from "./ai/EnemyShipAiTypes";
import { createEnemyDeadState } from "./ai/states/CreateEnemyDeadState";
import { createEnemyEvadeState } from "./ai/states/CreateEnemyEvadeState";
import { createEnemySpawnState } from "./ai/states/CreateEnemySpawnState";
import { createEnemyMissileAttackState } from "./ai/states/missile/CreateEnemyMissileAttackState";
import { createEnemyMissileCircleState } from "./ai/states/missile/CreateEnemyMissileCoastState";
import { createEnemyMissilePatrolState } from "./ai/states/missile/CreateEnemyMissilePatrolState";
import { createEnemyMissileSearchState } from "./ai/states/missile/CreateEnemyMissileSearchState";

export type EnemyMissileShipControllerConfig = {
  ship: EnemyMissileShip;
  ai: EnemyShipAiConfig;
};

export type EnemyMissileShipControllerDebugSnapshot = EnemyMissileShipDebugSnapshot & {
  state: EnemyShipAiStateId;
};

export class EnemyMissileShipController {
  readonly root: THREE.Group;
  readonly hurtbox: HurtboxComponent;

  private readonly ship: EnemyMissileShip;
  private readonly stateMachine: StateMachine<EnemyShipAiContext, EnemyShipAiStateId>;
  private disposed = false;

  constructor(config: EnemyMissileShipControllerConfig) {
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

    this.stateMachine = new StateMachine(
      context,
      [
        createEnemySpawnState(),
        createEnemyMissilePatrolState(),
        createEnemyMissileCircleState(),
        createEnemyMissileAttackState(),
        createEnemyEvadeState(),
        createEnemyMissileSearchState(),
        createEnemyDeadState()
      ],
      "Spawn"
    );
  }

  update(deltaTime: number): void {
    if (this.disposed || deltaTime <= 0) {
      return;
    }
    this.ship.update(deltaTime);
    this.stateMachine.update(deltaTime);
  }

  isDestroyed(): boolean {
    return this.ship.isDestroyed();
  }

  setPlayerTarget(target: THREE.Object3D | null): void {
    this.ship.setPlayerTarget(target);
  }

  setPlayerPrimaryFireActive(isActive: boolean): void {
    this.ship.setPlayerPrimaryFireActive(isActive);
  }

  isLockingPlayer(): boolean {
    return this.ship.isLockingPlayer();
  }

  getLockProgress01(): number {
    return this.ship.getLockProgress01();
  }

  hasIncomingHomingMissileThreat(): boolean {
    return this.ship.hasIncomingHomingMissileThreat();
  }

  getDebugSnapshot(): EnemyMissileShipControllerDebugSnapshot {
    const shipSnapshot = this.ship.getDebugSnapshot();
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
    this.ship.dispose();
  }
}
