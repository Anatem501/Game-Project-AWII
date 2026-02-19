import * as THREE from "three";
import { GAME_CONFIG } from "../config";

const CAMERA_POSITION_FOLLOW_SHARPNESS = 7.5;
const CAMERA_TILT_RADIANS = THREE.MathUtils.degToRad(48);
const CAMERA_BASE_FOV_DEGREES = 60;
const CAMERA_TOP_SPEED_FOV_DEGREES = 65;
const CAMERA_FOV_RESPONSE_SHARPNESS = 7;
const CAMERA_ZOOM_MIN_DISTANCE = 4;
const CAMERA_ZOOM_MAX_DISTANCE = 24;
const CAMERA_ZOOM_SPEED_UNITS_PER_SECOND = 10;
const CAMERA_ZOOM_RESPONSE_SHARPNESS = 10;

type CameraControllerParams = {
  camera: THREE.PerspectiveCamera;
  initialTargetPosition: THREE.Vector3;
  initialYaw: number;
  maneuveringSpeed: number;
  thrustSpeed: number;
  arrowKeyZoomEnabled?: boolean;
};

export type CameraController = {
  update: (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number) => void;
  setArrowKeyZoomEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export function createCameraController({
  camera,
  initialTargetPosition,
  initialYaw,
  maneuveringSpeed,
  thrustSpeed,
  arrowKeyZoomEnabled = true
}: CameraControllerParams): CameraController {
  const cameraForward = new THREE.Vector3();
  const desiredCameraOffset = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const previousTargetPosition = new THREE.Vector3();
  const tiltSpeedFloor = Math.max(0, maneuveringSpeed);
  const tiltSpeedRange = Math.max(0.001, thrustSpeed - tiltSpeedFloor);
  const baseDistance = GAME_CONFIG.cameraDistance;
  const minZoomDistance = Math.min(baseDistance, CAMERA_ZOOM_MIN_DISTANCE);
  const maxZoomDistance = Math.max(baseDistance, CAMERA_ZOOM_MAX_DISTANCE);
  let currentFov = CAMERA_BASE_FOV_DEGREES;
  let currentDistance = baseDistance;
  let targetDistance = baseDistance;
  let zoomInputEnabled = arrowKeyZoomEnabled;
  let zoomInHeld = false;
  let zoomOutHeld = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!zoomInputEnabled) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "arrowup") {
      zoomInHeld = true;
      event.preventDefault();
      return;
    }
    if (key === "arrowdown") {
      zoomOutHeld = true;
      event.preventDefault();
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === "arrowup") {
      zoomInHeld = false;
      event.preventDefault();
      return;
    }
    if (key === "arrowdown") {
      zoomOutHeld = false;
      event.preventDefault();
    }
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  cameraForward.set(-Math.sin(initialYaw), 0, -Math.cos(initialYaw));
  computeTiltedCameraOffset(
    cameraForward,
    CAMERA_TILT_RADIANS,
    baseDistance,
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

    if (zoomInputEnabled) {
      const zoomIntent = (zoomOutHeld ? 1 : 0) - (zoomInHeld ? 1 : 0);
      if (zoomIntent !== 0) {
        targetDistance = THREE.MathUtils.clamp(
          targetDistance + zoomIntent * CAMERA_ZOOM_SPEED_UNITS_PER_SECOND * deltaTime,
          minZoomDistance,
          maxZoomDistance
        );
      }
    }
    const zoomBlend = 1 - Math.exp(-CAMERA_ZOOM_RESPONSE_SHARPNESS * deltaTime);
    currentDistance = THREE.MathUtils.lerp(currentDistance, targetDistance, zoomBlend);

    cameraForward.set(-Math.sin(targetYaw), 0, -Math.cos(targetYaw));

    velocity.copy(targetPosition).sub(previousTargetPosition).multiplyScalar(1 / deltaTime);
    const planarSpeed = Math.hypot(velocity.x, velocity.z);
    previousTargetPosition.copy(targetPosition);

    const speedRatio = THREE.MathUtils.clamp(
      (planarSpeed - tiltSpeedFloor) / tiltSpeedRange,
      0,
      1
    );
    computeTiltedCameraOffset(
      cameraForward,
      CAMERA_TILT_RADIANS,
      currentDistance,
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

  return {
    update,
    setArrowKeyZoomEnabled: (enabled: boolean) => {
      zoomInputEnabled = enabled;
      if (!zoomInputEnabled) {
        zoomInHeld = false;
        zoomOutHeld = false;
      }
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  };
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
