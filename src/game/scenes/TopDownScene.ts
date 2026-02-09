import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import playerModelUrl from "../../assets/models/SpaceShip V2.glb?url";
import { GAME_CONFIG } from "../config";

const PLAYER_TOP_SPEED = 6;
const PLAYER_TOP_MANEUVERING_SPEED = PLAYER_TOP_SPEED * 0.5;
const PLAYER_ACCELERATION = 11.5;
const PLAYER_DECELERATION = 4.2;
const PLAYER_STRAFE_ACCELERATION = 22;
const PLAYER_STRAFE_DECELERATION = 16;
const PLAYER_IDLE_FORWARD_SPEED = PLAYER_TOP_SPEED * 0.2;
const PLAYER_MODEL_YAW_OFFSET = Math.PI * 0.5;
// const PLAYER_MAX_YAW_OFFSET = THREE.MathUtils.degToRad(30);
const PLAYER_YAW_FOLLOW_SPEED = THREE.MathUtils.degToRad(65);
const GRID_TILE_SIZE = 22;
const GRID_DIVISIONS = 22;
const GRID_LINE_THICKNESS = 0.06;
const GRID_TILE_RADIUS = 1;

const CAMERA_POSITION_FOLLOW_SHARPNESS = 7.5;
const CAMERA_LOOK_FOLLOW_SHARPNESS = 8.5;
const CAMERA_LOOK_AHEAD_DISTANCE = 2.2;
const RETICLE_HEIGHT = 0.03;
const RETICLE_VERTICAL_RANGE = 1.2;
const RETICLE_MAX_DISTANCE_FROM_SHIP = 8;
const RETICLE_TRACK_SHARPNESS = 18;
const RETICLE_RECENTER_SHARPNESS = 1.6;
const RETICLE_RECENTER_DELAY = 3;
const POINTER_CENTERLINE_REALIGN_SHARPNESS = 1.35;
const POINTER_CENTERLINE_SNAP_THRESHOLD = 0.08;
const RETICLE_MERGE_START_DISTANCE = 0.7;
const RETICLE_MERGE_FULL_DISTANCE = 0.18;

const MOVEMENT_KEYS = new Set(["w", "a", "s", "d"]);

export type TopDownSceneController = {
  update: (deltaTime: number) => void;
  dispose: () => void;
};

export function setupTopDownScene(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
): TopDownSceneController {
  scene.fog = new THREE.Fog(0x0b1420, 14, 28);

  const hemi = new THREE.HemisphereLight(0xb6cfff, 0x2a2d21, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffefc9, 1.2);
  sun.position.set(6, 10, 2);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(
      GRID_TILE_SIZE * (GRID_TILE_RADIUS * 2 + 2),
      GRID_TILE_SIZE * (GRID_TILE_RADIUS * 2 + 2),
      1,
      1
    ),
    new THREE.MeshStandardMaterial({ color: 0x0a2b64, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  scene.add(floor);

  const gridRoot = createInfiniteGrid(
    GRID_TILE_SIZE,
    GRID_DIVISIONS,
    0x38bfff,
    GRID_LINE_THICKNESS,
    GRID_TILE_RADIUS
  );
  gridRoot.position.y = -0.96;
  scene.add(gridRoot);

  const playerRoot = new THREE.Group();
  scene.add(playerRoot);

  const playerKeyLight = new THREE.PointLight(0x86d9ff, 1.8, 9, 2);
  playerKeyLight.position.set(0, 2.8, 1.5);
  playerRoot.add(playerKeyLight);

  const playerRimLight = new THREE.PointLight(0x2d8fff, 1.5, 7, 2);
  playerRimLight.position.set(-1.2, 1.4, -1.3);
  playerRoot.add(playerRimLight);

  const trueAimReticle = createTrueAimReticle();
  trueAimReticle.position.set(0, RETICLE_HEIGHT, -RETICLE_MAX_DISTANCE_FROM_SHIP);
  scene.add(trueAimReticle);

  const inputAimReticle = createInputAimReticle();
  inputAimReticle.position.set(0, RETICLE_HEIGHT, 0);
  scene.add(inputAimReticle);

  const loader = new GLTFLoader();
  loader.load(
    playerModelUrl,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.y = PLAYER_MODEL_YAW_OFFSET;

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z) || 1;
      const uniformScale = 1.8 / maxDimension;
      model.scale.setScalar(uniformScale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= scaledBox.min.y;
      tunePlayerMaterials(model);
      playerRoot.add(model);
    },
    undefined,
    (error) => {
      console.error("Failed to load player model:", error);
    }
  );

  const pressedKeys = new Set<string>();
  const pointerNdc = new THREE.Vector2(0, 0);
  const aimPointerNdc = new THREE.Vector2(0, 0);
  const localVelocity = new THREE.Vector2(0, PLAYER_IDLE_FORWARD_SPEED);
  const worldVelocity = new THREE.Vector3();
  const mouseWorld = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const cameraForward = new THREE.Vector3(0, 0, -1);
  const movementQuaternion = new THREE.Quaternion();
  const desiredCameraPosition = new THREE.Vector3();
  const desiredLookPoint = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  const inputAimTarget = new THREE.Vector3();
  const trueAimTarget = new THREE.Vector3();
  const trueAimProbe = new THREE.Vector3();
  const projectedTrueAimProbeNdc = new THREE.Vector3();
  const trueAimNdc = new THREE.Vector2();
  const lastMouseWorld = new THREE.Vector3();
  const cameraUpOffset = new THREE.Vector3(0, GAME_CONFIG.cameraHeight, 0);

  const raycaster = new THREE.Raycaster();
  const movementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let playerYaw = 0;
  let timeSincePointerMove = Number.POSITIVE_INFINITY;
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
    timeSincePointerMove = 0;
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

  desiredLookPoint.set(0, 0.35, -CAMERA_LOOK_AHEAD_DISTANCE);
  lookPoint.copy(desiredLookPoint);
  camera.position.set(0, GAME_CONFIG.cameraHeight, GAME_CONFIG.cameraDistance);
  camera.lookAt(lookPoint);

  const update = (deltaTime: number): void => {
    if (deltaTime <= 0) {
      return;
    }
    timeSincePointerMove += deltaTime;

    const isPointerActive = timeSincePointerMove <= RETICLE_RECENTER_DELAY;

    if (!isPointerActive) {
      const aimRealignBlend = 1 - Math.exp(-POINTER_CENTERLINE_REALIGN_SHARPNESS * deltaTime);
      aimPointerNdc.x = THREE.MathUtils.lerp(aimPointerNdc.x, 0, aimRealignBlend);
    }
    if (Math.abs(aimPointerNdc.x) <= POINTER_CENTERLINE_SNAP_THRESHOLD) {
      aimPointerNdc.x = 0;
    }
    const aimWorldY = playerRoot.position.y + aimPointerNdc.y * RETICLE_VERTICAL_RANGE;

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
      inputAimTarget.set(playerRoot.position.x, aimWorldY, playerRoot.position.z);
    }

    inputAimReticle.position.copy(inputAimTarget);
    inputAimReticle.visible = true;

    const toReticleX = inputAimReticle.position.x - playerRoot.position.x;
    const toReticleZ = inputAimReticle.position.z - playerRoot.position.z;
    if (toReticleX * toReticleX + toReticleZ * toReticleZ > 0.0001) {
      // const targetYaw = THREE.MathUtils.clamp(
      //   -Math.atan2(toReticleX, -toReticleZ),
      //   -PLAYER_MAX_YAW_OFFSET,
      //   PLAYER_MAX_YAW_OFFSET
      // );
      const targetYaw = -Math.atan2(toReticleX, -toReticleZ);
      const yawDelta = shortestAngleDelta(playerYaw, targetYaw);
      const maxYawStep = PLAYER_YAW_FOLLOW_SPEED * deltaTime;
      playerYaw += THREE.MathUtils.clamp(yawDelta, -maxYawStep, maxYawStep);
    }

    playerRoot.rotation.y = playerYaw;
    playerRoot.getWorldQuaternion(movementQuaternion);
    forward.set(0, 0, -1).applyQuaternion(movementQuaternion).setY(0).normalize();
    right.copy(forward).cross(up).normalize();
    cameraForward.set(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
    trueAimProbe.copy(playerRoot.position).addScaledVector(forward, RETICLE_MAX_DISTANCE_FROM_SHIP);
    projectedTrueAimProbeNdc.copy(trueAimProbe).project(camera);
    trueAimNdc.set(projectedTrueAimProbeNdc.x, aimPointerNdc.y);
    raycaster.setFromCamera(trueAimNdc, camera);
    const trueAimHit = raycaster.ray.intersectPlane(movementPlane, trueAimTarget);
    if (!trueAimHit) {
      trueAimTarget.copy(trueAimProbe);
    }
    trueAimTarget.y = aimWorldY;
    trueAimReticle.position.copy(trueAimTarget);
    trueAimReticle.rotation.y = playerYaw;
    trueAimReticle.visible = true;
    inputAimReticle.rotation.y = playerYaw;

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

    const forwardInput = (pressedKeys.has("w") ? 1 : 0) - (pressedKeys.has("s") ? 1 : 0);
    const strafeInput = (pressedKeys.has("d") ? 1 : 0) - (pressedKeys.has("a") ? 1 : 0);

    const targetSideVelocity = strafeInput * PLAYER_TOP_MANEUVERING_SPEED;
    const targetForwardVelocity =
      forwardInput < 0
        ? -PLAYER_TOP_MANEUVERING_SPEED
        : forwardInput > 0
          ? PLAYER_TOP_SPEED
          : PLAYER_IDLE_FORWARD_SPEED;

    localVelocity.x = approachVelocityAxis(
      localVelocity.x,
      targetSideVelocity,
      deltaTime,
      PLAYER_STRAFE_ACCELERATION,
      PLAYER_STRAFE_DECELERATION
    );
    localVelocity.y = approachVelocityAxis(localVelocity.y, targetForwardVelocity, deltaTime);

    localVelocity.x = THREE.MathUtils.clamp(
      localVelocity.x,
      -PLAYER_TOP_MANEUVERING_SPEED,
      PLAYER_TOP_MANEUVERING_SPEED
    );
    localVelocity.y = THREE.MathUtils.clamp(
      localVelocity.y,
      -PLAYER_TOP_MANEUVERING_SPEED,
      PLAYER_TOP_SPEED
    );

    worldVelocity.copy(right).multiplyScalar(localVelocity.x);
    worldVelocity.addScaledVector(forward, localVelocity.y);

    const topSpeedSq = PLAYER_TOP_SPEED * PLAYER_TOP_SPEED;
    if (worldVelocity.lengthSq() > topSpeedSq) {
      worldVelocity.setLength(PLAYER_TOP_SPEED);
    }

    playerRoot.position.addScaledVector(worldVelocity, deltaTime);

    floor.position.x = playerRoot.position.x;
    floor.position.z = playerRoot.position.z;
    gridRoot.position.x = snapToGrid(playerRoot.position.x, GRID_TILE_SIZE);
    gridRoot.position.z = snapToGrid(playerRoot.position.z, GRID_TILE_SIZE);

    desiredCameraPosition.copy(playerRoot.position);
    desiredCameraPosition.addScaledVector(cameraForward, -GAME_CONFIG.cameraDistance);
    desiredCameraPosition.add(cameraUpOffset);

    const cameraPositionBlend = 1 - Math.exp(-CAMERA_POSITION_FOLLOW_SHARPNESS * deltaTime);
    camera.position.lerp(desiredCameraPosition, cameraPositionBlend);

    desiredLookPoint.copy(playerRoot.position);
    desiredLookPoint.addScaledVector(cameraForward, CAMERA_LOOK_AHEAD_DISTANCE);
    desiredLookPoint.y = 0.35;

    const cameraLookBlend = 1 - Math.exp(-CAMERA_LOOK_FOLLOW_SHARPNESS * deltaTime);
    lookPoint.lerp(desiredLookPoint, cameraLookBlend);
    camera.lookAt(lookPoint);
  };

  const dispose = (): void => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("pointermove", onPointerMove);
  };

  return { update, dispose };
}

function tunePlayerMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        tuneMaterial(material);
      }
      return;
    }

    tuneMaterial(node.material);
  });
}

function tuneMaterial(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    return;
  }

  const emissiveBlue = new THREE.Color(0x2aa3ff);
  material.emissive = material.emissive.clone().lerp(emissiveBlue, 0.55);
  material.emissiveIntensity = 0.42;
  material.roughness = Math.min(material.roughness, 0.65);
  material.metalness = Math.max(material.metalness, 0.2);
}

function createThickGrid(
  size: number,
  divisions: number,
  gridColor: number,
  lineThickness: number
): THREE.Group {
  const grid = new THREE.Group();
  const halfSize = size / 2;
  const step = size / divisions;
  const lineHeight = 0.02;
  const uniformThickness = lineThickness * 1.35;

  const gridMaterial = new THREE.MeshBasicMaterial({ color: gridColor, toneMapped: false });

  for (let i = 0; i <= divisions; i += 1) {
    const offset = -halfSize + i * step;

    const xLine = new THREE.Mesh(
      new THREE.BoxGeometry(size, lineHeight, uniformThickness),
      gridMaterial
    );
    xLine.position.set(0, 0, offset);
    grid.add(xLine);

    const zLine = new THREE.Mesh(
      new THREE.BoxGeometry(uniformThickness, lineHeight, size),
      gridMaterial
    );
    zLine.position.set(offset, 0, 0);
    grid.add(zLine);
  }

  return grid;
}

function createInfiniteGrid(
  tileSize: number,
  divisions: number,
  gridColor: number,
  lineThickness: number,
  tileRadius: number
): THREE.Group {
  const root = new THREE.Group();

  for (let z = -tileRadius; z <= tileRadius; z += 1) {
    for (let x = -tileRadius; x <= tileRadius; x += 1) {
      const tile = createThickGrid(tileSize, divisions, gridColor, lineThickness);
      tile.position.set(x * tileSize, 0, z * tileSize);
      root.add(tile);
    }
  }

  return root;
}

function createTrueAimReticle(): THREE.Group {
  const reticle = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0x7ce0ff,
    transparent: true,
    opacity: 0.95,
    toneMapped: false
  });

  const armLength = 0.11;
  const armThickness = 0.02;
  const centerGap = 0.045;

  const north = new THREE.Mesh(new THREE.BoxGeometry(armThickness, 0.002, armLength), material);
  north.position.set(0, 0.001, -(centerGap + armLength * 0.5));
  reticle.add(north);

  const south = new THREE.Mesh(new THREE.BoxGeometry(armThickness, 0.002, armLength), material);
  south.position.set(0, 0.001, centerGap + armLength * 0.5);
  reticle.add(south);

  const east = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.002, armThickness), material);
  east.position.set(centerGap + armLength * 0.5, 0.001, 0);
  reticle.add(east);

  const west = new THREE.Mesh(new THREE.BoxGeometry(armLength, 0.002, armThickness), material);
  west.position.set(-(centerGap + armLength * 0.5), 0.001, 0);
  reticle.add(west);

  const centerDot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), material);
  centerDot.rotation.x = -Math.PI / 2;
  centerDot.position.y = 0.0015;
  reticle.add(centerDot);

  return reticle;
}

function createInputAimReticle(): THREE.Group {
  const reticle = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ce0ff,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const markMaterial = new THREE.MeshBasicMaterial({
    color: 0x9feaff,
    transparent: true,
    opacity: 0.9,
    toneMapped: false
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.295, 48), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  reticle.add(ring);

  const markLength = 0.12;
  const markThickness = 0.015;
  const markRadius = 0.37;

  const north = new THREE.Mesh(
    new THREE.BoxGeometry(markThickness, 0.002, markLength),
    markMaterial
  );
  north.position.set(0, 0.001, -markRadius);
  reticle.add(north);

  const south = new THREE.Mesh(
    new THREE.BoxGeometry(markThickness, 0.002, markLength),
    markMaterial
  );
  south.position.set(0, 0.001, markRadius);
  reticle.add(south);

  const east = new THREE.Mesh(new THREE.BoxGeometry(markLength, 0.002, markThickness), markMaterial);
  east.position.set(markRadius, 0.001, 0);
  reticle.add(east);

  const west = new THREE.Mesh(new THREE.BoxGeometry(markLength, 0.002, markThickness), markMaterial);
  west.position.set(-markRadius, 0.001, 0);
  reticle.add(west);

  return reticle;
}

function approachVelocityAxis(
  current: number,
  target: number,
  deltaTime: number,
  acceleration = PLAYER_ACCELERATION,
  deceleration = PLAYER_DECELERATION
): number {
  if (current !== 0 && target !== 0 && Math.sign(current) !== Math.sign(target)) {
    return moveTowards(current, 0, deceleration * deltaTime);
  }

  const rate = Math.abs(target) > Math.abs(current) ? acceleration : deceleration;
  return moveTowards(current, target, rate * deltaTime);
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }

  return current + Math.sign(target - current) * maxDelta;
}

function snapToGrid(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function shortestAngleDelta(current: number, target: number): number {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}
