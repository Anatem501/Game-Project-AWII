import { DEFAULT_SHIP_ID, listShipDefinitions, type ShipDefinition } from "../ships/ShipCatalog";
import {
  MISSILE_COMPONENT_OPTIONS,
  PRIMARY_FIRE_COMPONENT_OPTIONS,
  createDefaultShipSelection,
  resolveCannonPrimaryComponentId,
  resolveMissileBayComponentId,
  type MissileComponentId,
  type PrimaryFireComponentId,
  type ShipSelectionConfig
} from "../ships/ShipSelection";
import {
  getCannonPrimaryComponentDefinition,
  getMissileBayComponentDefinition
} from "../weapons/WeaponComponentCatalog";
import { ShipCarouselPreview } from "./ShipCarouselPreview";

type MainMenuHandlers = {
  onStart: () => void;
  onBackToStart: () => void;
  onPlayerTest: (selection: ShipSelectionConfig) => void;
};

type MenuView = "start" | "mode-select" | "ship-select" | "ship-confirm";
type ComponentSlotId = "cannon_primary_fire" | "missile_payload";

const GAMEPAD_NAV_DEADZONE = 0.55;
const GAMEPAD_CONFIRM_BUTTON_INDEX = 0;
const FOCUS_REPEAT_INITIAL_MS = 250;
const FOCUS_REPEAT_HELD_MS = 130;
const GUN_PRIMARY_FIRE_SLOT_LABEL = "Cannons Primary Fire";
const MISSILE_PAYLOAD_SLOT_LABEL = "Missile Bay Payload";

export class MainMenu {
  private readonly overlay: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly handlers: MainMenuHandlers;
  private readonly ships: readonly ShipDefinition[];
  private currentView: MenuView = "start";
  private currentShipIndex = 0;
  private shipSelection = createDefaultShipSelection(DEFAULT_SHIP_ID);
  private selectedComponentSlot: ComponentSlotId | null = null;
  private isComponentPickerOpen = false;
  private hoveredPrimaryFireComponentId: PrimaryFireComponentId | null = null;
  private hoveredMissileComponentId: MissileComponentId | null = null;
  private preview: ShipCarouselPreview | null = null;
  private focusables: HTMLElement[] = [];
  private focusedIndex = 0;
  private controllerLoopId = 0;
  private horizontalStickHeld = false;
  private verticalStickHeld = false;
  private nextFocusMoveTimeMs = 0;
  private gamepadConfirmWasPressed = false;

  constructor(parent: HTMLElement, handlers: MainMenuHandlers) {
    this.handlers = handlers;
    this.ships = listShipDefinitions();
    this.currentShipIndex = Math.max(
      0,
      this.ships.findIndex((ship) => ship.id === this.shipSelection.shipId)
    );

    this.overlay = document.createElement("div");
    this.overlay.className = "menu-overlay";

    this.panel = document.createElement("div");
    this.panel.className = "menu-panel";

    this.overlay.appendChild(this.panel);
    parent.appendChild(this.overlay);

    window.addEventListener("keydown", this.onGlobalKeyDown, { passive: false });
  }

  showStartMenu(): void {
    this.currentView = "start";
    this.show(`
      <h1>AWII Prototype</h1>
      <p>Build and test your ship systems.</p>
      <button class="menu-button" data-action="start" data-focusable="true">Start</button>
    `);

    this.panel.querySelector<HTMLButtonElement>('[data-action="start"]')?.addEventListener("click", () => {
      this.handlers.onStart();
    });
  }

  showModeSelect(): void {
    this.currentView = "mode-select";
    this.show(`
      <h1>Mode Select</h1>
      <p>Choose a mode to launch.</p>
      <button class="menu-button" data-action="player-test" data-focusable="true">Player Test</button>
      <button class="menu-button menu-button-secondary" data-action="back" data-focusable="true">Back</button>
    `);

    this.panel
      .querySelector<HTMLButtonElement>('[data-action="player-test"]')
      ?.addEventListener("click", () => {
        this.showShipSelectMenu(this.shipSelection.shipId);
      });
    this.panel.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", () => {
      this.handlers.onBackToStart();
    });
  }

  hide(): void {
    this.overlay.style.display = "none";
    this.stopControllerLoop();
    this.disposePreview();
  }

  private show(content: string): void {
    this.overlay.style.display = "grid";
    this.disposePreview();
    this.panel.innerHTML = content;
    this.refreshFocusables(0);
    this.startControllerLoop();
  }

  private showShipSelectMenu(shipId: string): void {
    this.currentView = "ship-select";
    const shipIndex = this.ships.findIndex((ship) => ship.id === shipId);
    this.currentShipIndex = shipIndex >= 0 ? shipIndex : 0;
    this.shipSelection.shipId = this.ships[this.currentShipIndex].id;
    this.syncCannonPrimarySelectionWithCurrentShip();
    this.syncMissileBaySelectionWithCurrentShip();

    this.show(`
      <h1>Ship Selection</h1>
      <p>Use A / D to cycle ships. Enter or controller A confirms.</p>
      <div class="ship-select-layout ship-select-layout-primary">
        <section class="ship-preview-column">
          <div class="ship-preview-stage ship-preview-stage-single">
            <canvas class="ship-preview-canvas" data-role="ship-preview-canvas"></canvas>
          </div>
          <div class="ship-select-labels">
            <span data-role="ship-prev-label"></span>
            <strong data-role="ship-current-label"></strong>
            <span data-role="ship-next-label"></span>
          </div>
          <p class="ship-description" data-role="ship-description"></p>
        </section>
        <section class="ship-info-column">
          <h2>Components</h2>
          <div class="component-panel-content">
            <div data-role="ship-select-cannon-slots"></div>
            <div data-role="ship-select-missile-slots"></div>
            <p class="ship-description">Component changes are available in the Equipment panel after confirming the ship.</p>
          </div>
        </section>
      </div>
      <div class="menu-action-row">
        <button class="menu-button" data-action="ship-prev" data-focusable="true">Previous</button>
        <button class="menu-button" data-action="ship-confirm" data-focusable="true">Confirm</button>
        <button class="menu-button" data-action="ship-next" data-focusable="true">Next</button>
        <button class="menu-button menu-button-secondary" data-action="ship-select-back" data-focusable="true">Back</button>
      </div>
    `);

    this.panel.querySelectorAll<HTMLButtonElement>('[data-action="ship-prev"]').forEach((button) => {
      button.addEventListener("click", () => this.shiftShipSelection(-1));
    });
    this.panel.querySelectorAll<HTMLButtonElement>('[data-action="ship-next"]').forEach((button) => {
      button.addEventListener("click", () => this.shiftShipSelection(1));
    });
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="ship-confirm"]')
      ?.addEventListener("click", () => this.showShipConfirmMenu());
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="ship-select-back"]')
      ?.addEventListener("click", () => this.showModeSelect());

    this.setupPreview("carousel");
    this.refreshShipSelectContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="ship-confirm"]');
  }

  private showShipConfirmMenu(): void {
    this.currentView = "ship-confirm";
    this.selectedComponentSlot = null;
    this.isComponentPickerOpen = false;

    this.show(`
      <h1>Confirm Ship</h1>
      <p>Select a component slot to inspect details. Launch when ready.</p>
      <div class="ship-select-layout ship-select-layout-confirm">
        <section class="ship-info-column">
          <h2>Selected Component Stats</h2>
          <div data-role="component-stats"></div>
        </section>
        <section class="ship-preview-column">
          <div class="ship-preview-stage ship-preview-stage-confirm">
            <canvas class="ship-preview-canvas" data-role="ship-preview-canvas"></canvas>
          </div>
          <div class="ship-select-labels ship-select-labels-confirm">
            <strong data-role="ship-current-label"></strong>
          </div>
          <p class="ship-description" data-role="ship-description"></p>
        </section>
        <section class="ship-info-column component-panel-column">
          <h2>Components</h2>
          <div class="component-panel-content" data-role="component-panel-content">
            <div data-role="confirm-cannon-slot-list"></div>
            <div data-role="confirm-missile-slot-list"></div>
            <div class="component-panel-footer">
              <button class="menu-button" data-action="change-component" type="button">Change Component</button>
            </div>
          </div>
          <div class="component-picker-overlay" data-role="component-picker-overlay" aria-hidden="true">
            <h3>Change Component</h3>
            <p>Select a component to equip in this slot.</p>
            <div class="component-option-list" data-role="component-option-list"></div>
            <button class="menu-button menu-button-secondary" data-action="close-component-picker" type="button">Back</button>
          </div>
        </section>
      </div>
      <div class="menu-action-row menu-action-row-confirm">
        <button class="menu-button menu-button-secondary" data-action="ship-confirm-back" data-focusable="true">Back To Ship Select</button>
        <button class="menu-button" data-action="launch-player-test" data-focusable="true">Launch Selected Ship</button>
      </div>
    `);

    this.panel
      .querySelector<HTMLButtonElement>('[data-action="ship-confirm-back"]')
      ?.addEventListener("click", () => this.showShipSelectMenu(this.shipSelection.shipId));
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="launch-player-test"]')
      ?.addEventListener("click", () => this.launchSelectedShip());
    this.panel
      .querySelectorAll<HTMLButtonElement>('[data-action="select-component-slot"]')
      .forEach((button) => {
        const slot = button.dataset.slot as ComponentSlotId | undefined;
        if (!slot) {
          return;
        }
        button.addEventListener("click", () => this.selectComponentSlot(slot));
      });
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="change-component"]')
      ?.addEventListener("click", () => this.openComponentPicker());
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="close-component-picker"]')
      ?.addEventListener("click", () => this.closeComponentPicker());

    this.setupPreview("single");
    this.refreshShipConfirmContent();
    this.refreshFocusables(1);
    this.focusElement('[data-action="launch-player-test"]');
  }

  private setupPreview(mode: "carousel" | "single"): void {
    const canvas = this.panel.querySelector<HTMLCanvasElement>('[data-role="ship-preview-canvas"]');
    if (!canvas) {
      this.disposePreview();
      return;
    }

    this.disposePreview();
    this.preview = new ShipCarouselPreview(canvas);
    this.preview.setDisplayMode(mode);
    this.preview.start();
  }

  private disposePreview(): void {
    if (!this.preview) {
      return;
    }

    this.preview.dispose();
    this.preview = null;
  }

  private shiftShipSelection(direction: -1 | 1): void {
    if (this.ships.length <= 1) {
      return;
    }

    const count = this.ships.length;
    this.currentShipIndex = (this.currentShipIndex + direction + count) % count;
    this.shipSelection.shipId = this.ships[this.currentShipIndex].id;
    this.syncCannonPrimarySelectionWithCurrentShip();
    this.syncMissileBaySelectionWithCurrentShip();
    this.refreshShipSelectContent();
  }

  private refreshShipSelectContent(): void {
    const current = this.getShipWithOffset(0);
    const previous = this.getShipWithOffset(-1);
    const next = this.getShipWithOffset(1);
    const cannonMounts = current.cannonMounts ?? [];
    const missileBays = current.missileBays ?? [];
    this.shipSelection.cannonPrimaryComponentId = resolveCannonPrimaryComponentId(
      current.id,
      this.shipSelection.cannonPrimaryComponentId
    );
    this.shipSelection.missileBayComponentId = resolveMissileBayComponentId(
      current.id,
      this.shipSelection.missileBayComponentId
    );
    this.shipSelection.shipId = current.id;

    this.setTextContent('[data-role="ship-prev-label"]', previous.displayName);
    this.setTextContent('[data-role="ship-current-label"]', current.displayName);
    this.setTextContent('[data-role="ship-next-label"]', next.displayName);
    this.setTextContent('[data-role="ship-description"]', current.description);

    const shipSelectCannonSlots = this.panel.querySelector<HTMLElement>(
      '[data-role="ship-select-cannon-slots"]'
    );
    if (shipSelectCannonSlots) {
      if (cannonMounts.length <= 0) {
        shipSelectCannonSlots.innerHTML = "";
      } else {
        const component = getCannonPrimaryComponentDefinition(
          this.shipSelection.cannonPrimaryComponentId
        );
        shipSelectCannonSlots.innerHTML = cannonMounts
          .map((_, mountIndex) => {
            return `
              <div class="menu-button menu-button-secondary component-slot-button component-slot-readonly">
                <span class="component-slot-title">Cannon ${mountIndex + 1}</span>
                <span class="component-slot-value">Primary Fire: ${component.name}</span>
              </div>
            `;
          })
          .join("");
      }
    }

    const shipSelectMissileSlots = this.panel.querySelector<HTMLElement>(
      '[data-role="ship-select-missile-slots"]'
    );
    if (shipSelectMissileSlots) {
      if (missileBays.length <= 0) {
        shipSelectMissileSlots.innerHTML = "";
      } else {
        const component = getMissileBayComponentDefinition(this.shipSelection.missileBayComponentId);
        shipSelectMissileSlots.innerHTML = missileBays
          .map((_, bayIndex) => {
            return `
              <div class="menu-button menu-button-secondary component-slot-button component-slot-readonly">
                <span class="component-slot-title">Missile Bay ${bayIndex + 1}</span>
                <span class="component-slot-value">Payload: ${component.name}</span>
              </div>
            `;
          })
          .join("");
      }
    }

    this.preview?.setShips(previous, current, next);
  }

  private refreshShipConfirmContent(): void {
    const selectedShip = this.ships[this.currentShipIndex];
    const cannonMounts = selectedShip.cannonMounts ?? [];
    const missileBays = selectedShip.missileBays ?? [];
    this.shipSelection.cannonPrimaryComponentId = resolveCannonPrimaryComponentId(
      selectedShip.id,
      this.shipSelection.cannonPrimaryComponentId
    );
    this.shipSelection.missileBayComponentId = resolveMissileBayComponentId(
      selectedShip.id,
      this.shipSelection.missileBayComponentId
    );
    this.setTextContent('[data-role="ship-current-label"]', selectedShip.displayName);
    this.setTextContent('[data-role="ship-description"]', selectedShip.description);

    const hasCannonSlot = cannonMounts.length > 0;
    const hasMissileSlot = missileBays.length > 0;
    if (
      (this.selectedComponentSlot === "cannon_primary_fire" && !hasCannonSlot) ||
      (this.selectedComponentSlot === "missile_payload" && !hasMissileSlot)
    ) {
      this.selectedComponentSlot = null;
      this.isComponentPickerOpen = false;
      this.hoveredPrimaryFireComponentId = null;
      this.hoveredMissileComponentId = null;
    }
    if (this.selectedComponentSlot === null) {
      if (hasCannonSlot) {
        this.selectedComponentSlot = "cannon_primary_fire";
      } else if (hasMissileSlot) {
        this.selectedComponentSlot = "missile_payload";
      }
    }

    const confirmCannonSlotList = this.panel.querySelector<HTMLElement>(
      '[data-role="confirm-cannon-slot-list"]'
    );
    if (confirmCannonSlotList) {
      if (hasCannonSlot) {
        const component = getCannonPrimaryComponentDefinition(this.shipSelection.cannonPrimaryComponentId);
        const selectedClass =
          this.selectedComponentSlot === "cannon_primary_fire" ? " component-slot-selected" : "";
        const focusable = !this.isComponentPickerOpen ? ' data-focusable="true"' : "";
        confirmCannonSlotList.innerHTML = `
          <button class="menu-button menu-button-secondary component-slot-button${selectedClass}" data-action="select-component-slot" data-slot="cannon_primary_fire"${focusable} type="button">
            <span class="component-slot-title">${GUN_PRIMARY_FIRE_SLOT_LABEL}</span>
            <span class="component-slot-value">${component.name}</span>
          </button>
        `;
      } else {
        confirmCannonSlotList.innerHTML = "";
      }
      confirmCannonSlotList
        .querySelectorAll<HTMLButtonElement>('[data-action="select-component-slot"]')
        .forEach((button) => {
          const slot = button.dataset.slot as ComponentSlotId | undefined;
          if (!slot) {
            return;
          }
          button.addEventListener("click", () => this.selectComponentSlot(slot));
        });
    }

    const confirmMissileSlotList = this.panel.querySelector<HTMLElement>(
      '[data-role="confirm-missile-slot-list"]'
    );
    if (confirmMissileSlotList) {
      if (hasMissileSlot) {
        const component = getMissileBayComponentDefinition(this.shipSelection.missileBayComponentId);
        const selectedClass =
          this.selectedComponentSlot === "missile_payload" ? " component-slot-selected" : "";
        const focusable = !this.isComponentPickerOpen ? ' data-focusable="true"' : "";
        confirmMissileSlotList.innerHTML = `
          <button class="menu-button menu-button-secondary component-slot-button${selectedClass}" data-action="select-component-slot" data-slot="missile_payload"${focusable} type="button">
            <span class="component-slot-title">${MISSILE_PAYLOAD_SLOT_LABEL}</span>
            <span class="component-slot-value">${component.name}</span>
          </button>
        `;
      } else {
        confirmMissileSlotList.innerHTML = "";
      }
      confirmMissileSlotList
        .querySelectorAll<HTMLButtonElement>('[data-action="select-component-slot"]')
        .forEach((button) => {
          const slot = button.dataset.slot as ComponentSlotId | undefined;
          if (!slot) {
            return;
          }
          button.addEventListener("click", () => this.selectComponentSlot(slot));
        });
    }

    this.panel
      .querySelectorAll<HTMLButtonElement>('[data-action="select-component-slot"]')
      .forEach((button) => {
        const slot = button.dataset.slot as ComponentSlotId | undefined;
        button.classList.toggle("component-slot-selected", slot === this.selectedComponentSlot);
        if (this.isComponentPickerOpen) {
          button.removeAttribute("data-focusable");
        } else {
          button.setAttribute("data-focusable", "true");
        }
      });

    const changeButton = this.panel.querySelector<HTMLButtonElement>('[data-action="change-component"]');
    const closePickerButton = this.panel.querySelector<HTMLButtonElement>(
      '[data-action="close-component-picker"]'
    );
    const pickerOverlay = this.panel.querySelector<HTMLElement>('[data-role="component-picker-overlay"]');
    const panelContent = this.panel.querySelector<HTMLElement>('[data-role="component-panel-content"]');
    const optionList = this.panel.querySelector<HTMLElement>('[data-role="component-option-list"]');
    const canShowChangeButton = this.selectedComponentSlot !== null;
    if (changeButton) {
      const shouldShowChangeButton = canShowChangeButton && !this.isComponentPickerOpen;
      changeButton.style.display = shouldShowChangeButton ? "" : "none";
      if (shouldShowChangeButton) {
        changeButton.setAttribute("data-focusable", "true");
      } else {
        changeButton.removeAttribute("data-focusable");
      }
    }
    if (closePickerButton) {
      if (this.isComponentPickerOpen) {
        closePickerButton.setAttribute("data-focusable", "true");
      } else {
        closePickerButton.removeAttribute("data-focusable");
      }
    }
    if (pickerOverlay) {
      pickerOverlay.classList.toggle("component-picker-overlay-open", this.isComponentPickerOpen);
      pickerOverlay.setAttribute("aria-hidden", this.isComponentPickerOpen ? "false" : "true");
    }
    if (panelContent) {
      panelContent.setAttribute("aria-hidden", this.isComponentPickerOpen ? "true" : "false");
    }
    if (!this.isComponentPickerOpen) {
      this.hoveredPrimaryFireComponentId = null;
      this.hoveredMissileComponentId = null;
    }

    if (optionList) {
      if (canShowChangeButton && this.isComponentPickerOpen) {
        if (this.selectedComponentSlot === "cannon_primary_fire") {
          optionList.innerHTML = PRIMARY_FIRE_COMPONENT_OPTIONS.map((componentId) => {
            const option = getCannonPrimaryComponentDefinition(componentId);
            const equippedSuffix =
              componentId === this.shipSelection.cannonPrimaryComponentId
                ? " (Equipped)"
                : "";
            return `<button class="menu-button menu-button-secondary component-option-button" data-action="select-component-option" data-component-id="${componentId}" data-focusable="true">${option.name}${equippedSuffix}</button>`;
          }).join("");
          optionList
            .querySelectorAll<HTMLButtonElement>('[data-action="select-component-option"]')
            .forEach((button) => {
              const componentId = button.dataset.componentId as PrimaryFireComponentId | undefined;
              if (!componentId) {
                return;
              }
              button.addEventListener("click", () => {
                this.selectPrimaryFireComponent(componentId);
              });
              button.addEventListener("mouseenter", () => this.previewPrimaryFireComponent(componentId));
              button.addEventListener("focus", () => this.previewPrimaryFireComponent(componentId));
              button.addEventListener("mouseleave", () => this.clearPrimaryFireComponentPreview());
              button.addEventListener("blur", () => this.clearPrimaryFireComponentPreview());
            });
        } else if (this.selectedComponentSlot === "missile_payload") {
          optionList.innerHTML = MISSILE_COMPONENT_OPTIONS.map((componentId) => {
            const option = getMissileBayComponentDefinition(componentId);
            const equippedSuffix =
              componentId === this.shipSelection.missileBayComponentId
                ? " (Equipped)"
                : "";
            return `<button class="menu-button menu-button-secondary component-option-button" data-action="select-missile-component-option" data-component-id="${componentId}" data-focusable="true">${option.name}${equippedSuffix}</button>`;
          }).join("");
          optionList
            .querySelectorAll<HTMLButtonElement>('[data-action="select-missile-component-option"]')
            .forEach((button) => {
              const componentId = button.dataset.componentId as MissileComponentId | undefined;
              if (!componentId) {
                return;
              }
              button.addEventListener("click", () => {
                this.selectMissileComponent(componentId);
              });
              button.addEventListener("mouseenter", () => this.previewMissileComponent(componentId));
              button.addEventListener("focus", () => this.previewMissileComponent(componentId));
              button.addEventListener("mouseleave", () => this.clearMissileComponentPreview());
              button.addEventListener("blur", () => this.clearMissileComponentPreview());
            });
        } else {
          optionList.innerHTML = "";
        }
      } else {
        optionList.innerHTML = "";
      }
    }

    this.renderSelectedComponentStats();

    this.preview?.setShips(selectedShip, selectedShip, selectedShip);
  }

  private launchSelectedShip(): void {
    this.handlers.onPlayerTest({
      shipId: this.shipSelection.shipId,
      cannonPrimaryComponentId: this.shipSelection.cannonPrimaryComponentId,
      missileBayComponentId: this.shipSelection.missileBayComponentId,
      energyComponentId: this.shipSelection.energyComponentId
    });
  }

  private selectComponentSlot(slot: ComponentSlotId): void {
    this.selectedComponentSlot = slot;
    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="change-component"]');
  }

  private openComponentPicker(): void {
    if (this.selectedComponentSlot === null) {
      return;
    }

    this.isComponentPickerOpen = true;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshFocusables(0);
    if (this.selectedComponentSlot === "missile_payload") {
      this.focusElement('[data-action="select-missile-component-option"]');
    } else {
      this.focusElement('[data-action="select-component-option"]');
    }
  }

  private closeComponentPicker(): void {
    if (!this.isComponentPickerOpen) {
      return;
    }

    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="change-component"]');
  }

  private selectPrimaryFireComponent(componentId: PrimaryFireComponentId): void {
    this.shipSelection.cannonPrimaryComponentId = componentId;
    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshShipSelectContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="change-component"]');
  }

  private selectMissileComponent(componentId: MissileComponentId): void {
    this.shipSelection.missileBayComponentId = componentId;
    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshShipSelectContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="change-component"]');
  }

  private previewPrimaryFireComponent(componentId: PrimaryFireComponentId): void {
    if (!this.isComponentPickerOpen) {
      return;
    }
    this.hoveredPrimaryFireComponentId = componentId;
    this.renderSelectedComponentStats();
  }

  private clearPrimaryFireComponentPreview(): void {
    if (!this.isComponentPickerOpen) {
      return;
    }
    this.hoveredPrimaryFireComponentId = null;
    this.renderSelectedComponentStats();
  }

  private previewMissileComponent(componentId: MissileComponentId): void {
    if (!this.isComponentPickerOpen) {
      return;
    }
    this.hoveredMissileComponentId = componentId;
    this.renderSelectedComponentStats();
  }

  private clearMissileComponentPreview(): void {
    if (!this.isComponentPickerOpen) {
      return;
    }
    this.hoveredMissileComponentId = null;
    this.renderSelectedComponentStats();
  }

  private renderSelectedComponentStats(): void {
    const statsRoot = this.panel.querySelector<HTMLElement>('[data-role="component-stats"]');
    if (!statsRoot) {
      return;
    }
    if (this.selectedComponentSlot === null) {
      statsRoot.innerHTML =
        '<p class="ship-description">Select a component slot on the right to view its detailed stats.</p>';
      return;
    }

    if (this.selectedComponentSlot === "cannon_primary_fire") {
      const componentId =
        this.hoveredPrimaryFireComponentId ??
        this.shipSelection.cannonPrimaryComponentId ??
        PRIMARY_FIRE_COMPONENT_OPTIONS[0];
      const component = getCannonPrimaryComponentDefinition(componentId);
      statsRoot.innerHTML = `
        <ul class="ship-list">
          <li><span>Name</span><strong>${component.name}</strong></li>
          <li><span>Weapon Type</span><strong>${component.weaponType}</strong></li>
          <li><span>Fire Type</span><strong>${component.fireType}</strong></li>
          <li><span>Damage Type</span><strong>${component.damageType}</strong></li>
        </ul>
        <p class="ship-description">${component.description}</p>
      `;
      return;
    }

    if (this.selectedComponentSlot !== "missile_payload") {
      statsRoot.innerHTML =
        '<p class="ship-description">Select a component slot on the right to view its detailed stats.</p>';
      return;
    }
    const componentId =
      this.hoveredMissileComponentId ??
      this.shipSelection.missileBayComponentId;
    const component = getMissileBayComponentDefinition(componentId);
    statsRoot.innerHTML = `
      <ul class="ship-list">
        <li><span>Name</span><strong>${component.name}</strong></li>
        <li><span>Weapon Type</span><strong>${component.weaponType}</strong></li>
        <li><span>Fire Type</span><strong>${component.fireType}</strong></li>
        <li><span>Damage Type</span><strong>${component.damageType}</strong></li>
      </ul>
      <p class="ship-description">${component.description}</p>
    `;
  }

  private setTextContent(selector: string, text: string): void {
    const element = this.panel.querySelector<HTMLElement>(selector);
    if (!element) {
      return;
    }
    element.textContent = text;
  }

  private syncCannonPrimarySelectionWithCurrentShip(): void {
    const currentShip = this.ships[this.currentShipIndex];
    this.shipSelection.cannonPrimaryComponentId = resolveCannonPrimaryComponentId(
      currentShip.id,
      this.shipSelection.cannonPrimaryComponentId
    );
  }

  private syncMissileBaySelectionWithCurrentShip(): void {
    const currentShip = this.ships[this.currentShipIndex];
    this.shipSelection.missileBayComponentId = resolveMissileBayComponentId(currentShip.id);
  }

  private getShipWithOffset(offset: number): ShipDefinition {
    const count = this.ships.length;
    const index = (this.currentShipIndex + offset + count) % count;
    return this.ships[index];
  }

  private refreshFocusables(preferredIndex: number): void {
    this.panel.querySelectorAll<HTMLElement>(".menu-focus").forEach((element) => {
      element.classList.remove("menu-focus");
    });
    if (this.currentView === "ship-confirm" && this.isComponentPickerOpen) {
      const pickerOverlay = this.panel.querySelector<HTMLElement>('[data-role="component-picker-overlay"]');
      this.focusables = pickerOverlay
        ? Array.from(pickerOverlay.querySelectorAll<HTMLElement>('[data-focusable="true"]'))
        : [];
    } else {
      this.focusables = Array.from(this.panel.querySelectorAll<HTMLElement>('[data-focusable="true"]'));
    }

    if (this.focusables.length === 0) {
      this.focusedIndex = 0;
      return;
    }

    this.focusedIndex = Math.max(0, Math.min(preferredIndex, this.focusables.length - 1));
    this.applyFocus();
  }

  private moveFocus(step: number): void {
    if (this.focusables.length === 0) {
      return;
    }
    const total = this.focusables.length;
    this.focusedIndex = (this.focusedIndex + step + total) % total;
    this.applyFocus();
  }

  private applyFocus(): void {
    this.focusables.forEach((element) => element.classList.remove("menu-focus"));
    const target = this.focusables[this.focusedIndex];
    if (!target) {
      return;
    }
    target.classList.add("menu-focus");
    target.focus({ preventScroll: true });
  }

  private activateFocused(): void {
    this.focusables[this.focusedIndex]?.click();
  }

  private focusElement(selector: string): void {
    if (this.focusables.length === 0) {
      return;
    }
    const target = this.panel.querySelector<HTMLElement>(selector);
    if (!target) {
      return;
    }
    const targetIndex = this.focusables.indexOf(target);
    if (targetIndex < 0) {
      return;
    }
    this.focusedIndex = targetIndex;
    this.applyFocus();
  }

  private startControllerLoop(): void {
    if (this.controllerLoopId !== 0) {
      return;
    }
    this.controllerLoopId = requestAnimationFrame(this.handleControllerFrame);
  }

  private stopControllerLoop(): void {
    if (this.controllerLoopId === 0) {
      return;
    }
    cancelAnimationFrame(this.controllerLoopId);
    this.controllerLoopId = 0;
    this.horizontalStickHeld = false;
    this.verticalStickHeld = false;
    this.gamepadConfirmWasPressed = false;
  }

  private readonly handleControllerFrame = (timeMs: number): void => {
    if (this.overlay.style.display === "none") {
      this.stopControllerLoop();
      return;
    }

    const gamepad = getConnectedGamepad();
    if (!gamepad) {
      this.horizontalStickHeld = false;
      this.verticalStickHeld = false;
      this.gamepadConfirmWasPressed = false;
      this.controllerLoopId = requestAnimationFrame(this.handleControllerFrame);
      return;
    }

    const axisX = applyDeadzone(gamepad.axes[0] ?? 0, GAMEPAD_NAV_DEADZONE);
    const axisY = applyDeadzone(gamepad.axes[1] ?? 0, GAMEPAD_NAV_DEADZONE);

    if (Math.abs(axisX) > Math.abs(axisY) && Math.abs(axisX) > 0.0001) {
      if (!this.horizontalStickHeld || timeMs >= this.nextFocusMoveTimeMs) {
        this.moveFocus(axisX > 0 ? 1 : -1);
        this.nextFocusMoveTimeMs =
          timeMs + (this.horizontalStickHeld ? FOCUS_REPEAT_HELD_MS : FOCUS_REPEAT_INITIAL_MS);
      }
      this.horizontalStickHeld = true;
    } else {
      this.horizontalStickHeld = false;
    }

    if (Math.abs(axisY) > Math.abs(axisX) && Math.abs(axisY) > 0.0001) {
      if (!this.verticalStickHeld || timeMs >= this.nextFocusMoveTimeMs) {
        this.moveFocus(axisY > 0 ? 1 : -1);
        this.nextFocusMoveTimeMs =
          timeMs + (this.verticalStickHeld ? FOCUS_REPEAT_HELD_MS : FOCUS_REPEAT_INITIAL_MS);
      }
      this.verticalStickHeld = true;
    } else {
      this.verticalStickHeld = false;
    }

    const confirmPressed = gamepad.buttons[GAMEPAD_CONFIRM_BUTTON_INDEX]?.pressed === true;
    if (confirmPressed && !this.gamepadConfirmWasPressed) {
      this.activateFocused();
    }
    this.gamepadConfirmWasPressed = confirmPressed;

    this.controllerLoopId = requestAnimationFrame(this.handleControllerFrame);
  };

  private readonly onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (this.overlay.style.display === "none") {
      return;
    }

    const key = event.key.toLowerCase();
    if (this.currentView === "ship-select") {
      if (key === "a") {
        this.shiftShipSelection(-1);
        event.preventDefault();
        return;
      }
      if (key === "d") {
        this.shiftShipSelection(1);
        event.preventDefault();
        return;
      }
    }

    if (key === "arrowleft" || key === "arrowup") {
      this.moveFocus(-1);
      event.preventDefault();
      return;
    }
    if (key === "arrowright" || key === "arrowdown") {
      this.moveFocus(1);
      event.preventDefault();
      return;
    }
    if (key === "enter") {
      this.activateFocused();
      event.preventDefault();
      return;
    }
    if (key === "escape" && this.currentView === "ship-confirm" && this.isComponentPickerOpen) {
      this.closeComponentPicker();
      event.preventDefault();
    }
  };
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
  return Math.sign(value) * ((Math.abs(value) - deadzone) / (1 - deadzone));
}
