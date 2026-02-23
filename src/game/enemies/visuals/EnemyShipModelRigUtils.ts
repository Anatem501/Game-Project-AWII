import * as THREE from "three";

export type SilhouetteOutlineShellOptions = {
  colorHex: number;
  opacity?: number;
  scaleMultiplier?: number;
  renderOrder?: number;
};

export type EnemyMissileCellSocketLocalOffset = {
  bayIndex: number;
  cellIndex: number;
  localOffset: THREE.Vector3;
};

export function normalizeModelToSize(modelRoot: THREE.Object3D, desiredSize: number): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension <= 0) {
    return;
  }
  modelRoot.scale.setScalar(desiredSize / maxDimension);
}

export function alignModelToGroundCentered(modelRoot: THREE.Object3D): void {
  const bounds = new THREE.Box3().setFromObject(modelRoot);
  const center = bounds.getCenter(new THREE.Vector3());
  modelRoot.position.x -= center.x;
  modelRoot.position.z -= center.z;
  modelRoot.position.y -= bounds.min.y;
}

export function createSilhouetteOutlineShell(
  modelRoot: THREE.Object3D,
  options: SilhouetteOutlineShellOptions
): THREE.Object3D | null {
  let meshCount = 0;
  const outlineRoot = modelRoot.clone(true);
  outlineRoot.name = `${modelRoot.name || "EnemyModel"}_OutlineShell`;
  outlineRoot.scale.multiplyScalar(Math.max(1.001, options.scaleMultiplier ?? 1.04));
  outlineRoot.renderOrder = options.renderOrder ?? 2;

  outlineRoot.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    meshCount += 1;
    node.castShadow = false;
    node.receiveShadow = false;
    node.renderOrder = options.renderOrder ?? 2;

    const createOutlineMaterial = () =>
      new THREE.MeshBasicMaterial({
        color: options.colorHex,
        transparent: true,
        opacity: THREE.MathUtils.clamp(options.opacity ?? 0.16, 0, 1),
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending
      });

    if (Array.isArray(node.material)) {
      node.material = node.material.map(() => createOutlineMaterial());
      return;
    }
    node.material = createOutlineMaterial();
  });

  return meshCount > 0 ? outlineRoot : null;
}

export function extractSocketLocalOffsets(
  relativeRoot: THREE.Object3D,
  model: THREE.Object3D,
  socketPrefix: string
): THREE.Vector3[] {
  const socketNodes = findSocketNodes(model, socketPrefix);
  const worldPosition = new THREE.Vector3();
  return socketNodes.map((socketNode) => {
    socketNode.getWorldPosition(worldPosition);
    return relativeRoot.worldToLocal(worldPosition.clone());
  });
}

export function extractSocketSizeScales(model: THREE.Object3D, socketPrefix: string): number[] {
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

export function extractMissileCellSocketLocalOffsets(
  relativeRoot: THREE.Object3D,
  model: THREE.Object3D
): EnemyMissileCellSocketLocalOffset[] {
  const socketNodes = findMissileCellSocketNodes(model);
  const worldPosition = new THREE.Vector3();
  return socketNodes.map((socketNode) => {
    socketNode.node.getWorldPosition(worldPosition);
    return {
      bayIndex: socketNode.bayIndex,
      cellIndex: socketNode.cellIndex,
      localOffset: relativeRoot.worldToLocal(worldPosition.clone())
    };
  });
}

export function disposeObject3DMeshResources(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    if (!disposedGeometries.has(node.geometry)) {
      node.geometry.dispose();
      disposedGeometries.add(node.geometry);
    }

    if (Array.isArray(node.material)) {
      for (const material of node.material) {
        if (disposedMaterials.has(material)) {
          continue;
        }
        material.dispose();
        disposedMaterials.add(material);
      }
      return;
    }

    if (!disposedMaterials.has(node.material)) {
      node.material.dispose();
      disposedMaterials.add(node.material);
    }
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

function findMissileCellSocketNodes(
  model: THREE.Object3D
): Array<{ bayIndex: number; cellIndex: number; node: THREE.Object3D }> {
  const matched: Array<{ bayIndex: number; cellIndex: number; node: THREE.Object3D }> = [];
  model.traverse((node) => {
    const parsed = parseMissileCellSocketName(node.name);
    if (!parsed) {
      return;
    }
    matched.push({ bayIndex: parsed.bayIndex, cellIndex: parsed.cellIndex, node });
  });

  matched.sort((a, b) => {
    if (a.bayIndex !== b.bayIndex) {
      return a.bayIndex - b.bayIndex;
    }
    if (a.cellIndex !== b.cellIndex) {
      return a.cellIndex - b.cellIndex;
    }
    return a.node.name.localeCompare(b.node.name);
  });
  return matched;
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

function parseMissileCellSocketName(
  name: string
): { bayIndex: number; cellIndex: number } | null {
  const compactName = name.replace(/\s+/g, "").replace(/\.\d+$/, "");

  const bayCellMatch = compactName.match(
    /^Missile(?:[_-])?Bay(?:[_-])?(\d+)(?:[_-])?Cell(?:[_-])?(\d+)$/i
  );
  if (bayCellMatch) {
    const bayIndex = Number.parseInt(bayCellMatch[1], 10);
    const cellIndex = Number.parseInt(bayCellMatch[2], 10);
    if (Number.isFinite(bayIndex) && Number.isFinite(cellIndex)) {
      return { bayIndex, cellIndex };
    }
  }

  const cellOnlyMatch = compactName.match(/^Missile(?:[_-])?Cell(?:[_-])?(\d+)$/i);
  if (cellOnlyMatch) {
    const cellIndex = Number.parseInt(cellOnlyMatch[1], 10);
    if (Number.isFinite(cellIndex)) {
      return { bayIndex: 1, cellIndex };
    }
  }

  const missileOnlyMatch = compactName.match(/^Missile(?:[_-])?(\d+)$/i);
  if (missileOnlyMatch) {
    const cellIndex = Number.parseInt(missileOnlyMatch[1], 10);
    if (Number.isFinite(cellIndex)) {
      return { bayIndex: 1, cellIndex };
    }
  }

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
