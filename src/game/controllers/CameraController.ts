import * as THREE from "three";
import { GAME_CONFIG } from "../config";

const CAMERA_POSITION_FOLLOW_SHARPNESS = 7.5;
const CAMERA_LOOK_FOLLOW_SHARPNESS = 8.5;
const CAMERA_LOOK_AHEAD_DISTANCE = 2.2;

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
  const desiredCameraPosition = new THREE.Vector3();
  const desiredLookPoint = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const cameraUpOffset = new THREE.Vector3(0, GAME_CONFIG.cameraHeight, 0);

  cameraForward.set(-Math.sin(initialYaw), 0, -Math.cos(initialYaw));
  desiredLookPoint.copy(initialTargetPosition);
  desiredLookPoint.addScaledVector(cameraForward, CAMERA_LOOK_AHEAD_DISTANCE);
  desiredLookPoint.y = 0.35;
  lookPoint.copy(desiredLookPoint);

  camera.position.copy(initialTargetPosition);
  camera.position.addScaledVector(cameraForward, -GAME_CONFIG.cameraDistance);
  camera.position.add(cameraUpOffset);
  camera.lookAt(lookPoint);

  const update = (deltaTime: number, targetPosition: THREE.Vector3, targetYaw: number): void => {
    if (deltaTime <= 0) {
      return;
    }

    cameraForward.set(-Math.sin(targetYaw), 0, -Math.cos(targetYaw));

    desiredCameraPosition.copy(targetPosition);
    desiredCameraPosition.addScaledVector(cameraForward, -GAME_CONFIG.cameraDistance);
    desiredCameraPosition.add(cameraUpOffset);

    const cameraPositionBlend = 1 - Math.exp(-CAMERA_POSITION_FOLLOW_SHARPNESS * deltaTime);
    camera.position.lerp(desiredCameraPosition, cameraPositionBlend);

    desiredLookPoint.copy(targetPosition);
    desiredLookPoint.addScaledVector(cameraForward, CAMERA_LOOK_AHEAD_DISTANCE);
    desiredLookPoint.y = 0.35;

    const cameraLookBlend = 1 - Math.exp(-CAMERA_LOOK_FOLLOW_SHARPNESS * deltaTime);
    lookPoint.lerp(desiredLookPoint, cameraLookBlend);
    camera.lookAt(lookPoint);
  };

  return { update };
}
