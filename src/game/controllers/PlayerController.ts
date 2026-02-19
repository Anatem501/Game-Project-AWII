import * as THREE from "three";
import type { ShipController, ShipControllerState } from "./ShipController";

const RETICLE_VERTICAL_RANGE = 1.2;
const RETICLE_MAX_DISTANCE_FROM_SHIP = 8;
const RETICLE_VIEWPORT_EDGE_MARGIN_NDC = 0.06;
const RETICLE_VIEWPORT_TOP_EDGE_MARGIN_NDC = 0.11;
const RETICLE_VIEWPORT_BOTTOM_EDGE_MARGIN_NDC = 0.12;

const RETICLE_MERGE_START_DISTANCE = 0.7;
const RETICLE_MERGE_FULL_DISTANCE = 0.18;
const GAMEPAD_AXIS_LEFT_X = 0;
const GAMEPAD_AXIS_LEFT_Y = 1;
const GAMEPAD_AXIS_RIGHT_X = 2;
const GAMEPAD_AXIS_RIGHT_Y = 3;
const GAMEPAD_AXIS_DEADZONE = 0.2;
const GAMEPAD_LOOK_SPEED_NDC_PER_SECOND = 1.15;
const GAMEPAD_TURN_DEADZONE_RADIANS = THREE.MathUtils.degToRad(2);
const GAMEPAD_TURN_FULL_INPUT_RADIANS = THREE.MathUtils.degToRad(40);
const GAMEPAD_STRAFE_RECENTER_DEADZONE_UNITS = 0.35;
const GAMEPAD_STRAFE_RECENTER_FULL_INPUT_UNITS = 3.5;
const GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX = 5;

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
  const toAim = new THREE.Vector3();
  const shipRight = new THREE.Vector3();

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

  const clearMovementInputs = (): void => {
    pressedKeys.clear();
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
    clampAimPointerToViewportMargin(aimPointerNdc);
  };

  const onWindowBlur = (): void => {
    clearMovementInputs();
  };

  const onVisibilityChange = (): void => {
    if (!document.hidden) {
      return;
    }
    clearMovementInputs();
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("pointermove", onPointerMove);

  const initialRect = canvas.getBoundingClientRect();
  updatePointerFromScreen(
    initialRect.left + initialRect.width * 0.5,
    initialRect.top + initialRect.height * 0.5
  );
  aimPointerNdc.copy(pointerNdc);
  clampAimPointerToViewportMargin(aimPointerNdc);

  const update = (deltaTime: number, camera: THREE.PerspectiveCamera): PlayerControllerState => {
    const currentShipState = shipController.getState();

    if (deltaTime <= 0) {
      return currentShipState;
    }

    const aimWorldY = currentShipState.position.y + aimPointerNdc.y * RETICLE_VERTICAL_RANGE;
    movementPlane.constant = -aimWorldY;

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

    const keyboardForwardInput = (pressedKeys.has("w") ? 1 : 0) - (pressedKeys.has("s") ? 1 : 0);
    const keyboardStrafeInput = (pressedKeys.has("d") ? 1 : 0) - (pressedKeys.has("a") ? 1 : 0);
    const keyboardTurnInput = (pressedKeys.has("q") ? 1 : 0) - (pressedKeys.has("e") ? 1 : 0);

    const gamepad = getConnectedGamepad();
    let gamepadForwardInput = 0;
    let gamepadStrafeInput = 0;
    let gamepadHasSideInput = false;
    let gamepadHasMovementInput = false;
    let gamepadHasLookInput = false;
    let gamepadFireHeld = false;

    if (gamepad) {
      const leftX = applyDeadzone(gamepad.axes[GAMEPAD_AXIS_LEFT_X] ?? 0, GAMEPAD_AXIS_DEADZONE);
      const leftY = applyDeadzone(gamepad.axes[GAMEPAD_AXIS_LEFT_Y] ?? 0, GAMEPAD_AXIS_DEADZONE);
      gamepadStrafeInput = leftX;
      gamepadForwardInput = -leftY;
      gamepadHasSideInput = Math.abs(leftX) > 0.0001;
      gamepadHasMovementInput = Math.abs(leftX) > 0.0001 || Math.abs(leftY) > 0.0001;

      const rightX = applyDeadzone(gamepad.axes[GAMEPAD_AXIS_RIGHT_X] ?? 0, GAMEPAD_AXIS_DEADZONE);
      const rightY = applyDeadzone(gamepad.axes[GAMEPAD_AXIS_RIGHT_Y] ?? 0, GAMEPAD_AXIS_DEADZONE);
      if (Math.abs(rightX) > 0.0001 || Math.abs(rightY) > 0.0001) {
        aimPointerNdc.x += rightX * GAMEPAD_LOOK_SPEED_NDC_PER_SECOND * deltaTime;
        aimPointerNdc.y -= rightY * GAMEPAD_LOOK_SPEED_NDC_PER_SECOND * deltaTime;
        clampAimPointerToViewportMargin(aimPointerNdc);
        gamepadHasLookInput = true;
      }

      gamepadFireHeld = gamepad.buttons[GAMEPAD_PRIMARY_FIRE_BUTTON_INDEX]?.pressed === true;
    }

    const controllerActive = Boolean(
      gamepad && (gamepadHasMovementInput || gamepadHasLookInput || gamepadFireHeld)
    );
    if (controllerActive) {
      toAim.subVectors(inputAimReticle.position, currentShipState.position).setY(0);
      if (!gamepadHasSideInput) {
        shipRight
          .set(-currentShipState.forward.z, 0, currentShipState.forward.x)
          .normalize();
        const lateralOffset = toAim.dot(shipRight);
        const absLateralOffset = Math.abs(lateralOffset);
        if (absLateralOffset <= GAMEPAD_STRAFE_RECENTER_DEADZONE_UNITS) {
          gamepadStrafeInput = 0;
        } else {
          const recenterRatio = THREE.MathUtils.clamp(
            (absLateralOffset - GAMEPAD_STRAFE_RECENTER_DEADZONE_UNITS) /
              Math.max(
                0.001,
                GAMEPAD_STRAFE_RECENTER_FULL_INPUT_UNITS - GAMEPAD_STRAFE_RECENTER_DEADZONE_UNITS
              ),
            0,
            1
          );
          gamepadStrafeInput = Math.sign(lateralOffset) * recenterRatio;
        }
      }
    }

    const forwardInput = THREE.MathUtils.clamp(
      keyboardForwardInput + gamepadForwardInput,
      -1,
      1
    );
    const strafeInput = THREE.MathUtils.clamp(
      keyboardStrafeInput + gamepadStrafeInput,
      -1,
      1
    );

    let turnInput = keyboardTurnInput;
    if (controllerActive) {
      if (gamepadHasSideInput) {
        turnInput = keyboardTurnInput;
      } else if (toAim.lengthSq() > 0.0001) {
        const targetYaw = -Math.atan2(toAim.x, -toAim.z);
        const headingError = shortestAngleDelta(currentShipState.yaw, targetYaw);
        if (Math.abs(headingError) <= GAMEPAD_TURN_DEADZONE_RADIANS) {
          turnInput = 0;
        } else {
          turnInput = THREE.MathUtils.clamp(
            headingError / GAMEPAD_TURN_FULL_INPUT_RADIANS,
            -1,
            1
          );
        }
      } else {
        turnInput = 0;
      }
    }

    const updatedShipState = shipController.update(deltaTime, {
      aimTarget: inputAimReticle.position,
      forwardInput,
      strafeInput,
      turnInput
    });

    const updatedAimWorldY = updatedShipState.position.y + aimPointerNdc.y * RETICLE_VERTICAL_RANGE;
    movementPlane.constant = -updatedAimWorldY;

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
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    canvas.removeEventListener("pointermove", onPointerMove);
  };

  return { update, dispose };
}

function getConnectedGamepad(): Gamepad | null {
  const gamepads = navigator.getGamepads?.();
  if (!gamepads) {
    return null;
  }

  for (const gamepad of gamepads) {
    if (gamepad?.connected) {
      return gamepad;
    }
  }

  return null;
}

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) <= deadzone) {
    return 0;
  }

  const normalized = (Math.abs(value) - deadzone) / (1 - deadzone);
  return Math.sign(value) * THREE.MathUtils.clamp(normalized, 0, 1);
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}

function clampAimPointerToViewportMargin(pointerNdc: THREE.Vector2): void {
  const minX = -1 + RETICLE_VIEWPORT_EDGE_MARGIN_NDC;
  const maxX = 1 - RETICLE_VIEWPORT_EDGE_MARGIN_NDC;
  const minY = -1 + RETICLE_VIEWPORT_BOTTOM_EDGE_MARGIN_NDC;
  const maxY = 1 - RETICLE_VIEWPORT_TOP_EDGE_MARGIN_NDC;
  pointerNdc.x = THREE.MathUtils.clamp(pointerNdc.x, minX, maxX);
  pointerNdc.y = THREE.MathUtils.clamp(pointerNdc.y, minY, maxY);
}
