import * as THREE from "three";
import type { StateDefinition } from "../../../../ai/StateMachine";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../../EnemyShipAiTypes";

export function createEnemyMissileSearchState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  const searchTarget = new THREE.Vector3();

  return {
    id: "Search",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Search");
      context.runtime.searchReachedLastKnownPosition = false;
      context.runtime.searchHoldSecondsRemaining = context.config.searchHoldSeconds ?? 2;
      if (!context.agent.copyLastKnownTargetPosition(searchTarget)) {
        searchTarget.set(0, 0, 0);
      }
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      if (
        context.agent.tryTriggerEvadeFromIncomingFire(
          context.config.searchEvadeChance01 ?? 0.2,
          context.config.searchEvadeRearBonusChance01 ?? 0.2,
          context.config.evadeRearThreatRange,
          context.config.evadeCooldownSeconds ?? 6
        )
      ) {
        context.runtime.returnStateAfterEvade = "Search";
        return "Evade";
      }

      if (context.agent.hasPassiveSensorContact(context.config.passiveSensorRange)) {
        return "Circle";
      }

      if (!context.runtime.searchReachedLastKnownPosition) {
        context.runtime.searchReachedLastKnownPosition = context.agent.updateSearchMovement(
          deltaTime,
          searchTarget
        );
        return;
      }

      context.runtime.searchHoldSecondsRemaining = Math.max(
        0,
        context.runtime.searchHoldSecondsRemaining - deltaTime
      );
      if (context.runtime.searchHoldSecondsRemaining <= 0) {
        return "Patrol";
      }
    }
  };
}
