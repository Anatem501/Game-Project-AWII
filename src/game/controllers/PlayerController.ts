import * as THREE from "three";
import type { ShipController, ShipControllerState } from "./ShipController";

const RETICLE_VERTICAL_RANGE = 1.2;
const RETICLE_MAX_DISTANCE_FROM_SHIP = 8;

const RETICLE_MERGE_START_DISTANCE = 0.7;
const RETICLE_MERGE_FULL_DISTANCE = 0.18;

const MOVEMENT_KEYS = new Set(["w", "a", "s", "d", "q", "e"]);

type PlayerControllerParams = {
  canvas: HTMLCanvasElement;
  shipController: ShipController;
  inputAimReticle: THREE.Object3D;
  trueAimReticle: THREE.Object3D;
};

export type PlayerControllerState = ShipControllerState;

export type PlayerController = {
  update: (deltaTime: number, camera: THREE.PerspectiveCamera) => PlayerControllerState;
  dispose: () => void;
};

export function createPlayerController({
  canvas,
  shipController,
  inputAimReticle,
  trueAimReticle
}: PlayerControllerParams): PlayerController {
  const pressedKeys = new Set<string>();
  const pointerNdc = new THREE.Vector2(0, 0);
  const aimPointerNdc = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3();
  const inputAimTarget = new THREE.Vector3();
  const trueAimTarget = new THREE.Vector3();
  const trueAimProbe = new THREE.Vector3();
  const projectedTrueAimProbeNdc = new THREE.Vector3();
  const trueAimNdc = new THREE.Vector2();
  const lastMouseWorld = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const movementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let hasLastMouseWorld = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (!MOVEMENT_KEYS.has(key)) {
      return;
    }

    pressedKeys.add(key);
    event.preventDefault();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (!MOVEMENT_KEYS.has(key)) {
      return;
    }

    pressedKeys.delete(key);
    event.preventDefault();
  };

  const updatePointerFromScreen = (clientX: number, clientY: number): void => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  };

  const onPointerMove = (event: PointerEvent): void => {
    updatePointerFromScreen(event.clientX, event.clientY);
    aimPointerNdc.copy(pointerNdc);
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove);

  const initialRect = canvas.getBoundingClientRect();
  updatePointerFromScreen(
    initialRect.left + initialRect.width * 0.5,
    initialRect.top + initialRect.height * 0.5
  );
  aimPointerNdc.copy(pointerNdc);

  const update = (deltaTime: number, camera: THREE.PerspectiveCamera): PlayerControllerState => {
    const currentShipState = shipController.getState();

    if (deltaTime <= 0) {
      return currentShipState;
    }

    const aimWorldY = currentShipState.position.y + aimPointerNdc.y * RETICLE_VERTICAL_RANGE;

    raycaster.setFromCamera(aimPointerNdc, camera);
    const hitPoint = raycaster.ray.intersectPlane(movementPlane, mouseWorld);
    if (hitPoint) {
      lastMouseWorld.copy(hitPoint);
      hasLastMouseWorld = true;
    }

    if (hasLastMouseWorld) {
      inputAimTarget.copy(lastMouseWorld);
      inputAimTarget.y = aimWorldY;
    } else {
      inputAimTarget.set(currentShipState.position.x, aimWorldY, currentShipState.position.z);
    }

    inputAimReticle.position.copy(inputAimTarget);
    inputAimReticle.visible = true;

    const forwardInput = (pressedKeys.has("w") ? 1 : 0) - (pressedKeys.has("s") ? 1 : 0);
    const strafeInput = (pressedKeys.has("d") ? 1 : 0) - (pressedKeys.has("a") ? 1 : 0);
    const turnInput = (pressedKeys.has("q") ? 1 : 0) - (pressedKeys.has("e") ? 1 : 0);

    const updatedShipState = shipController.update(deltaTime, {
      aimTarget: inputAimReticle.position,
      forwardInput,
      strafeInput,
      turnInput
    });

    const updatedAimWorldY = updatedShipState.position.y + aimPointerNdc.y * RETICLE_VERTICAL_RANGE;

    trueAimProbe
      .copy(updatedShipState.position)
      .addScaledVector(updatedShipState.forward, RETICLE_MAX_DISTANCE_FROM_SHIP);
    projectedTrueAimProbeNdc.copy(trueAimProbe).project(camera);
    trueAimNdc.set(projectedTrueAimProbeNdc.x, aimPointerNdc.y);
    raycaster.setFromCamera(trueAimNdc, camera);
    const trueAimHit = raycaster.ray.intersectPlane(movementPlane, trueAimTarget);
    if (!trueAimHit) {
      trueAimTarget.copy(trueAimProbe);
    }
    trueAimTarget.y = updatedAimWorldY;
    trueAimReticle.position.copy(trueAimTarget);
    trueAimReticle.rotation.y = updatedShipState.yaw;
    trueAimReticle.visible = true;
    inputAimReticle.rotation.y = updatedShipState.yaw;

    const reticleDistance = inputAimReticle.position.distanceTo(trueAimReticle.position);
    const mergeFactor = THREE.MathUtils.clamp(
      (RETICLE_MERGE_START_DISTANCE - reticleDistance) /
        (RETICLE_MERGE_START_DISTANCE - RETICLE_MERGE_FULL_DISTANCE),
      0,
      1
    );
    if (mergeFactor > 0) {
      inputAimReticle.position.lerp(trueAimReticle.position, mergeFactor);
    }

    return updatedShipState;
  };

  const dispose = (): void => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("pointermove", onPointerMove);
  };

  return { update, dispose };
}
