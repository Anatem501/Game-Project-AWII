import * as THREE from "three";

const TURN_MAX_YAW_RATE_RADIANS = THREE.MathUtils.degToRad(120);
const TURN_MAX_BANK_ROLL_RADIANS = THREE.MathUtils.degToRad(40);
const STRAFE_MAX_BANK_ROLL_RADIANS = THREE.MathUtils.degToRad(14);
const TOTAL_MAX_BANK_ROLL_RADIANS = THREE.MathUtils.degToRad(52);
const TURN_BANK_ROLL_SMOOTHING = 9;
const IDLE_FORWARD_SPEED_UNITS_PER_SECOND = 1;

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
  yaw: number;
};

type ShipControllerParams = {
  shipRoot: THREE.Group;
  handling: ShipHandlingConfig;
  initialYaw?: number;
};

export type ShipController = {
  update: (deltaTime: number, intent: ShipControlIntent) => ShipControllerState;
  getState: () => ShipControllerState;
  reset: (position?: THREE.Vector3, yaw?: number) => ShipControllerState;
};

export function createShipController({
  shipRoot,
  handling,
  initialYaw = 0
}: ShipControllerParams): ShipController {
  const localVelocity = new THREE.Vector2(0, IDLE_FORWARD_SPEED_UNITS_PER_SECOND);
  const worldVelocity = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const movementQuaternion = new THREE.Quaternion();

  let shipYaw = initialYaw;
  let visualRoll = 0;

  const state: ShipControllerState = {
    forward,
    position: shipRoot.position,
    yaw: shipYaw
  };

  const update = (deltaTime: number, intent: ShipControlIntent): ShipControllerState => {
    if (deltaTime <= 0) {
      return state;
    }

    shipRoot.rotation.set(0, shipYaw, visualRoll);
    shipRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    right.set(-forward.z, 0, forward.x).normalize();

    const turnInput = THREE.MathUtils.clamp(intent.turnInput, -1, 1);
    const hasTurnInput = Math.abs(turnInput) > 0.0001;

    const targetSideVelocity = intent.strafeInput * handling.topManeuveringSpeed;
    const targetForwardVelocity =
      intent.forwardInput < 0
        ? -handling.topManeuveringSpeed
        : intent.forwardInput > 0
          ? handling.thrustSpeed
          : IDLE_FORWARD_SPEED_UNITS_PER_SECOND;

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
      -handling.topManeuveringSpeed,
      handling.topManeuveringSpeed
    );
    localVelocity.y = THREE.MathUtils.clamp(
      localVelocity.y,
      -handling.topManeuveringSpeed,
      handling.thrustSpeed
    );

    let currentTurnYawRate = 0;
    if (hasTurnInput) {
      currentTurnYawRate = turnInput * TURN_MAX_YAW_RATE_RADIANS;
      shipYaw += currentTurnYawRate * deltaTime;
    }

    const turnRateRatio = THREE.MathUtils.clamp(
      currentTurnYawRate / TURN_MAX_YAW_RATE_RADIANS,
      -1,
      1
    );
    const strafeRatio = THREE.MathUtils.clamp(
      localVelocity.x / Math.max(0.001, handling.topManeuveringSpeed),
      -1,
      1
    );
    const turnRoll = turnRateRatio * TURN_MAX_BANK_ROLL_RADIANS;
    const strafeRoll = -strafeRatio * STRAFE_MAX_BANK_ROLL_RADIANS;
    const targetRoll = THREE.MathUtils.clamp(
      turnRoll + strafeRoll,
      -TOTAL_MAX_BANK_ROLL_RADIANS,
      TOTAL_MAX_BANK_ROLL_RADIANS
    );
    const rollBlend = 1 - Math.exp(-TURN_BANK_ROLL_SMOOTHING * deltaTime);
    visualRoll = THREE.MathUtils.lerp(visualRoll, targetRoll, rollBlend);

    shipRoot.rotation.set(0, shipYaw, visualRoll);
    shipRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    right.set(-forward.z, 0, forward.x).normalize();

    worldVelocity.copy(right).multiplyScalar(localVelocity.x);
    worldVelocity.addScaledVector(forward, localVelocity.y);

    const thrustSpeedSq = handling.thrustSpeed * handling.thrustSpeed;
    if (worldVelocity.lengthSq() > thrustSpeedSq) {
      worldVelocity.setLength(handling.thrustSpeed);
    }

    shipRoot.position.addScaledVector(worldVelocity, deltaTime);
    state.yaw = shipYaw;
    return state;
  };

  return {
    update,
    getState: () => state,
    reset: (position?: THREE.Vector3, yaw = initialYaw): ShipControllerState => {
      localVelocity.set(0, IDLE_FORWARD_SPEED_UNITS_PER_SECOND);
      shipYaw = yaw;
      visualRoll = 0;
      shipRoot.rotation.set(0, shipYaw, visualRoll);
      if (position) {
        shipRoot.position.copy(position);
      }

      shipRoot.getWorldQuaternion(movementQuaternion);
      forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
      state.yaw = shipYaw;
      return state;
    }
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
