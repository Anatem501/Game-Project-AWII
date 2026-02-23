import * as THREE from "three";
import type { StateDefinition } from "../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyFlybyState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  const flybyTargetPoint = new THREE.Vector3();
  let flybyTimeRemaining = 0;
  let flybyPhase: "approach" | "turnback" = "approach";

  return {
    id: "Flyby",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Flyby");
      flybyPhase = "approach";
      flybyTimeRemaining = context.agent.buildFlybyTargetPoint(flybyTargetPoint)
        ? Math.max(0, context.config.flybyDurationSeconds ?? 2.8)
        : 0;
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      flybyTimeRemaining = Math.max(0, flybyTimeRemaining - Math.max(0, deltaTime));

      if (
        context.agent.tryTriggerEvadeFromIncomingFire(
          context.config.flybyEvadeChance01 ?? 0.6,
          context.config.flybyEvadeRearBonusChance01 ?? 0.2,
          context.config.evadeRearThreatRange,
          context.config.evadeCooldownSeconds ?? 6
        )
      ) {
        context.runtime.returnStateAfterEvade = "Flyby";
        return "Evade";
      }

      context.agent.faceTarget(deltaTime);
      if (flybyPhase === "approach") {
        const reachedFlybyPoint = context.agent.updateFlybyApproachMovement(deltaTime, flybyTargetPoint);
        if (reachedFlybyPoint || flybyTimeRemaining <= (context.config.flybyTurnbackThresholdSeconds ?? 1.0)) {
          flybyPhase = "turnback";
        }
      } else {
        context.agent.updateFlybyTurnbackMovement(deltaTime);
      }

      if (flybyTimeRemaining <= 0) {
        return context.agent.hasPassiveSensorContact(context.config.passiveSensorLoseRange)
          ? "Engage"
          : "Search";
      }
    }
  };
}
