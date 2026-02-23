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

      if (
        context.agent.tryTriggerEvadeFromIncomingFire(
          context.config.patrolEvadeChance01 ?? 0.2,
          context.config.patrolEvadeRearBonusChance01 ?? 0.2,
          context.config.evadeRearThreatRange,
          context.config.evadeCooldownSeconds ?? 6
        )
      ) {
        context.runtime.returnStateAfterEvade = "Patrol";
        return "Evade";
      }

      if (context.agent.hasPassiveSensorContact(context.config.passiveSensorRange)) {
        return "Engage";
      }

      context.agent.updatePatrolMovement(deltaTime);
      context.agent.faceTarget(deltaTime);
    }
  };
}
