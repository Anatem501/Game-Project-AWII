import type { StateDefinition } from "../../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../../EnemyShipAiTypes";

export function createEnemyMissileCoastState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  let circleTimeRemaining = 0;

  return {
    id: "Circle",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Circle");
      circleTimeRemaining = Math.max(
        0.5,
        context.config.circleDurationSeconds ?? context.config.coastDurationSeconds ?? 1.6
      );
      context.agent.resetAttackBurst();
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      if (
        context.agent.tryTriggerEvadeFromIncomingFire(
          context.config.engageEvadeChance01 ?? 0.6,
          context.config.engageEvadeRearBonusChance01 ?? 0.2,
          context.config.evadeRearThreatRange,
          context.config.evadeCooldownSeconds ?? 6
        )
      ) {
        context.runtime.returnStateAfterEvade = "Circle";
        return "Evade";
      }

      if (!context.agent.hasPassiveSensorContact(context.config.passiveSensorLoseRange)) {
        return "Search";
      }

      circleTimeRemaining = Math.max(0, circleTimeRemaining - Math.max(0, deltaTime));
      context.agent.faceTarget(deltaTime);
      context.agent.updateCoastMovement(deltaTime);

      if (circleTimeRemaining <= 0) {
        return "Attack";
      }
    }
  };
}

export const createEnemyMissileCircleState = createEnemyMissileCoastState;
