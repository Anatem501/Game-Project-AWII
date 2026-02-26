import type { StateDefinition } from "../../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../../EnemyShipAiTypes";

export function createEnemyMissileRegroupState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  let regroupTimeRemaining = 0;
  let breakawayTimeRemaining = 0;
  let returningToAttackRange = false;

  return {
    id: "Regroup",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Regroup");
      context.agent.resetAttackBurst();
      regroupTimeRemaining = Math.max(
        0.8,
        context.config.regroupDurationSeconds ?? context.config.fleeDurationSeconds ?? 1.6
      );
      breakawayTimeRemaining = Math.min(0.75, Math.max(0.35, regroupTimeRemaining * 0.45));
      returningToAttackRange = false;
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      if (!context.agent.hasPassiveSensorContact(context.config.passiveSensorLoseRange)) {
        return "Search";
      }

      const dt = Math.max(0, deltaTime);
      regroupTimeRemaining = Math.max(0, regroupTimeRemaining - dt);
      if (!returningToAttackRange) {
        breakawayTimeRemaining = Math.max(0, breakawayTimeRemaining - dt);
        context.agent.updateFleeMovement(deltaTime);
        const distance = context.agent.getTargetDistance();
        const reachedBreakDistance =
          distance !== null && distance >= context.config.preferredAttackDistance + 10;
        if (breakawayTimeRemaining <= 0 || reachedBreakDistance) {
          returningToAttackRange = true;
        }
        return;
      }

      const distance = context.agent.getTargetDistance();
      if (distance === null) {
        return "Search";
      }
      context.agent.faceTarget(deltaTime);
      context.agent.updateAttackMovement(deltaTime, distance);

      if (distance <= context.config.preferredAttackDistance + 5 || regroupTimeRemaining <= 0) {
        return "Attack";
      }
    }
  };
}

export const createEnemyMissileFleeState = createEnemyMissileRegroupState;
