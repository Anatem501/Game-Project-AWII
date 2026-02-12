import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type PlayerRigParams = {
  modelUrl: string;
  modelYawOffset: number;
  gunHardpointLocalOffsets?: readonly THREE.Vector3[];
  autoAlignGunHardpointsToModel?: boolean;
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
    gunHardpointLocalOffsets,
    autoAlignGunHardpointsToModel
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
    shouldAutoAlignGunHardpoints
  );

  return { gunHardpoints, playerRoot };
}

export const createShipRig = createPlayerRig;

function loadPlayerModel(
  playerRoot: THREE.Group,
  gunHardpoints: readonly THREE.Object3D[],
  modelUrl: string,
  modelYawOffset: number,
  autoAlignGunHardpointsToModel: boolean
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
      const uniformScale = 1.8 / maxDimension;
      model.scale.setScalar(uniformScale);

      const scaledBox = new THREE.Box3().setFromObject(model);
      const center = scaledBox.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= scaledBox.min.y;
      tunePlayerMaterials(model);
      playerRoot.add(model);

      if (autoAlignGunHardpointsToModel) {
        alignGunHardpointsToModel(playerRoot, gunHardpoints, model);
      }
    },
    undefined,
    (error) => {
      console.error("Failed to load player model:", error);
    }
  );
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
