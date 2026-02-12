import * as THREE from "three";

type EnvironmentParams = {
  gridTileSize: number;
  gridDivisions: number;
  gridLineThickness: number;
  gridTileRadius: number;
  gridY: number;
  floorY: number;
};

export type EnvironmentObjects = {
  floor: THREE.Mesh;
  gridRoot: THREE.Group;
};

export function createEnvironment(
  scene: THREE.Scene,
  {
    gridTileSize,
    gridDivisions,
    gridLineThickness,
    gridTileRadius,
    gridY,
    floorY
  }: EnvironmentParams
): EnvironmentObjects {
  scene.fog = new THREE.Fog(0x0b1420, 14, 28);

  const hemi = new THREE.HemisphereLight(0xb6cfff, 0x2a2d21, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffefc9, 1.35);
  sun.position.set(6, 10, 2);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(
      gridTileSize * (gridTileRadius * 2 + 2),
      gridTileSize * (gridTileRadius * 2 + 2),
      1,
      1
    ),
    new THREE.MeshStandardMaterial({
      color: 0x0a2b64,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = floorY;
  scene.add(floor);

  const gridRoot = createInfiniteGrid(
    gridTileSize,
    gridDivisions,
    0x38bfff,
    gridLineThickness,
    gridTileRadius
  );
  gridRoot.position.y = gridY;
  scene.add(gridRoot);

  return { floor, gridRoot };
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
