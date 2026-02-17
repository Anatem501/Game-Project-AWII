import * as THREE from "three";
import { GAME_CONFIG } from "../config";

const CAMERA_POSITION_FOLLOW_SHARPNESS = 7.5;
const CAMERA_BASE_TILT_RADIANS = THREE.MathUtils.degToRad(48);
const CAMERA_TOP_SPEED_TILT_RADIANS = THREE.MathUtils.degToRad(48);
const CAMERA_TILT_RESPONSE_SHARPNESS = 8;
const CAMERA_BASE_FOV_DEGREES = 60;
const CAMERA_TOP_SPEED_FOV_DEGREES = 70;
const CAMERA_FOV_RESPONSE_SHARPNESS = 7;

type CameraControllerParams = {
  camera: THREE.PerspectiveCamera;
  initialTargetPosition: THREE.Vector3;
  initialYaw: number;
  maneuveringSpeed: number;
  thrustSpeed: number;
};

export type CameraController = {
  update: (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number) => void;
};

export function createCameraController({
  camera,
  initialTargetPosition,
  initialYaw,
  maneuveringSpeed,
  thrustSpeed
}: CameraControllerParams): CameraController {
  const cameraForward = new THREE.Vector3();
  const desiredCameraOffset = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const previousTargetPosition = new THREE.Vector3();
  const tiltSpeedFloor = Math.max(0, maneuveringSpeed);
  const tiltSpeedRange = Math.max(0.001, thrustSpeed - tiltSpeedFloor);
  let currentTilt = CAMERA_BASE_TILT_RADIANS;
  let currentFov = CAMERA_BASE_FOV_DEGREES;

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
  camera.fov = currentFov;
  camera.updateProjectionMatrix();
  previousTargetPosition.copy(initialTargetPosition);

  const update = (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    cameraForward.set(-Math.sin(targetYaw), 0, -Math.cos(targetYaw));

    velocity.copy(targetPosition).sub(previousTargetPosition).multiplyScalar(1 / deltaTime);
    const planarSpeed = Math.hypot(velocity.x, velocity.z);
    previousTargetPosition.copy(targetPosition);

    const speedRatio = THREE.MathUtils.clamp(
      (planarSpeed - tiltSpeedFloor) / tiltSpeedRange,
      0,
      1
    );
    const desiredTilt = THREE.MathUtils.lerp(
      CAMERA_BASE_TILT_RADIANS,
      CAMERA_TOP_SPEED_TILT_RADIANS,
      speedRatio
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

    const desiredFov = THREE.MathUtils.lerp(
      CAMERA_BASE_FOV_DEGREES,
      CAMERA_TOP_SPEED_FOV_DEGREES,
      speedRatio
    );
    const fovBlend = 1 - Math.exp(-CAMERA_FOV_RESPONSE_SHARPNESS * deltaTime);
    currentFov = THREE.MathUtils.lerp(currentFov, desiredFov, fovBlend);
    if (Math.abs(camera.fov - currentFov) > 0.001) {
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }

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
  const clampedDistance = Math.max(0, cameraDistance);
  const horizontalDistance = Math.cos(tiltRadians) * clampedDistance;
  const verticalOffset = Math.sin(tiltRadians) * clampedDistance;
  out.copy(cameraForward).multiplyScalar(-horizontalDistance);
  out.y = verticalOffset;
}
