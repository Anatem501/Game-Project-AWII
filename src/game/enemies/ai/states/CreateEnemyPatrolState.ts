import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyPatrolState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Patrol",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Patrol");
      context.agent.resetAttackBurst();
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      const distanceToTarget = context.agent.getTargetDistance();
      if (distanceToTarget !== null && distanceToTarget <= context.config.detectionRange) {
        return "Chase";
      }

      context.agent.updatePatrolMovement(deltaTime);
      context.agent.faceTarget(deltaTime);
    }
  };
}
