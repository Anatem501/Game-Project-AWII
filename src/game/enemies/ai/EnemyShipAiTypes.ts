export type EnemyShipAiStateId = "Spawn" | "Patrol" | "Chase" | "Attack" | "Dead";

export type EnemyShipAiConfig = {
  spawnDurationSeconds: number;
  detectionRange: number;
  loseTargetRange: number;
  attackRange: number;
  attackDisengageRangeMultiplier: number;
  preferredAttackDistance: number;
};

export type EnemyShipAiRuntime = {
  spawnTimeRemaining: number;
};

export type EnemyShipAiAgent = {
  isDestroyed: () => boolean;
  getTargetDistance: () => number | null;
  faceTarget: (deltaTime: number) => boolean;
  updatePatrolMovement: (deltaTime: number) => void;
  updateChaseMovement: (deltaTime: number) => void;
  updateAttackMovement: (deltaTime: number, distanceToTarget: number) => void;
  tryFireBurstAttack: () => void;
  resetAttackBurst: () => void;
  onEnterDeadState: () => void;
  onAiStateChanged: (stateId: EnemyShipAiStateId) => void;
};

export type EnemyShipAiContext = {
  agent: EnemyShipAiAgent;
  config: EnemyShipAiConfig;
  runtime: EnemyShipAiRuntime;
};
