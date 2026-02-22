import * as THREE from "three";
import type { GameMapId } from "../../modes/GameMode";
import { snapToGrid } from "../utils/snapToGrid";

type EnvironmentParams = {
  mapId: GameMapId;
  gridTileSize: number;
  gridDivisions: number;
  gridLineThickness: number;
  gridTileRadius: number;
  gridY: number;
  floorY: number;
};

type EnvironmentUpdateState = {
  playerPosition: THREE.Vector3;
  cameraPosition: THREE.Vector3;
  playerVelocity: THREE.Vector3;
  playerSpeed01: number;
};

export type EnvironmentObjects = {
  update: (deltaTime: number, state: EnvironmentUpdateState) => void;
  dispose: () => void;
};

type ParallaxLayer = {
  root: THREE.Object3D;
  virtualDistance: number;
};

type AddToSceneFn = <T extends THREE.Object3D>(object: T) => T;
type TrackGeometryFn = <T extends THREE.BufferGeometry>(geometry: T) => T;
type TrackMaterialFn = <T extends THREE.Material>(material: T) => T;
type TrackTextureFn = <T extends THREE.Texture>(texture: T) => T;

export function createEnvironment(scene: THREE.Scene, params: EnvironmentParams): EnvironmentObjects {
  const ownedObjects: THREE.Object3D[] = [];
  const ownedGeometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const ownedTextures: THREE.Texture[] = [];

  const addToScene: AddToSceneFn = <T extends THREE.Object3D>(object: T): T => {
    scene.add(object);
    ownedObjects.push(object);
    return object;
  };

  const trackGeometry: TrackGeometryFn = <T extends THREE.BufferGeometry>(geometry: T): T => {
    ownedGeometries.push(geometry);
    return geometry;
  };

  const trackMaterial: TrackMaterialFn = <T extends THREE.Material>(material: T): T => {
    ownedMaterials.push(material);
    return material;
  };
  const trackTexture: TrackTextureFn = <T extends THREE.Texture>(texture: T): T => {
    ownedTextures.push(texture);
    return texture;
  };

  const dispose = (): void => {
    for (const object of ownedObjects) {
      object.removeFromParent();
    }
    for (const geometry of ownedGeometries) {
      geometry.dispose();
    }
    for (const material of ownedMaterials) {
      material.dispose();
    }
    for (const texture of ownedTextures) {
      texture.dispose();
    }
  };

  if (params.mapId === "rogue_pilot_map") {
    return createRoguePilotEnvironment(
      scene,
      params,
      addToScene,
      trackGeometry,
      trackMaterial,
      trackTexture,
      dispose
    );
  }

  return createTestMapEnvironment(scene, params, addToScene, trackGeometry, trackMaterial, dispose);
}

function createTestMapEnvironment(
  scene: THREE.Scene,
  params: EnvironmentParams,
  addToScene: AddToSceneFn,
  trackGeometry: TrackGeometryFn,
  trackMaterial: TrackMaterialFn,
  dispose: () => void
): EnvironmentObjects {
  scene.fog = new THREE.Fog(0x0b1420, 14, 28);

  addToScene(new THREE.HemisphereLight(0xb6cfff, 0x2a2d21, 1.05));

  const sun = addToScene(new THREE.DirectionalLight(0xffefc9, 1.35));
  sun.position.set(6, 10, 2);

  const floorGeometry = trackGeometry(
    new THREE.PlaneGeometry(
      params.gridTileSize * (params.gridTileRadius * 2 + 2),
      params.gridTileSize * (params.gridTileRadius * 2 + 2),
      1,
      1
    )
  );
  const floorMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x0a2b64,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0
    })
  );
  const floor = addToScene(new THREE.Mesh(floorGeometry, floorMaterial));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = params.floorY;

  const gridMaterial = trackMaterial(
    new THREE.MeshBasicMaterial({ color: 0x38bfff, toneMapped: false })
  );
  const gridRoot = createInfiniteGrid(
    params.gridTileSize,
    params.gridDivisions,
    params.gridLineThickness,
    params.gridTileRadius,
    gridMaterial
  );
  gridRoot.position.y = params.gridY;
  addToScene(gridRoot);

  return {
    update: (_deltaTime, state): void => {
      floor.position.x = state.playerPosition.x;
      floor.position.z = state.playerPosition.z;
      gridRoot.position.x = snapToGrid(state.playerPosition.x, params.gridTileSize);
      gridRoot.position.z = snapToGrid(state.playerPosition.z, params.gridTileSize);
    },
    dispose
  };
}

function createRoguePilotEnvironment(
  scene: THREE.Scene,
  params: EnvironmentParams,
  addToScene: AddToSceneFn,
  trackGeometry: TrackGeometryFn,
  trackMaterial: TrackMaterialFn,
  trackTexture: TrackTextureFn,
  dispose: () => void
): EnvironmentObjects {
  const PARALLAX_REFERENCE_DISTANCE = 20;
  const PARALLAX_SPEED_BLEND_SHARPNESS = 3;
  const PARALLAX_VELOCITY_BLEND_SHARPNESS = 4;
  const PARALLAX_MAX_VELOCITY_FOR_BOOST = 20;
  const PARALLAX_FOLLOW_SPEED_REDUCTION = 0.06;
  const PARALLAX_SPEED_TRAIL_SCALE = 0.12;

  scene.fog = null;

  addToScene(new THREE.HemisphereLight(0xc4dcff, 0x060c19, 0.64));

  const keyLight = addToScene(new THREE.DirectionalLight(0xa9cbff, 0.72));
  keyLight.position.set(-5, 9, -4);

  const fillLight = addToScene(new THREE.DirectionalLight(0xffd8b8, 0.35));
  fillLight.position.set(8, 4, 7);

  const floorGeometry = trackGeometry(
    new THREE.PlaneGeometry(
      params.gridTileSize * (params.gridTileRadius * 2 + 3),
      params.gridTileSize * (params.gridTileRadius * 2 + 3),
      1,
      1
    )
  );
  const floorMaterial = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: 0x03070f,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0
    })
  );
  const floor = addToScene(new THREE.Mesh(floorGeometry, floorMaterial));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = params.floorY;
  const starSpriteTexture = createSoftStarSpriteTexture(trackTexture);

  const parallaxLayers: ParallaxLayer[] = [
    createStarLayer(addToScene, trackGeometry, trackMaterial, {
      count: 1200,
      spread: 980,
      yMin: -130,
      yMax: -72,
      size: 0.24,
      opacity: 0.6,
      virtualDistance: 190,
      spriteTexture: starSpriteTexture
    }),
    createStarLayer(addToScene, trackGeometry, trackMaterial, {
      count: 900,
      spread: 560,
      yMin: -68,
      yMax: -10,
      size: 0.18,
      opacity: 0.95,
      virtualDistance: 130,
      spriteTexture: starSpriteTexture
    }),
    createStarLayer(addToScene, trackGeometry, trackMaterial, {
      count: 650,
      spread: 340,
      yMin: -44,
      yMax: -6,
      size: 0.23,
      opacity: 0.72,
      virtualDistance: 88,
      spriteTexture: starSpriteTexture
    }),
    createStarLayer(addToScene, trackGeometry, trackMaterial, {
      count: 380,
      spread: 220,
      yMin: -26,
      yMax: -2.5,
      size: 0.28,
      opacity: 0.56,
      virtualDistance: 52,
      spriteTexture: starSpriteTexture
    }),
    createDebrisLayer(addToScene, trackGeometry, trackMaterial, {
      count: 220,
      spread: 190,
      yMin: -5.2,
      yMax: -0.35,
      sizeMin: 0.2,
      sizeMax: 0.7,
      color: 0x6e7f97,
      virtualDistance: 34
    }),
    createDebrisLayer(addToScene, trackGeometry, trackMaterial, {
      count: 140,
      spread: 120,
      yMin: -4.4,
      yMax: -0.2,
      sizeMin: 0.35,
      sizeMax: 1.1,
      color: 0x8597ae,
      virtualDistance: 22
    })
  ];
  const smoothedVelocity = new THREE.Vector3();
  const cappedVelocity = new THREE.Vector3();
  let smoothedSpeed01 = 0;
  let hasMotionSample = false;

  return {
    update: (deltaTime, state): void => {
      floor.position.x = state.playerPosition.x;
      floor.position.z = state.playerPosition.z;
      const speed01 = THREE.MathUtils.clamp(state.playerSpeed01, 0, 1);
      if (!hasMotionSample) {
        smoothedSpeed01 = speed01;
        smoothedVelocity.copy(state.playerVelocity);
        hasMotionSample = true;
      } else {
        const safeDelta = Math.max(0, deltaTime);
        const speedBlend = 1 - Math.exp(-PARALLAX_SPEED_BLEND_SHARPNESS * safeDelta);
        const velocityBlend = 1 - Math.exp(-PARALLAX_VELOCITY_BLEND_SHARPNESS * safeDelta);
        smoothedSpeed01 = THREE.MathUtils.lerp(smoothedSpeed01, speed01, speedBlend);
        smoothedVelocity.lerp(state.playerVelocity, velocityBlend);
      }
      cappedVelocity.copy(smoothedVelocity).clampLength(0, PARALLAX_MAX_VELOCITY_FOR_BOOST);

      for (const layer of parallaxLayers) {
        const baseFollowFactor = resolveParallaxFollowFactor(
          layer.virtualDistance,
          PARALLAX_REFERENCE_DISTANCE
        );
        const depthProximity = 1 - baseFollowFactor;
        const followFactor = THREE.MathUtils.clamp(
          baseFollowFactor - depthProximity * smoothedSpeed01 * PARALLAX_FOLLOW_SPEED_REDUCTION,
          0.25,
          0.98
        );
        const speedTrail = depthProximity * smoothedSpeed01 * PARALLAX_SPEED_TRAIL_SCALE;
        layer.root.position.x =
          state.cameraPosition.x * followFactor - cappedVelocity.x * speedTrail;
        layer.root.position.z =
          state.cameraPosition.z * followFactor - cappedVelocity.z * speedTrail;
      }
    },
    dispose
  };
}

function createStarLayer(
  addToScene: AddToSceneFn,
  trackGeometry: TrackGeometryFn,
  trackMaterial: TrackMaterialFn,
  params: {
    count: number;
    spread: number;
    yMin: number;
    yMax: number;
    size: number;
    opacity: number;
    virtualDistance: number;
    spriteTexture: THREE.Texture;
  }
): ParallaxLayer {
  const positions = new Float32Array(params.count * 3);
  const colors = new Float32Array(params.count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < params.count; index += 1) {
    const base = index * 3;
    positions[base] = randomRange(-params.spread, params.spread);
    positions[base + 1] = randomRange(params.yMin, params.yMax);
    positions[base + 2] = randomRange(-params.spread, params.spread);

    color.setHSL(
      THREE.MathUtils.randFloat(0.54, 0.63),
      THREE.MathUtils.randFloat(0.18, 0.55),
      THREE.MathUtils.randFloat(0.72, 1.0)
    );
    colors[base] = color.r;
    colors[base + 1] = color.g;
    colors[base + 2] = color.b;
  }

  const geometry = trackGeometry(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = trackMaterial(
    new THREE.PointsMaterial({
      size: params.size,
      transparent: true,
      opacity: params.opacity,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      map: params.spriteTexture,
      alphaMap: params.spriteTexture,
      alphaTest: 0.03
    })
  );

  const stars = addToScene(new THREE.Points(geometry, material));
  stars.frustumCulled = false;

  return {
    root: stars,
    virtualDistance: params.virtualDistance
  };
}

function createDebrisLayer(
  addToScene: AddToSceneFn,
  trackGeometry: TrackGeometryFn,
  trackMaterial: TrackMaterialFn,
  params: {
    count: number;
    spread: number;
    yMin: number;
    yMax: number;
    sizeMin: number;
    sizeMax: number;
    color: number;
    virtualDistance: number;
  }
): ParallaxLayer {
  const geometry = trackGeometry(new THREE.IcosahedronGeometry(0.22, 0));
  const material = trackMaterial(
    new THREE.MeshStandardMaterial({
      color: params.color,
      roughness: 0.93,
      metalness: 0.06
    })
  );

  const debris = new THREE.InstancedMesh(geometry, material, params.count);
  const transform = new THREE.Object3D();

  for (let index = 0; index < params.count; index += 1) {
    transform.position.set(
      randomRange(-params.spread, params.spread),
      randomRange(params.yMin, params.yMax),
      randomRange(-params.spread, params.spread)
    );
    transform.rotation.set(
      randomRange(0, Math.PI * 2),
      randomRange(0, Math.PI * 2),
      randomRange(0, Math.PI * 2)
    );
    transform.scale.setScalar(randomRange(params.sizeMin, params.sizeMax));
    transform.updateMatrix();
    debris.setMatrixAt(index, transform.matrix);
  }

  debris.instanceMatrix.needsUpdate = true;
  debris.frustumCulled = false;
  addToScene(debris);

  return {
    root: debris,
    virtualDistance: params.virtualDistance
  };
}

function createThickGrid(
  size: number,
  divisions: number,
  lineThickness: number,
  gridMaterial: THREE.Material
): THREE.Group {
  const grid = new THREE.Group();
  const halfSize = size / 2;
  const step = size / divisions;
  const lineHeight = 0.02;
  const uniformThickness = lineThickness * 1.35;

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
  lineThickness: number,
  tileRadius: number,
  gridMaterial: THREE.Material
): THREE.Group {
  const root = new THREE.Group();

  for (let z = -tileRadius; z <= tileRadius; z += 1) {
    for (let x = -tileRadius; x <= tileRadius; x += 1) {
      const tile = createThickGrid(tileSize, divisions, lineThickness, gridMaterial);
      tile.position.set(x * tileSize, 0, z * tileSize);
      root.add(tile);
    }
  }

  return root;
}

function resolveParallaxFollowFactor(
  virtualDistance: number,
  referenceDistance: number
): number {
  const distance = Math.max(0.001, virtualDistance);
  const reference = Math.max(0.001, referenceDistance);
  return THREE.MathUtils.clamp(distance / (distance + reference), 0.25, 0.98);
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createSoftStarSpriteTexture(trackTexture: TrackTextureFn): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    return trackTexture(new THREE.Texture());
  }

  const center = canvas.width * 0.5;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.3)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = trackTexture(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
