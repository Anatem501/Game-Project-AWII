import type { StateDefinition } from "../../../ai/StateMachine";
import { randomRange } from "../../utils/EnemyShipMath";
import type { EnemyShipAiContext, EnemyShipAiStateId } from "../EnemyShipAiTypes";

export function createEnemyEvadeState(): StateDefinition<EnemyShipAiContext, EnemyShipAiStateId> {
  let evadeTimeRemaining = 0;
  let evadeStrafeSign: 1 | -1 = 1;
  let evadeStrafeSwitchesRemaining = 0;
  let evadeStrafeSwitchTimer = 0;

  return {
    id: "Evade",
    onEnter: (context) => {
      context.agent.onAiStateChanged("Evade");
      context.agent.resetAttackBurst();
      evadeTimeRemaining = Math.max(0, context.config.evadeDurationSeconds ?? 3);
      evadeStrafeSign = Math.random() < 0.5 ? -1 : 1;
      const switchCountMin = Math.max(0, Math.floor(context.config.evadeStrafeSwitchCountMin ?? 1));
      const switchCountMax = Math.max(
        switchCountMin + 1,
        Math.floor(context.config.evadeStrafeSwitchCountMax ?? 4)
      );
      evadeStrafeSwitchesRemaining = Math.floor(randomRange(switchCountMin, switchCountMax));
      evadeStrafeSwitchTimer = randomRange(
        context.config.evadeInitialStrafeSwitchIntervalMinSeconds ?? 0.25,
        context.config.evadeInitialStrafeSwitchIntervalMaxSeconds ?? 0.8
      );
    },
    update: (context, deltaTime) => {
      if (context.agent.isDestroyed()) {
        return "Dead";
      }

      const dt = Math.max(0, deltaTime);
      evadeTimeRemaining = Math.max(0, evadeTimeRemaining - dt);
      if (evadeStrafeSwitchTimer > 0) {
        evadeStrafeSwitchTimer = Math.max(0, evadeStrafeSwitchTimer - dt);
      } else if (evadeStrafeSwitchesRemaining > 0) {
        evadeStrafeSign *= -1;
        evadeStrafeSwitchesRemaining -= 1;
        evadeStrafeSwitchTimer = randomRange(
          context.config.evadeStrafeSwitchIntervalMinSeconds ?? 0.35,
          context.config.evadeStrafeSwitchIntervalMaxSeconds ?? 0.95
        );
      }

      context.agent.updateEvadeMovement(deltaTime, evadeStrafeSign);

      if (evadeTimeRemaining <= 0) {
        return context.runtime.returnStateAfterEvade;
      }
    }
  };
}
