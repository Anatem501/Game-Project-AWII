import * as THREE from "three";

export type ShipHandlingConfig = {
  topSpeed: number;
  topManeuveringSpeed: number;
  acceleration: number;
  deceleration: number;
  strafeAcceleration: number;
  strafeDeceleration: number;
  idleForwardSpeed: number;
  yawFollowSpeedRadians: number;
};

export type ShipControlIntent = {
  forwardInput: number;
  strafeInput: number;
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
  const localVelocity = new THREE.Vector2(0, handling.idleForwardSpeed);
  const worldVelocity = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const movementQuaternion = new THREE.Quaternion();

  let shipYaw = initialYaw;

  const state: ShipControllerState = {
    forward,
    position: shipRoot.position,
    yaw: shipYaw
  };

  const update = (deltaTime: number, intent: ShipControlIntent): ShipControllerState => {
    if (deltaTime <= 0) {
      return state;
    }

    const toAimX = intent.aimTarget.x - shipRoot.position.x;
    const toAimZ = intent.aimTarget.z - shipRoot.position.z;
    if (toAimX * toAimX + toAimZ * toAimZ > 0.0001) {
      const targetYaw = -Math.atan2(toAimX, -toAimZ);
      const yawDelta = shortestAngleDelta(shipYaw, targetYaw);
      const maxYawStep = handling.yawFollowSpeedRadians * deltaTime;
      shipYaw += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);
    }

    shipRoot.rotation.y = shipYaw;
    shipRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    right.copy(forward).cross(up).normalize();

    const targetSideVelocity = intent.strafeInput * handling.topManeuveringSpeed;
    const targetForwardVelocity =
      intent.forwardInput < 0
        ? -handling.topManeuveringSpeed
        : intent.forwardInput > 0
          ? handling.topSpeed
          : handling.idleForwardSpeed;

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
      handling.topSpeed
    );

    worldVelocity.copy(right).multiplyScalar(localVelocity.x);
    worldVelocity.addScaledVector(forward, localVelocity.y);

    const topSpeedSq = handling.topSpeed * handling.topSpeed;
    if (worldVelocity.lengthSq() > topSpeedSq) {
      worldVelocity.setLength(handling.topSpeed);
    }

    shipRoot.position.addScaledVector(worldVelocity, deltaTime);

    state.yaw = shipYaw;
    return state;
  };

  return {
    update,
    getState: () => state,
    reset: (position?: THREE.Vector3, yaw = initialYaw): ShipControllerState => {
      localVelocity.set(0, handling.idleForwardSpeed);
      shipYaw = yaw;
      shipRoot.rotation.y = shipYaw;
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

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
