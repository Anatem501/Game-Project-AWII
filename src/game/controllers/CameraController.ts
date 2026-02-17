import * as THREE from "three";
import { GAME_CONFIG } from "../config";

const CAMERA_POSITION_FOLLOW_SHARPNESS = 7.5;
const CAMERA_BASE_TILT_RADIANS = THREE.MathUtils.degToRad(75);
const CAMERA_ACCEL_TILT_RADIANS = THREE.MathUtils.degToRad(50);
const CAMERA_FORWARD_ACCEL_FOR_MAX_TILT = 8;
const CAMERA_TILT_RESPONSE_SHARPNESS = 8;

type CameraControllerParams = {
  camera: THREE.PerspectiveCamera;
  initialTargetPosition: THREE.Vector3;
  initialYaw: number;
};

export type CameraController = {
  update: (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number) => void;
};

export function createCameraController({
  camera,
  initialTargetPosition,
  initialYaw
}: CameraControllerParams): CameraController {
  const cameraForward = new THREE.Vector3();
  const desiredCameraOffset = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const previousTargetPosition = new THREE.Vector3();
  let previousForwardSpeed = 0;
  let currentTilt = CAMERA_BASE_TILT_RADIANS;

  cameraForward.set(-Math.sin(initialYaw), 0, -Math.cos(initialYaw));
  computeTiltedCameraOffset(
    cameraForward,
    currentTilt,
    GAME_CONFIG.cameraDistance,
    desiredCameraOffset
  );

  camera.position.copy(initialTargetPosition);
  camera.position.add(desiredCameraOffset);
  camera.lookAt(initialTargetPosition);
  previousTargetPosition.copy(initialTargetPosition);

  const update = (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    cameraForward.set(-Math.sin(targetYaw), 0, -Math.cos(targetYaw));

    velocity.copy(targetPosition).sub(previousTargetPosition).multiplyScalar(1 / deltaTime);
    const forwardSpeed = velocity.dot(cameraForward);
    const forwardAcceleration = (forwardSpeed - previousForwardSpeed) / deltaTime;
    previousForwardSpeed = forwardSpeed;
    previousTargetPosition.copy(targetPosition);

    const accelerationRatio = THREE.MathUtils.clamp(
      forwardAcceleration / CAMERA_FORWARD_ACCEL_FOR_MAX_TILT,
      0,
      1
    );
    const desiredTilt = THREE.MathUtils.lerp(
      CAMERA_BASE_TILT_RADIANS,
      CAMERA_ACCEL_TILT_RADIANS,
      accelerationRatio
    );
    const tiltBlend = 1 - Math.exp(-CAMERA_TILT_RESPONSE_SHARPNESS * deltaTime);
    currentTilt = THREE.MathUtils.lerp(currentTilt, desiredTilt, tiltBlend);
    computeTiltedCameraOffset(
      cameraForward,
      currentTilt,
      GAME_CONFIG.cameraDistance,
      desiredCameraOffset
    );

    desiredCameraPosition.copy(targetPosition).add(desiredCameraOffset);
    const cameraPositionBlend = 1 - Math.exp(-CAMERA_POSITION_FOLLOW_SHARPNESS * deltaTime);
    camera.position.lerp(desiredCameraPosition, cameraPositionBlend);

    camera.lookAt(targetPosition);
  };

  return { update };
}

function computeTiltedCameraOffset(
  cameraForward: THREE.Vector3,
  tiltRadians: number,
  cameraDistance: number,
  out: THREE.Vector3
): void {
  const horizontalDistance = Math.max(0, Math.cos(tiltRadians) * cameraDistance);
  const verticalOffset = Math.max(0, Math.sin(tiltRadians) * cameraDistance);
  out.copy(cameraForward).multiplyScalar(-horizontalDistance);
  out.y = verticalOffset;
}
