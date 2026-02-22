import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyRepositionState(): StateDefinition<
  EnemyShipAiContext,
  EnemyShipAiStateId
> {
  return {
    id: "Reposition",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Reposition");
      context.agent.beginRepositionManeuver();
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      const distanceToTarget = context.agent.getTargetDistance();
      if (distanceToTarget === null || distanceToTarget > context.config.passiveSensorLoseRange) {
        return "Patrol";
      }
      if (context.agent.shouldEvadeRearThreat(context.config.evadeRearThreatRange)) {
        return "Evade";
      }

      context.agent.faceTarget(deltaTime);
      context.agent.updateRepositionMovement(deltaTime, distanceToTarget);

      if (context.agent.isRepositionManeuverComplete()) {
        return "Chase";
      }
    }
  };
}
