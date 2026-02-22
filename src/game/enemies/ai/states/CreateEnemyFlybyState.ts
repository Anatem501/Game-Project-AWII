import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyFlybyState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Flyby",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Flyby");
      context.agent.beginFlybyManeuver();
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      if (
        context.agent.tryTriggerEvadeFromIncomingFire(
          0.6,
          0.2,
          context.config.evadeRearThreatRange,
          context.config.evadeCooldownSeconds ?? 6
        )
      ) {
        context.runtime.returnStateAfterEvade = "Flyby";
        return "Evade";
      }

      context.agent.faceTarget(deltaTime);
      context.agent.updateFlybyMovement(deltaTime);

      if (context.agent.isFlybyManeuverComplete()) {
        return context.agent.hasPassiveSensorContact(context.config.passiveSensorLoseRange)
          ? "Engage"
          : "Search";
      }
    }
  };
}
