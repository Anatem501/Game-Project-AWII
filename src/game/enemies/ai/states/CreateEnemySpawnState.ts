import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemySpawnState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Spawn",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Spawn");
      context.runtime.spawnTimeRemaining = context.config.spawnDurationSeconds;
      context.agent.resetAttackBurst();
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      context.runtime.spawnTimeRemaining = Math.max(
        0,
        context.runtime.spawnTimeRemaining - deltaTime
      );
      context.agent.faceTarget(deltaTime);

      if (context.runtime.spawnTimeRemaining <= 0) {
        return "Patrol";
      }
    }
  };
}
