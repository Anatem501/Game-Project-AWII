import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyAttackState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Attack",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Attack");
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      const distanceToTarget = context.agent.getTargetDistance();
      if (distanceToTarget === null || distanceToTarget > context.config.loseTargetRange) {
        return "Patrol";
      }
      if (
        distanceToTarget >
        context.config.attackRange * context.config.attackDisengageRangeMultiplier
      ) {
        return "Chase";
      }

      context.agent.updateAttackMovement(deltaTime, distanceToTarget);
      const alignedToTarget = context.agent.faceTarget(deltaTime);
      if (alignedToTarget) {
        context.agent.tryFireBurstAttack();
      }
    }
  };
}
