import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyEvadeState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Evade",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Evade");
      context.agent.beginEvadeManeuver();
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      context.agent.updateEvadeMovement(deltaTime);

      if (context.agent.isEvadeManeuverComplete()) {
        return context.runtime.returnStateAfterEvade;
      }
    }
  };
}
