import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyDeadState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Dead",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Dead");
      context.agent.onEnterDeadState();
    },
    update: () => {
      // Terminal state. Scene-level systems handle respawn by replacing the enemy instance.
    }
  };
}
