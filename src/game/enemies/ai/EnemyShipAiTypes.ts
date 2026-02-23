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
  preferredAttackDistance: number;
  aimVisionRange: number;
  aimVisionFovRadians: number;
  evadeRearThreatRange: number;
  evadeCooldownSeconds?: number;
  patrolEvadeChance01?: number;
  patrolEvadeRearBonusChance01?: number;
  engageEvadeChance01?: number;
  engageEvadeRearBonusChance01?: number;
  flybyEvadeChance01?: number;
  flybyEvadeRearBonusChance01?: number;
  searchEvadeChance01?: number;
  searchEvadeRearBonusChance01?: number;
  flybyDurationSeconds?: number;
  flybyTurnbackThresholdSeconds?: number;
  evadeDurationSeconds?: number;
  evadeStrafeSwitchCountMin?: number;
  evadeStrafeSwitchCountMax?: number;
  evadeInitialStrafeSwitchIntervalMinSeconds?: number;
  evadeInitialStrafeSwitchIntervalMaxSeconds?: number;
  evadeStrafeSwitchIntervalMinSeconds?: number;
  evadeStrafeSwitchIntervalMaxSeconds?: number;
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
  buildFlybyTargetPoint: (out: THREE.Vector3) => boolean;
  updateFlybyApproachMovement: (deltaTime: number, flybyTargetPoint: THREE.Vector3) => boolean;
  updateFlybyTurnbackMovement: (deltaTime: number) => void;
  updateSearchMovement: (deltaTime: number, searchTarget: THREE.Vector3) => boolean;
  updateEvadeMovement: (deltaTime: number, strafeSign: 1 | -1) => void;
  canStartPrimaryAttack: () => boolean;
  isAttackActionActive: () => boolean;
  tryExecutePrimaryAttack: () => void;
  consumePrimaryAttackFinishedEvent: () => boolean;
  resetAttackBurst: () => void;
  tryTriggerEvadeFromIncomingFire: (
    baseChance01: number,
    rearBonusChance01: number,
    range: number,
    cooldownSeconds: number
  ) => boolean;
  onEnterDeadState: () => void;
  onAiStateChanged: (stateId: EnemyShipAiStateId) => void;
};

export type EnemyShipAiContext = {
  agent: EnemyShipAiAgent;
  config: EnemyShipAiConfig;
  runtime: EnemyShipAiRuntime;
};
