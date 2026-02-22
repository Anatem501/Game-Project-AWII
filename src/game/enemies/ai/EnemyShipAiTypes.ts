import type * as THREE from "three";

export type EnemyShipAiStateId =
  | "Spawn"
  | "Patrol"
  | "Engage"
  | "Attack"
  | "Flyby"
  | "Evade"
  | "Search"
  | "Dead";

export type EnemyShipAiConfig = {
  spawnDurationSeconds: number;
  passiveSensorRange: number;
  passiveSensorLoseRange: number;
  attackRange: number;
  attackDisengageRangeMultiplier: number;
  preferredAttackDistance: number;
  aimVisionRange: number;
  aimVisionFovRadians: number;
  evadeRearThreatRange: number;
  evadeCooldownSeconds?: number;
  searchHoldSeconds?: number;
};

export type EnemyShipAiRuntime = {
  spawnTimeRemaining: number;
  returnStateAfterEvade: EnemyShipAiStateId;
  searchReachedLastKnownPosition: boolean;
  searchHoldSecondsRemaining: number;
};

export type EnemyShipAiAgent = {
  isDestroyed: () => boolean;
  getTargetDistance: () => number | null;
  hasPassiveSensorContact: (maxRange: number) => boolean;
  copyLastKnownTargetPosition: (out: THREE.Vector3) => boolean;
  hasAimVisionContact: (maxRange: number, fovRadians: number) => boolean;
  faceTarget: (deltaTime: number) => boolean;
  updatePatrolMovement: (deltaTime: number) => void;
  updateEngageMovement: (deltaTime: number) => void;
  updateAttackMovement: (deltaTime: number, distanceToTarget: number) => void;
  beginFlybyManeuver: () => void;
  updateFlybyMovement: (deltaTime: number) => void;
  isFlybyManeuverComplete: () => boolean;
  updateSearchMovement: (deltaTime: number, searchTarget: THREE.Vector3) => boolean;
  updateEvadeMovement: (deltaTime: number) => void;
  canStartLaserBurstAttack: () => boolean;
  isAttackActionActive: () => boolean;
  tryFireBurstAttack: () => void;
  consumeBurstFinishedEvent: () => boolean;
  resetAttackBurst: () => void;
  tryTriggerEvadeFromIncomingFire: (
    baseChance01: number,
    rearBonusChance01: number,
    range: number,
    cooldownSeconds: number
  ) => boolean;
  beginEvadeManeuver: () => void;
  isEvadeManeuverComplete: () => boolean;
  onEnterDeadState: () => void;
  onAiStateChanged: (stateId: EnemyShipAiStateId) => void;
};

export type EnemyShipAiContext = {
  agent: EnemyShipAiAgent;
  config: EnemyShipAiConfig;
  runtime: EnemyShipAiRuntime;
};
