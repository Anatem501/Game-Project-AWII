import type { StateDefinition } from "../../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../../EnemyShipAiTypes";

export function createEnemyMissileAttackState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  const choosePostAttackState = (_context: EnemyShipAiContext): EnemyShipAiStateId => "Circle";

  return {
    id: "Attack",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Attack");
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      const hasSensorContact = context.agent.hasPassiveSensorContact(context.config.passiveSensorLoseRange);
      const distanceToTarget = context.agent.getTargetDistance();
      if (distanceToTarget === null || !hasSensorContact) {
        context.agent.resetAttackBurst();
        return "Search";
      }

      const alignedToTarget = context.agent.faceTarget(deltaTime);
      context.agent.updateAttackMovement(deltaTime, distanceToTarget);
      const hasAimVision = context.agent.hasAimVisionContact(
        context.config.aimVisionRange,
        context.config.aimVisionFovRadians
      );
      if (alignedToTarget && hasAimVision) {
        context.agent.tryExecutePrimaryAttack();
      }

      if (context.agent.consumePrimaryAttackFinishedEvent()) {
        return choosePostAttackState(context);
      }

      if (!context.agent.canStartPrimaryAttack() && !context.agent.isAttackActionActive()) {
        return choosePostAttackState(context);
      }
    }
  };
}
