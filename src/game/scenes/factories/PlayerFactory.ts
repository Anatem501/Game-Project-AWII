import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type PlayerRigParams = {
  modelUrl: string;
  modelYawOffset: number;
  modelSizeMultiplier?: number;
  modelLocalOffset?: THREE.Vector3;
  gunHardpointLocalOffsets?: readonly THREE.Vector3[];
  autoAlignGunHardpointsToModel?: boolean;
  onThrusterSocketsResolved?: (thrusterLocalOffsets: THREE.Vector3[], thrusterSizeScales: number[]) => void;
};

export type PlayerRig = {
  gunHardpoints: THREE.Object3D[];
  playerRoot: THREE.Group;
};

export type ShipRigParams = PlayerRigParams;
export type ShipRig = PlayerRig;

const DEFAULT_GUN_HARDPOINT_LOCAL_OFFSETS: readonly THREE.Vector3[] = [
  new THREE.Vector3(-0.8, 0.24, -2.1),
  new THREE.Vector3(0.8, 0.24, -2.1)
];

export function createPlayerRig(
  scene: THREE.Scene,
  {
    modelUrl,
    modelYawOffset,
    modelSizeMultiplier,
    modelLocalOffset,
    gunHardpointLocalOffsets,
    autoAlignGunHardpointsToModel,
    onThrusterSocketsResolved
  }: PlayerRigParams
): PlayerRig {
  const playerRoot = new THREE.Group();
  scene.add(playerRoot);

  const hardpointOffsets = gunHardpointLocalOffsets ?? DEFAULT_GUN_HARDPOINT_LOCAL_OFFSETS;
  const gunHardpoints = createGunHardpoints(playerRoot, hardpointOffsets);
  const shouldAutoAlignGunHardpoints =
    autoAlignGunHardpointsToModel ?? gunHardpointLocalOffsets === undefined;

  const playerKeyLight = new THREE.PointLight(0x86d9ff, 1.8, 9, 2);
  playerKeyLight.position.set(0, 2.8, 1.5);
  playerRoot.add(playerKeyLight);

  const playerRimLight = new THREE.PointLight(0x2d8fff, 1.5, 7, 2);
  playerRimLight.position.set(-1.2, 1.4, -1.3);
  playerRoot.add(playerRimLight);

  loadPlayerModel(
    playerRoot,
    gunHardpoints,
    modelUrl,
    modelYawOffset,
    modelSizeMultiplier,
    modelLocalOffset,
    shouldAutoAlignGunHardpoints,
    onThrusterSocketsResolved
  );

  return { gunHardpoints, playerRoot };
}

export const createShipRig = createPlayerRig;

function loadPlayerModel(
  playerRoot: THREE.Group,
  gunHardpoints: readonly THREE.Object3D[],
  modelUrl: string,
  modelYawOffset: number,
  modelSizeMultiplier: number | undefined,
  modelLocalOffset: THREE.Vector3 | undefined,
  autoAlignGunHardpointsToModel: boolean,
  onThrusterSocketsResolved:
    | ((thrusterLocalOffsets: THREE.Vector3[], thrusterSizeScales: number[]) => void)
    | undefined
): void {
  const loader = new GLTFLoader();
  loader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;
      model.rotation.y = modelYawOffset;

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z) || 1;
      const shipScaleMultiplier = Math.max(0.05, modelSizeMultiplier ?? 1);
      const uniformScale = (1.8 / maxDimension) * shipScaleMultiplier;
      model.scale.setScalar(uniformScale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= scaledBox.min.y;
      if (modelLocalOffset) {
        model.position.add(modelLocalOffset);
      }
      tunePlayerMaterials(model);
      playerRoot.add(model);

      const cannonSocketOffsets = extractSocketLocalOffsets(playerRoot, model, "cannon");
      if (cannonSocketOffsets.length > 0) {
        applySocketOffsetsToHardpoints(gunHardpoints, cannonSocketOffsets);
      } else if (autoAlignGunHardpointsToModel) {
        alignGunHardpointsToModel(playerRoot, gunHardpoints, model);
      }

      const thrusterSocketOffsets = extractSocketLocalOffsets(playerRoot, model, "thruster");
      const thrusterSocketSizeScales = extractSocketSizeScales(model, "thruster");
      onThrusterSocketsResolved?.(thrusterSocketOffsets, thrusterSocketSizeScales);
    },
    undefined,
    (error) => {
      console.error("Failed to load player model:", error);
    }
  );
}

function applySocketOffsetsToHardpoints(
  gunHardpoints: readonly THREE.Object3D[],
  socketOffsets: readonly THREE.Vector3[]
): void {
  const count = Math.min(gunHardpoints.length, socketOffsets.length);
  for (let i = 0; i < count; i += 1) {
    gunHardpoints[i].position.copy(socketOffsets[i]);
  }
}

function createGunHardpoints(
  playerRoot: THREE.Group,
  localOffsets: readonly THREE.Vector3[]
): THREE.Object3D[] {
  return localOffsets.map((offset) => {
    const hardpoint = new THREE.Object3D();
    hardpoint.position.copy(offset);
    playerRoot.add(hardpoint);
    return hardpoint;
  });
}

function alignGunHardpointsToModel(
  playerRoot: THREE.Group,
  gunHardpoints: readonly THREE.Object3D[],
  model: THREE.Object3D
): void {
  if (gunHardpoints.length === 0) {
    return;
  }

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const gunY = box.min.y + size.y * 0.57;
  const gunZ = box.min.z + size.z * 0.64;

  for (let i = 0; i < gunHardpoints.length; i += 1) {
    const horizontalBlend = gunHardpoints.length === 1 ? 0 : i / (gunHardpoints.length - 1);
    const normalizedX = horizontalBlend * 2 - 1;
    const gunX = center.x + normalizedX * size.x * 0.5;

    const worldPosition = new THREE.Vector3(gunX, gunY, gunZ);
    playerRoot.worldToLocal(worldPosition);
    gunHardpoints[i].position.copy(worldPosition);
  }
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

  material.emissiveIntensity = 0;
  material.roughness = Math.min(material.roughness, 0.65);
  material.metalness = Math.min(material.metalness, 0.1);
}

function extractSocketLocalOffsets(
  playerRoot: THREE.Object3D,
  model: THREE.Object3D,
  socketPrefix: string
): THREE.Vector3[] {
  const socketNodes = findSocketNodes(model, socketPrefix);
  const worldPosition = new THREE.Vector3();
  return socketNodes.map((socketNode) => {
    socketNode.getWorldPosition(worldPosition);
    return playerRoot.worldToLocal(worldPosition.clone());
  });
}

function extractSocketSizeScales(model: THREE.Object3D, socketPrefix: string): number[] {
  const socketNodes = findSocketNodes(model, socketPrefix);
  const modelWorldScale = new THREE.Vector3();
  model.getWorldScale(modelWorldScale);
  const modelAverageScale =
    (Math.abs(modelWorldScale.x) + Math.abs(modelWorldScale.y) + Math.abs(modelWorldScale.z)) / 3;
  const normalizedModelScale = Math.max(0.001, modelAverageScale);
  const worldScale = new THREE.Vector3();
  return socketNodes.map((socketNode) => {
    socketNode.getWorldScale(worldScale);
    const averageScale =
      (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;
    return Math.max(0.5, averageScale / normalizedModelScale);
  });
}

function findSocketNodes(model: THREE.Object3D, socketPrefix: string): THREE.Object3D[] {
  const matched: Array<{ index: number; node: THREE.Object3D }> = [];
  model.traverse((node) => {
    const socketIndex = parseSocketIndex(node.name, socketPrefix);
    if (socketIndex === null) {
      return;
    }
    matched.push({ index: socketIndex, node });
  });

  matched.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return a.node.name.localeCompare(b.node.name);
  });
  return matched.map((entry) => entry.node);
}

function parseSocketIndex(name: string, socketPrefix: string): number | null {
  const compactName = name.replace(/\s+/g, "");
  const escapedPrefix = escapeRegex(socketPrefix.trim());
  const pattern = new RegExp(`^${escapedPrefix}(?:[_-])?(\\d+)(?:\\.\\d+)?$`, "i");
  const match = compactName.match(pattern);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
