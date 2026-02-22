import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyChaseState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Chase",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Chase");
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      const distanceToTarget = context.agent.getTargetDistance();
      if (distanceToTarget === null || distanceToTarget > context.config.loseTargetRange) {
        return "Patrol";
      }
      if (distanceToTarget <= context.config.attackRange) {
        return "Attack";
      }

      context.agent.updateChaseMovement(deltaTime);
      context.agent.faceTarget(deltaTime);
    }
  };
}
