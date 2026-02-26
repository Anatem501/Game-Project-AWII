import * as THREE from "three";

const TURN_MAX_YAW_RATE_RADIANS = THREE.MathUtils.degToRad(120);
const TURN_MAX_BANK_ROLL_RADIANS = THREE.MathUtils.degToRad(28);
const STRAFE_MAX_BANK_ROLL_RADIANS = THREE.MathUtils.degToRad(14);
const TOTAL_MAX_BANK_ROLL_RADIANS = THREE.MathUtils.degToRad(52);
const TURN_BANK_ROLL_SMOOTHING = 9;
const IDLE_FORWARD_SPEED_UNITS_PER_SECOND = 1;
const SHIP_ROTATION_ORDER = "YXZ";

const MANEUVER_SIDE_ROLL_DURATION_SECONDS = 1.12;
const MANEUVER_FORWARD_ROLL_DURATION_SECONDS = 1.28;
const MANEUVER_SIDE_ROLL_DISTANCE = 7.8;
const MANEUVER_SIDE_ROLL_FORWARD_DISTANCE = 3.1;
const MANEUVER_FORWARD_ROLL_DISTANCE = 9.4;
const MANEUVER_FORWARD_ROLL_LATERAL_SWAY_DISTANCE = 1.15;

export type ShipTemporaryManeuverKind =
  | "side_roll_left"
  | "side_roll_right"
  | "forward_barrel_roll";

type ShipTemporaryManeuverState = {
  kind: ShipTemporaryManeuverKind;
  elapsedSeconds: number;
  durationSeconds: number;
  startPosition: THREE.Vector3;
  startYaw: number;
  cameraLockYaw: number;
};

export type ShipHandlingConfig = {
  thrustSpeed: number;
  topManeuveringSpeed: number;
  acceleration: number;
  deceleration: number;
  strafeAcceleration: number;
  strafeDeceleration: number;
};

export type ShipControlIntent = {
  forwardInput: number;
  strafeInput: number;
  turnInput: number;
  aimTarget: THREE.Vector3;
};

export type ShipControllerState = {
  forward: THREE.Vector3;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
};

type ShipControllerParams = {
  shipRoot: THREE.Group;
  handling: ShipHandlingConfig;
  initialYaw?: number;
  getMoveSpeedMultiplier?: () => number;
  getTurnRateMultiplier?: () => number;
  getFrozenDriftVelocity?: (out: THREE.Vector3) => THREE.Vector3 | null;
};

export type ShipController = {
  update: (deltaTime: number, intent: ShipControlIntent) => ShipControllerState;
  getState: () => ShipControllerState;
  reset: (position?: THREE.Vector3, yaw?: number) => ShipControllerState;
  startTemporaryManeuver: (kind: ShipTemporaryManeuverKind) => boolean;
  isTemporaryManeuverActive: () => boolean;
  isTemporaryManeuverInvulnerable: () => boolean;
  getTemporaryManeuverCameraLockYaw: () => number | null;
};

export function createShipController({
  shipRoot,
  handling,
  initialYaw = 0,
  getMoveSpeedMultiplier,
  getTurnRateMultiplier,
  getFrozenDriftVelocity
}: ShipControllerParams): ShipController {
  const localVelocity = new THREE.Vector2(0, IDLE_FORWARD_SPEED_UNITS_PER_SECOND);
  const worldVelocity = new THREE.Vector3();
  const frozenDriftVelocity = new THREE.Vector3();
  const frozenDriftHeading = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const movementQuaternion = new THREE.Quaternion();
  const desiredTemporaryPosition = new THREE.Vector3();
  const previousTemporaryPosition = new THREE.Vector3();
  const stateVelocity = new THREE.Vector3();

  let shipYaw = initialYaw;
  let visualRoll = 0;
  let visualPitch = 0;
  let activeTemporaryManeuver: ShipTemporaryManeuverState | null = null;

  const state: ShipControllerState = {
    forward,
    position: shipRoot.position,
    velocity: stateVelocity,
    yaw: shipYaw
  };

  const update = (deltaTime: number, intent: ShipControlIntent): ShipControllerState => {
    if (deltaTime <= 0) {
      return state;
    }

    const moveSpeedMultiplier = THREE.MathUtils.clamp(getMoveSpeedMultiplier?.() ?? 1, 0, 10);
    const turnRateMultiplier = THREE.MathUtils.clamp(getTurnRateMultiplier?.() ?? 1, 0, 10);
    const currentFrozenDriftVelocity = getFrozenDriftVelocity?.(frozenDriftVelocity) ?? null;
    if (currentFrozenDriftVelocity) {
      activeTemporaryManeuver = null;
      visualPitch = THREE.MathUtils.lerp(visualPitch, 0, 1 - Math.exp(-8 * deltaTime));
      visualRoll = THREE.MathUtils.lerp(visualRoll, 0, 1 - Math.exp(-8 * deltaTime));
      shipRoot.position.addScaledVector(currentFrozenDriftVelocity, deltaTime);
      stateVelocity.copy(currentFrozenDriftVelocity);
      if (currentFrozenDriftVelocity.lengthSq() > 0.000001) {
        frozenDriftHeading.copy(currentFrozenDriftVelocity).setY(0);
        if (frozenDriftHeading.lengthSq() > 0.000001) {
          frozenDriftHeading.normalize();
          shipYaw = -Math.atan2(frozenDriftHeading.x, -frozenDriftHeading.z);
        }
      }
      shipRoot.rotation.set(visualPitch, shipYaw, visualRoll, SHIP_ROTATION_ORDER);
      shipRoot.getWorldQuaternion(movementQuaternion);
      forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
      state.yaw = shipYaw;
      return state;
    }

    if (activeTemporaryManeuver) {
      updateTemporaryManeuver(deltaTime);
      return state;
    }

    shipRoot.rotation.set(visualPitch, shipYaw, visualRoll, SHIP_ROTATION_ORDER);
    shipRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    right.set(-forward.z, 0, forward.x).normalize();

    const turnInput = THREE.MathUtils.clamp(intent.turnInput, -1, 1);
    const hasTurnInput = Math.abs(turnInput) > 0.0001;

    const effectiveTopManeuveringSpeed = handling.topManeuveringSpeed * moveSpeedMultiplier;
    const effectiveThrustSpeed = handling.thrustSpeed * moveSpeedMultiplier;
    const effectiveIdleForwardSpeed = IDLE_FORWARD_SPEED_UNITS_PER_SECOND * moveSpeedMultiplier;
    const targetSideVelocity = intent.strafeInput * effectiveTopManeuveringSpeed;
    const targetForwardVelocity =
      intent.forwardInput < 0
        ? -effectiveTopManeuveringSpeed
        : intent.forwardInput > 0
          ? effectiveThrustSpeed
          : effectiveIdleForwardSpeed;

    localVelocity.x = approachVelocityAxis(
      localVelocity.x,
      targetSideVelocity,
      deltaTime,
      handling.strafeAcceleration,
      handling.strafeDeceleration,
      Math.abs(intent.strafeInput) > 0.0001
    );
    localVelocity.y = approachVelocityAxis(
      localVelocity.y,
      targetForwardVelocity,
      deltaTime,
      handling.acceleration,
      handling.deceleration,
      Math.abs(intent.forwardInput) > 0.0001
    );

    localVelocity.x = THREE.MathUtils.clamp(
      localVelocity.x,
      -effectiveTopManeuveringSpeed,
      effectiveTopManeuveringSpeed
    );
    localVelocity.y = THREE.MathUtils.clamp(
      localVelocity.y,
      -effectiveTopManeuveringSpeed,
      effectiveThrustSpeed
    );

    let currentTurnYawRate = 0;
    if (hasTurnInput) {
      currentTurnYawRate = turnInput * TURN_MAX_YAW_RATE_RADIANS * turnRateMultiplier;
      shipYaw += currentTurnYawRate * deltaTime;
    }

    const turnRateRatio = THREE.MathUtils.clamp(
      currentTurnYawRate / TURN_MAX_YAW_RATE_RADIANS,
      -1,
      1
    );
    const hasForwardThrustInput = intent.forwardInput > 0.0001;
    const strafeRatio = THREE.MathUtils.clamp(
      localVelocity.x / Math.max(0.001, handling.topManeuveringSpeed),
      -1,
      1
    );
    const turnRoll = hasForwardThrustInput ? turnRateRatio * TURN_MAX_BANK_ROLL_RADIANS : 0;
    const strafeRoll = -strafeRatio * STRAFE_MAX_BANK_ROLL_RADIANS;
    const targetRoll = THREE.MathUtils.clamp(
      turnRoll + strafeRoll,
      -TOTAL_MAX_BANK_ROLL_RADIANS,
      TOTAL_MAX_BANK_ROLL_RADIANS
    );
    const rollBlend = 1 - Math.exp(-TURN_BANK_ROLL_SMOOTHING * deltaTime);
    visualRoll = THREE.MathUtils.lerp(visualRoll, targetRoll, rollBlend);
    visualPitch = THREE.MathUtils.lerp(visualPitch, 0, rollBlend);

    shipRoot.rotation.set(visualPitch, shipYaw, visualRoll, SHIP_ROTATION_ORDER);
    shipRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    right.set(-forward.z, 0, forward.x).normalize();

    worldVelocity.copy(right).multiplyScalar(localVelocity.x);
    worldVelocity.addScaledVector(forward, localVelocity.y);

    const thrustSpeedSq = effectiveThrustSpeed * effectiveThrustSpeed;
    if (worldVelocity.lengthSq() > thrustSpeedSq) {
      worldVelocity.setLength(effectiveThrustSpeed);
    }

    shipRoot.position.addScaledVector(worldVelocity, deltaTime);
    stateVelocity.copy(worldVelocity);
    state.yaw = shipYaw;
    return state;
  };

  const updateTemporaryManeuver = (deltaTime: number): void => {
    const maneuver = activeTemporaryManeuver;
    if (!maneuver) {
      return;
    }

    maneuver.elapsedSeconds = Math.min(
      maneuver.durationSeconds,
      maneuver.elapsedSeconds + Math.max(0, deltaTime)
    );
    const t = THREE.MathUtils.clamp(
      maneuver.elapsedSeconds / Math.max(0.0001, maneuver.durationSeconds),
      0,
      1
    );
    const eased = easeInOutCubic(t);

    const startForward = new THREE.Vector3(
      -Math.sin(maneuver.startYaw),
      0,
      -Math.cos(maneuver.startYaw)
    );
    const startRight = new THREE.Vector3(-startForward.z, 0, startForward.x);
    let localStrafe = 0;
    let localForward = 0;
    let localUp = 0;
    let yawDelta = 0;
    let roll = 0;
    let pitch = 0;

    switch (maneuver.kind) {
      case "side_roll_left":
      case "side_roll_right": {
        const directionSign = maneuver.kind === "side_roll_right" ? 1 : -1;
        localStrafe = directionSign * MANEUVER_SIDE_ROLL_DISTANCE * easeInOutCubic(t);
        localForward = MANEUVER_SIDE_ROLL_FORWARD_DISTANCE * eased;
        roll = directionSign * Math.PI * 2 * eased;
        break;
      }
      case "forward_barrel_roll": {
        localForward = MANEUVER_FORWARD_ROLL_DISTANCE * eased;
        localStrafe = Math.sin(Math.PI * t) * MANEUVER_FORWARD_ROLL_LATERAL_SWAY_DISTANCE;
        roll = Math.PI * 2 * eased;
        break;
      }
      default:
        break;
    }

    const desiredYaw = normalizeAngleRadians(maneuver.startYaw + yawDelta);
    const desiredPitch = pitch;
    const desiredRoll = roll;
    previousTemporaryPosition.copy(shipRoot.position);
    desiredTemporaryPosition
      .copy(maneuver.startPosition)
      .addScaledVector(startRight, localStrafe)
      .addScaledVector(startForward, localForward);
    desiredTemporaryPosition.y = maneuver.startPosition.y + localUp;

    shipYaw = desiredYaw;
    visualPitch = desiredPitch;
    visualRoll = desiredRoll;
    shipRoot.position.copy(desiredTemporaryPosition);

    shipRoot.rotation.set(visualPitch, shipYaw, visualRoll, SHIP_ROTATION_ORDER);
    shipRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0);
    if (forward.lengthSq() <= 0.000001) {
      forward.set(-Math.sin(shipYaw), 0, -Math.cos(shipYaw));
    } else {
      forward.normalize();
    }
    state.yaw = shipYaw;
    if (deltaTime > 0) {
      stateVelocity
        .copy(desiredTemporaryPosition)
        .sub(previousTemporaryPosition)
        .multiplyScalar(1 / deltaTime);
    } else {
      stateVelocity.set(0, 0, 0);
    }

    if (t >= 0.9999) {
      // Canonicalize to level orientation so normal flight roll smoothing does not
      // "unwind" a completed 360-degree maneuver and create a visible second roll.
      visualPitch = 0;
      visualRoll = 0;
      activeTemporaryManeuver = null;
      localVelocity.set(0, IDLE_FORWARD_SPEED_UNITS_PER_SECOND);
      shipRoot.rotation.set(visualPitch, shipYaw, visualRoll, SHIP_ROTATION_ORDER);
      shipRoot.getWorldQuaternion(movementQuaternion);
      forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    }
  };

  return {
    update,
    getState: () => state,
    reset: (position?: THREE.Vector3, yaw = initialYaw): ShipControllerState => {
      localVelocity.set(0, IDLE_FORWARD_SPEED_UNITS_PER_SECOND);
      shipYaw = yaw;
      visualRoll = 0;
      visualPitch = 0;
      activeTemporaryManeuver = null;
      shipRoot.rotation.set(visualPitch, shipYaw, visualRoll, SHIP_ROTATION_ORDER);
      if (position) {
        shipRoot.position.copy(position);
      }

      shipRoot.getWorldQuaternion(movementQuaternion);
      forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
      stateVelocity.set(0, 0, 0);
      state.yaw = shipYaw;
      return state;
    },
    startTemporaryManeuver: (kind: ShipTemporaryManeuverKind): boolean => {
      if (activeTemporaryManeuver) {
        return false;
      }
      activeTemporaryManeuver = {
        kind,
        elapsedSeconds: 0,
        durationSeconds:
          kind === "forward_barrel_roll"
            ? MANEUVER_FORWARD_ROLL_DURATION_SECONDS
            : MANEUVER_SIDE_ROLL_DURATION_SECONDS,
        startPosition: shipRoot.position.clone(),
        startYaw: shipYaw,
        cameraLockYaw: shipYaw
      };
      localVelocity.set(0, IDLE_FORWARD_SPEED_UNITS_PER_SECOND);
      return true;
    },
    isTemporaryManeuverActive: (): boolean => activeTemporaryManeuver !== null,
    isTemporaryManeuverInvulnerable: (): boolean => activeTemporaryManeuver !== null,
    getTemporaryManeuverCameraLockYaw: (): number | null =>
      activeTemporaryManeuver?.cameraLockYaw ?? null
  };
}

function approachVelocityAxis(
  current: number,
  target: number,
  deltaTime: number,
  acceleration: number,
  deceleration: number,
  hasInput: boolean
): number {
  if (hasInput) {
    return moveTowards(current, target, acceleration * deltaTime);
  }

  return moveTowards(current, target, deceleration * deltaTime);
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function easeInOutCubic(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function normalizeAngleRadians(angle: number): number {
  return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
}

function smoothSegment(value: number, start: number, end: number): number {
  if (end <= start) {
    return value >= end ? 1 : 0;
  }
  const normalized = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return easeInOutCubic(normalized);
}


