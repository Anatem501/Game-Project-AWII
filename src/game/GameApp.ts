import * as THREE from "three";
import { GAME_CONFIG } from "./config";
import { setupTopDownScene, type TopDownSceneController } from "./scenes/TopDownScene";
import type { ShipSelectionConfig } from "./ships/ShipSelection";
import { MainMenu } from "./ui/MainMenu";

const TARGET_ASPECT_RATIO = 16 / 9;

export class GameApp {
  private readonly root: HTMLDivElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly menu: MainMenu;
  private readonly clock: THREE.Clock;
  private topDownController?: TopDownSceneController;
  private isPlayerTestActive = false;

  constructor(root: HTMLDivElement) {
    this.root = root;
    this.root.style.position = "relative";

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    this.camera.position.set(0, GAME_CONFIG.cameraHeight, GAME_CONFIG.cameraDistance);
    this.camera.lookAt(0, 0, 0);
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(GAME_CONFIG.clearColor);
    this.renderer.domElement.style.position = "absolute";
    this.root.appendChild(this.renderer.domElement);

    this.menu = new MainMenu(this.root, {
      onStart: () => this.menu.showModeSelect(),
      onBackToStart: () => this.menu.showStartMenu(),
      onPlayerTest: (selection) => this.startPlayerTest(selection)
    });
  }

  start(): void {
    this.onResize();
    window.addEventListener("resize", this.onResize);
    this.menu.showStartMenu();
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  private readonly tick = (): void => {
    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    this.topDownController?.update(deltaTime);
    this.renderer.render(this.scene, this.camera);
  };

  private startPlayerTest(selection: ShipSelectionConfig): void {
    if (this.isPlayerTestActive) {
      return;
    }

    this.topDownController = setupTopDownScene(this.scene, this.camera, this.renderer.domElement, {
      selection
    });
    this.isPlayerTestActive = true;
    this.menu.hide();
  }

  private readonly onResize = (): void => {
    const availableWidth = this.root.clientWidth || window.innerWidth;
    const availableHeight = this.root.clientHeight || window.innerHeight;

    let viewportWidth = availableWidth;
    let viewportHeight = Math.round(viewportWidth / TARGET_ASPECT_RATIO);

    if (viewportHeight > availableHeight) {
      viewportHeight = availableHeight;
      viewportWidth = Math.round(viewportHeight * TARGET_ASPECT_RATIO);
    }

    const offsetX = Math.floor((availableWidth - viewportWidth) * 0.5);
    const offsetY = Math.floor((availableHeight - viewportHeight) * 0.5);

    this.camera.aspect = TARGET_ASPECT_RATIO;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(viewportWidth, viewportHeight, false);
    this.renderer.domElement.style.width = `${viewportWidth}px`;
    this.renderer.domElement.style.height = `${viewportHeight}px`;
    this.renderer.domElement.style.left = `${offsetX}px`;
    this.renderer.domElement.style.top = `${offsetY}px`;
  };
}
