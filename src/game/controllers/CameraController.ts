import * as THREE from "three";
import { GAME_CONFIG } from "../config";

const CAMERA_POSITION_FOLLOW_SHARPNESS = 7.5;
const CAMERA_TILT_RADIANS = THREE.MathUtils.degToRad(48);
const CAMERA_BASE_FOV_DEGREES = 60;
const CAMERA_ZOOM_MIN_DISTANCE = 4;
const CAMERA_ZOOM_MAX_DISTANCE = 24;
const CAMERA_ZOOM_SPEED_UNITS_PER_SECOND = 10;
const CAMERA_ZOOM_RESPONSE_SHARPNESS = 10;

type CameraControllerParams = {
  camera: THREE.PerspectiveCamera;
  initialTargetPosition: THREE.Vector3;
  initialYaw: number;
  arrowKeyZoomEnabled?: boolean;
};

export type CameraController = {
  update: (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number) => void;
  setArrowKeyZoomEnabled: (enabled: boolean) => void;
  setYawLock: (yaw: number | null) => void;
  dispose: () => void;
};

export function createCameraController({
  camera,
  initialTargetPosition,
  initialYaw,
  arrowKeyZoomEnabled = true
}: CameraControllerParams): CameraController {
  const cameraForward = new THREE.Vector3();
  const desiredCameraOffset = new THREE.Vector3();
  const desiredCameraPosition = new THREE.Vector3();
  const baseDistance = GAME_CONFIG.cameraDistance;
  const minZoomDistance = Math.min(baseDistance, CAMERA_ZOOM_MIN_DISTANCE);
  const maxZoomDistance = Math.max(baseDistance, CAMERA_ZOOM_MAX_DISTANCE);
  let currentDistance = baseDistance;
  let targetDistance = baseDistance;
  let zoomInputEnabled = arrowKeyZoomEnabled;
  let zoomInHeld = false;
  let zoomOutHeld = false;
  let yawLock: number | null = null;

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
  camera.fov = CAMERA_BASE_FOV_DEGREES;
  camera.updateProjectionMatrix();

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

    const cameraFollowYaw = yawLock ?? targetYaw;
    cameraForward.set(-Math.sin(cameraFollowYaw), 0, -Math.cos(cameraFollowYaw));
    computeTiltedCameraOffset(
      cameraForward,
      CAMERA_TILT_RADIANS,
      currentDistance,
      desiredCameraOffset
    );

    desiredCameraPosition.copy(targetPosition).add(desiredCameraOffset);
    const cameraPositionBlend = 1 - Math.exp(-CAMERA_POSITION_FOLLOW_SHARPNESS * deltaTime);
    camera.position.lerp(desiredCameraPosition, cameraPositionBlend);

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
    setYawLock: (yaw: number | null) => {
      yawLock = yaw;
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
