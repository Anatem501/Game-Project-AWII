import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ShipDefinition } from "../ships/ShipCatalog";

type PreviewSlot = {
  pedestal: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  clickVolume: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  root: THREE.Group;
  shipRoot: THREE.Group;
  trim: THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;
};

const SLOT_X_OFFSETS = [-3.2, 0, 3.2] as const;
const SLOT_Z_OFFSETS = [-0.9, 0, -0.9] as const;
const SLOT_Y = 0;
const SIDE_SHIP_SCALE = 1.24;
const CENTER_SHIP_SCALE = 2.0;
const SIDE_SHIP_OPACITY = 0.82;
const CENTER_SHIP_OPACITY = 1;
const ROTATION_SPEED_RADIANS = 0.5;
const SIDE_CLICK_VOLUME_HEIGHT = 18;
const SIDE_CLICK_VOLUME_RADIUS = 1.7;

export class ShipCarouselPreview {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loader: GLTFLoader;
  private readonly slots: readonly PreviewSlot[];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly modelCache = new Map<string, Promise<THREE.Object3D>>();
  private requestId = 0;
  private updateVersion = 0;
  private lastFrameTimeMs = 0;
  private displayMode: "carousel" | "single" = "carousel";
  private onSlotClick: ((slotIndex: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    this.camera.position.set(0, 4.2, 8.8);
    this.camera.lookAt(0, 1.1, 0);

    this.loader = new GLTFLoader();
    this.slots = SLOT_X_OFFSETS.map((xOffset, index) => this.createSlot(xOffset, SLOT_Z_OFFSETS[index] ?? 0));
    this.setupLighting();
    this.canvas.addEventListener("click", this.handleCanvasClick);
  }

  start(): void {
    if (this.requestId !== 0) {
      return;
    }

    this.lastFrameTimeMs = 0;
    this.requestId = requestAnimationFrame(this.renderFrame);
  }

  stop(): void {
    if (this.requestId === 0) {
      return;
    }

    cancelAnimationFrame(this.requestId);
    this.requestId = 0;
  }

  dispose(): void {
    this.stop();
    this.canvas.removeEventListener("click", this.handleCanvasClick);
    for (const slot of this.slots) {
      this.clearSlot(slot);
    }
    this.renderer.dispose();
  }

  setDisplayMode(mode: "carousel" | "single"): void {
    this.displayMode = mode;
    this.slots[0].root.visible = mode === "carousel";
    this.slots[2].root.visible = mode === "carousel";
    this.slots[1].root.visible = true;
  }

  setSlotClickHandler(handler: ((slotIndex: number) => void) | null): void {
    this.onSlotClick = handler;
  }

  setShips(previousShip: ShipDefinition, selectedShip: ShipDefinition, nextShip: ShipDefinition): void {
    const version = ++this.updateVersion;
    void this.applyShipToSlot(0, previousShip, version, false);
    void this.applyShipToSlot(1, selectedShip, version, true);
    void this.applyShipToSlot(2, nextShip, version, false);
  }

  private readonly handleCanvasClick = (event: MouseEvent): void => {
    if (this.displayMode !== "carousel" || !this.onSlotClick) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.pointerNdc.set(x, y);
    this.syncRendererSize();
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    let closestSlotIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const slotIndex of [0, 2] as const) {
      const slot = this.slots[slotIndex];
      if (!slot?.root.visible) {
        continue;
      }
      const intersections = this.raycaster.intersectObject(slot.clickVolume, false);
      const nearest = intersections[0];
      if (!nearest) {
        continue;
      }
      if (nearest.distance < closestDistance) {
        closestDistance = nearest.distance;
        closestSlotIndex = slotIndex;
      }
    }

    if (closestSlotIndex >= 0) {
      this.onSlotClick(closestSlotIndex);
    }
  };

  private readonly renderFrame = (timeMs: number): void => {
    if (this.requestId === 0) {
      return;
    }

    const deltaTimeSeconds =
      this.lastFrameTimeMs <= 0 ? 0 : Math.min(0.05, (timeMs - this.lastFrameTimeMs) * 0.001);
    this.lastFrameTimeMs = timeMs;
    this.syncRendererSize();

    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      const slotSpeed = i === 1 ? ROTATION_SPEED_RADIANS : ROTATION_SPEED_RADIANS * 0.78;
      slot.shipRoot.rotation.y += slotSpeed * deltaTimeSeconds;
      if (i === 1) {
        slot.pedestal.material.emissiveIntensity = 0.2 + Math.sin(timeMs * 0.003) * 0.08;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.requestId = requestAnimationFrame(this.renderFrame);
  };

  private createSlot(xOffset: number, zOffset = 0): PreviewSlot {
    const root = new THREE.Group();
    root.position.set(xOffset, SLOT_Y, zOffset);
    this.scene.add(root);

    const isCenterSlot = Math.abs(xOffset) < 0.001;
    const pedestalRadiusScale = isCenterSlot ? 1 : 0.86;
    const pedestalHeight = isCenterSlot ? 0.55 : 0.42;
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(
        1.2 * pedestalRadiusScale,
        1.36 * pedestalRadiusScale,
        pedestalHeight,
        40
      ),
      new THREE.MeshStandardMaterial({
        color: 0x23456c,
        emissive: 0x15335a,
        emissiveIntensity: 0.12,
        metalness: 0.25,
        roughness: 0.5
      })
    );
    pedestal.position.y = pedestalHeight * 0.5;
    root.add(pedestal);

    const clickVolume = new THREE.Mesh(
      new THREE.CylinderGeometry(
        isCenterSlot ? 1.4 : SIDE_CLICK_VOLUME_RADIUS,
        isCenterSlot ? 1.4 : SIDE_CLICK_VOLUME_RADIUS,
        isCenterSlot ? SIDE_CLICK_VOLUME_HEIGHT * 0.65 : SIDE_CLICK_VOLUME_HEIGHT,
        24
      ),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide
      })
    );
    clickVolume.position.y = (isCenterSlot ? SIDE_CLICK_VOLUME_HEIGHT * 0.65 : SIDE_CLICK_VOLUME_HEIGHT) * 0.5;
    clickVolume.visible = !isCenterSlot;
    root.add(clickVolume);

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(1.12 * pedestalRadiusScale, 0.04, 16, 60),
      new THREE.MeshStandardMaterial({
        color: 0x7fd4ff,
        emissive: 0x5ab7ff,
        emissiveIntensity: 0.22,
        metalness: 0.4,
        roughness: 0.35
      })
    );
    trim.rotation.x = Math.PI * 0.5;
    trim.position.y = pedestalHeight - 0.01;
    root.add(trim);

    const shipRoot = new THREE.Group();
    shipRoot.position.y = pedestalHeight + 0.02;
    root.add(shipRoot);

    return { pedestal, clickVolume, root, shipRoot, trim };
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xa8cfff, 0.75);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xe3f6ff, 1.08);
    key.position.set(5.2, 8, 5.8);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x4fb7ff, 0.5);
    fill.position.set(-4, 4.2, -2.5);
    this.scene.add(fill);
  }

  private syncRendererSize(): void {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight));
    if (this.renderer.domElement.width === width && this.renderer.domElement.height === height) {
      return;
    }

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private async applyShipToSlot(
    slotIndex: number,
    ship: ShipDefinition,
    version: number,
    isSelected: boolean
  ): Promise<void> {
    const slot = this.slots[slotIndex];
    this.clearSlot(slot);

    const template = await this.loadShipModel(ship.modelUrl);
    if (version !== this.updateVersion) {
      return;
    }

    const shipInstance = template.clone(true);
    shipInstance.rotation.y = ship.modelYawOffset;
    normalizeModelToPedestal(shipInstance, isSelected ? CENTER_SHIP_SCALE : SIDE_SHIP_SCALE);
    applyPreviewMaterialState(shipInstance, isSelected ? CENTER_SHIP_OPACITY : SIDE_SHIP_OPACITY);

    slot.shipRoot.rotation.set(0, 0, 0);
    slot.shipRoot.add(shipInstance);
    slot.pedestal.material.color.setHex(isSelected ? 0x2c5f8f : 0x223d5f);
    slot.pedestal.material.emissive.setHex(isSelected ? 0x1e406f : 0x123055);
    slot.pedestal.material.emissiveIntensity = isSelected ? 0.2 : 0.1;
    slot.trim.material.emissiveIntensity = isSelected ? 0.22 : 0.12;
    slot.root.visible = this.displayMode === "carousel" || isSelected;
  }

  private clearSlot(slot: PreviewSlot): void {
    while (slot.shipRoot.children.length > 0) {
      slot.shipRoot.remove(slot.shipRoot.children[0]);
    }
  }

  private loadShipModel(modelUrl: string): Promise<THREE.Object3D> {
    let cached = this.modelCache.get(modelUrl);
    if (!cached) {
      cached = new Promise<THREE.Object3D>((resolve, reject) => {
        this.loader.load(
          modelUrl,
          (gltf) => resolve(gltf.scene),
          undefined,
          (error) => reject(error)
        );
      });
      this.modelCache.set(modelUrl, cached);
    }

    return cached;
  }
}

function normalizeModelToPedestal(model: THREE.Object3D, targetSize: number): void {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDimension;
  model.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
}

function applyPreviewMaterialState(
  root: THREE.Object3D,
  opacity: number
): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) => updatePreviewMaterial(material, opacity));
      return;
    }

    node.material = updatePreviewMaterial(node.material, opacity);
  });
}

function updatePreviewMaterial(
  material: THREE.Material,
  opacity: number
): THREE.Material {
  const cloned = material.clone();
  if (!(cloned instanceof THREE.MeshStandardMaterial)) {
    return cloned;
  }

  cloned.emissive.setHex(0x000000);
  cloned.emissiveIntensity = 0;
  cloned.transparent = opacity < 0.999;
  cloned.opacity = opacity;
  cloned.needsUpdate = true;
  return cloned;
}
