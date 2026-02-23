import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyEngageState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  return {
    id: "Engage",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Engage");
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
        context.runtime.returnStateAfterEvade = "Engage";
        return "Evade";
      }

      const hasSensorContact = context.agent.hasPassiveSensorContact(context.config.passiveSensorLoseRange);
      if (!hasSensorContact) {
        return "Search";
      }

      context.agent.faceTarget(deltaTime);
      context.agent.updateEngageMovement(deltaTime);

      if (context.agent.canStartPrimaryAttack()) {
        return "Attack";
      }
      return "Flyby";
    }
  };
}
