import { DEFAULT_SHIP_ID, listShipDefinitions, type ShipDefinition } from "../ships/ShipCatalog";
import { getGameModeLabel, type GameModeId } from "../modes/GameMode";
import {
  MISSILE_COMPONENT_OPTIONS,
  PRIMARY_FIRE_COMPONENT_OPTIONS,
  TORPEDO_COMPONENT_OPTIONS,
  createDefaultShipSelection,
  resolveCannonPrimaryComponentId,
  resolveMissileBayComponentId,
  resolveTorpedoComponentId,
  type MissileComponentId,
  type PrimaryFireComponentId,
  type TorpedoFireComponentId,
  type ShipSelectionConfig
} from "../ships/ShipSelection";
import {
  getCannonPrimaryComponentDefinition,
  getMissileBayComponentDefinition,
  getTorpedoComponentDefinition
} from "../weapons/WeaponComponentCatalog";
import {
  GENERAL_COMPONENT_SOCKET_IDS,
  getShipControlConfiguration,
  setShipControlConfiguration,
  type ControlConfigurationConnectionsByTab,
  type ControlConfigurationControlSocket,
  type ControlConfigurationControlsByTab,
  type ControlConfigurationTab
} from "../input/ShipControlConfigurationStore";
import { ShipCarouselPreview } from "./ShipCarouselPreview";

type MainMenuHandlers = {
  onStart: () => void;
  onBackToStart: () => void;
  onLaunchMode: (modeId: GameModeId, selection: ShipSelectionConfig) => void;
};

type MenuView = "start" | "mode-select" | "ship-select" | "ship-confirm" | "control-config";
type ComponentSlotId = "cannon_primary_fire" | "missile_payload" | "torpedo_payload";
type ControlConfigurationComponentGroupId = "cannon" | "missile" | "torpedo";
type ControlConfigurationComponentSocket = {
  id: string;
  label: string;
  componentName: string;
  groupId: "general" | ControlConfigurationComponentGroupId;
};

const GAMEPAD_NAV_DEADZONE = 0.55;
const GAMEPAD_CONFIRM_BUTTON_INDEX = 0;
const FOCUS_REPEAT_INITIAL_MS = 250;
const FOCUS_REPEAT_HELD_MS = 130;
const GUN_PRIMARY_FIRE_SLOT_LABEL = "Cannons Primary Fire";
const MISSILE_PAYLOAD_SLOT_LABEL = "Missile Bay Payload";
const TORPEDO_PAYLOAD_SLOT_LABEL = "Torpedo Launcher";
const CONTROL_CONFIG_GENERAL_CANNON_LABEL = "Cannon Primary Fire";
const CONTROL_CONFIG_GENERAL_MISSILE_LABEL = "Missile Bay Payload";
const CONTROL_CONFIG_GENERAL_TORPEDO_LABEL = "Torpedo Launcher Payload";
const CONTROL_CONFIG_GENERAL_BUILT_IN_LABEL = "Built-In Equipment";
const CONTROL_CONFIGURATION_TABS: readonly ControlConfigurationTab[] = ["kbm", "controller"];
const CONTROL_CONFIGURATION_DEFAULT_CONTROL_LABELS: Record<
  ControlConfigurationTab,
  Record<string, string>
> = {
  kbm: {
    kbm_left_click: "Left Click",
    kbm_right_click: "Right Click",
    kbm_shift_left_click: "Shift + Left Click",
    kbm_shift_right_click: "Shift + Right Click",
    kbm_spacebar: "Spacebar",
    kbm_1: "1",
    kbm_2: "2",
    kbm_3: "3",
    kbm_4: "4",
    kbm_5: "5",
    kbm_6: "6"
  },
  controller: {
    controller_lt: "LT",
    controller_rt: "RT",
    controller_lb: "LB",
    controller_rb: "RB",
    controller_a: "A",
    controller_b: "B",
    controller_x: "X",
    controller_y: "Y"
  }
};
const CONTROL_CONFIGURATION_BLOCKED_KBM_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "q",
  "e",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright"
]);
const CONTROL_CONFIGURATION_CONTROLLER_BUTTON_LABELS: Record<number, string> = {
  0: "A",
  1: "B",
  2: "X",
  3: "Y",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Back",
  9: "Start"
};

export class MainMenu {
  private readonly overlay: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly handlers: MainMenuHandlers;
  private readonly ships: readonly ShipDefinition[];
  private currentView: MenuView = "start";
  private selectedModeId: GameModeId = "testing_mode";
  private currentShipIndex = 0;
  private shipSelection = createDefaultShipSelection(DEFAULT_SHIP_ID);
  private selectedComponentSlot: ComponentSlotId | null = null;
  private isComponentPickerOpen = false;
  private controlConfigurationTab: ControlConfigurationTab = "kbm";
  private readonly controlConfigurationCollapsedGroups: Record<
    ControlConfigurationComponentGroupId,
    boolean
  > = {
    cannon: true,
    missile: true,
    torpedo: true
  };
  private controlConfigurationDraftShipId: string | null = null;
  private controlConfigurationDraftConnections: ControlConfigurationConnectionsByTab | null = null;
  private controlConfigurationDraftControls: ControlConfigurationControlsByTab | null = null;
  private cancelControlConfigurationListen: (() => void) | null = null;
  private isControlConfigurationListeningForInput = false;
  private cleanupControlConfigurationWiring: (() => void) | null = null;
  private hoveredPrimaryFireComponentId: PrimaryFireComponentId | null = null;
  private hoveredMissileComponentId: MissileComponentId | null = null;
  private hoveredTorpedoComponentId: TorpedoFireComponentId | null = null;
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
      <h1>Mode / Map Select</h1>
      <p>Choose the mode and map, then continue to ship selection.</p>
      <button class="menu-button" data-action="select-testing-mode" data-focusable="true">Test</button>
      <button class="menu-button" data-action="select-rogue-mode" data-focusable="true">Rogue Pilot</button>
      <button class="menu-button menu-button-secondary" data-action="back" data-focusable="true">Back</button>
    `);

    this.panel
      .querySelector<HTMLButtonElement>('[data-action="select-testing-mode"]')
      ?.addEventListener("click", () => {
        this.startModeSelection("testing_mode");
      });
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="select-rogue-mode"]')
      ?.addEventListener("click", () => {
        this.startModeSelection("rogue_pilot_mode");
      });
    this.panel.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", () => {
      this.handlers.onBackToStart();
    });
  }

  hide(): void {
    this.cancelControlConfigurationListen?.();
    this.cancelControlConfigurationListen = null;
    this.isControlConfigurationListeningForInput = false;
    this.cleanupControlConfigurationWiring?.();
    this.cleanupControlConfigurationWiring = null;
    this.overlay.style.display = "none";
    this.stopControllerLoop();
    this.disposePreview();
  }

  private show(content: string): void {
    this.cancelControlConfigurationListen?.();
    this.cancelControlConfigurationListen = null;
    this.isControlConfigurationListeningForInput = false;
    this.cleanupControlConfigurationWiring?.();
    this.cleanupControlConfigurationWiring = null;
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
    this.syncTorpedoSelectionWithCurrentShip();

    this.show(`
      <h1>Ship Selection</h1>
      <p>${getGameModeLabel(this.selectedModeId)} selected. Use A / D to cycle ships. Enter or controller A confirms.</p>
      <div class="ship-select-layout ship-select-layout-primary">
        <section class="ship-preview-column">
          <div class="ship-preview-stage ship-preview-stage-single">
            <canvas class="ship-preview-canvas" data-role="ship-preview-canvas"></canvas>
          </div>
          <div class="ship-select-labels">
            <button
              class="ship-select-side-label-button"
              type="button"
              data-action="ship-prev-label"
              data-focusable="true"
              aria-label="Select Previous Ship"
              title="Select Previous Ship"
            >
              <span data-role="ship-prev-label"></span>
            </button>
            <strong data-role="ship-current-label"></strong>
            <button
              class="ship-select-side-label-button"
              type="button"
              data-action="ship-next-label"
              data-focusable="true"
              aria-label="Select Next Ship"
              title="Select Next Ship"
            >
              <span data-role="ship-next-label"></span>
            </button>
          </div>
          <p class="ship-description" data-role="ship-description"></p>
        </section>
        <section class="ship-info-column">
          <h2>Components</h2>
          <div class="component-panel-content">
            <div data-role="ship-select-cannon-slots"></div>
            <div data-role="ship-select-missile-slots"></div>
            <div data-role="ship-select-torpedo-slots"></div>
            <div data-role="ship-select-built-in-slots"></div>
            <p class="ship-description">Component changes are available in the Equipment panel after confirming the ship.</p>
          </div>
        </section>
      </div>
      <div class="menu-action-row menu-action-row-ship-select">
        <button class="menu-button menu-button-icon" data-action="ship-prev" data-focusable="true" aria-label="Previous Ship" title="Previous Ship">
          <svg class="menu-button-icon-svg" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M12.5 4.5L7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button class="menu-button" data-action="ship-confirm" data-focusable="true">Confirm</button>
        <button class="menu-button menu-button-icon" data-action="ship-next" data-focusable="true" aria-label="Next Ship" title="Next Ship">
          <svg class="menu-button-icon-svg" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
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
      .querySelector<HTMLButtonElement>('[data-action="ship-prev-label"]')
      ?.addEventListener("click", () => this.shiftShipSelection(-1));
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="ship-next-label"]')
      ?.addEventListener("click", () => this.shiftShipSelection(1));
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
            <div data-role="confirm-torpedo-slot-list"></div>
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
        <button class="menu-button menu-button-secondary" data-action="open-control-configuration" data-focusable="true">Control Configuration</button>
        <button class="menu-button" data-action="launch-selected-mode" data-focusable="true">Launch ${getGameModeLabel(this.selectedModeId)}</button>
      </div>
    `);

    this.panel
      .querySelector<HTMLButtonElement>('[data-action="ship-confirm-back"]')
      ?.addEventListener("click", () => this.showShipSelectMenu(this.shipSelection.shipId));
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="launch-selected-mode"]')
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
      .querySelector<HTMLButtonElement>('[data-action="open-control-configuration"]')
      ?.addEventListener("click", () => this.showControlConfigurationMenu());
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="close-component-picker"]')
      ?.addEventListener("click", () => this.closeComponentPicker());

    this.setupPreview("single");
    this.refreshShipConfirmContent();
    this.refreshFocusables(1);
    this.focusElement('[data-action="launch-selected-mode"]');
  }

  private showControlConfigurationMenu(): void {
    this.currentView = "control-config";
    const currentShip = this.ships[this.currentShipIndex];
    this.shipSelection.shipId = currentShip.id;
    this.syncCannonPrimarySelectionWithCurrentShip();
    this.syncMissileBaySelectionWithCurrentShip();
    this.syncTorpedoSelectionWithCurrentShip();
    const componentSockets = this.buildControlConfigurationComponentSockets(currentShip);
    this.ensureControlConfigurationDraft(currentShip, componentSockets);
    const draftConnections = this.controlConfigurationDraftConnections;
    const draftControls = this.controlConfigurationDraftControls;
    if (!draftConnections || !draftControls) {
      return;
    }
    const controlSockets = draftControls[this.controlConfigurationTab];
    const isKbmTab = this.controlConfigurationTab === "kbm";
    const hasUnconnectedComponents = this.hasUnconnectedControlConfigurationComponentSockets(
      componentSockets,
      draftConnections
    );
    const generalComponentSockets = componentSockets.filter((socket) => socket.groupId === "general");
    const cannonComponentSockets = componentSockets.filter((socket) => socket.groupId === "cannon");
    const missileComponentSockets = componentSockets.filter((socket) => socket.groupId === "missile");
    const torpedoComponentSockets = componentSockets.filter((socket) => socket.groupId === "torpedo");
    const cannonGroupExpanded = !this.controlConfigurationCollapsedGroups.cannon;
    const missileGroupExpanded = !this.controlConfigurationCollapsedGroups.missile;
    const torpedoGroupExpanded = !this.controlConfigurationCollapsedGroups.torpedo;

    this.show(`
      <h1>Control Configuration</h1>
      <div class="ship-select-layout ship-select-layout-control-config">
        <section class="ship-preview-column control-config-preview-column">
          <div class="ship-preview-stage ship-preview-stage-single">
            <canvas class="ship-preview-canvas control-config-preview-canvas" data-role="ship-preview-canvas"></canvas>
          </div>
          <div class="ship-select-labels ship-select-labels-confirm">
            <strong>${currentShip.displayName}</strong>
          </div>
        </section>
        <section
          class="ship-info-column control-config-wiring-panel"
          data-role="control-config-wiring-area"
        >
          <svg class="control-config-wire-layer" data-role="control-config-wire-layer" aria-hidden="true"></svg>
          <div class="control-config-columns">
            <div class="control-config-column">
              <h2>Components</h2>
              <ul class="control-config-socket-list">
                ${generalComponentSockets
                  .map((componentSocket) =>
                    this.renderControlConfigurationComponentSocketRow(componentSocket)
                  )
                  .join("")}
              </ul>
              <div class="control-config-component-groups">
                ${this.renderControlConfigurationComponentGroup(
                  "cannon",
                  "Cannons",
                  cannonComponentSockets,
                  cannonGroupExpanded
                )}
                ${this.renderControlConfigurationComponentGroup(
                  "missile",
                  "Missile Bays",
                  missileComponentSockets,
                  missileGroupExpanded
                )}
                ${this.renderControlConfigurationComponentGroup(
                  "torpedo",
                  "Torpedo Launchers",
                  torpedoComponentSockets,
                  torpedoGroupExpanded
                )}
              </div>
            </div>
            <div class="control-config-column">
              <h2>Controls</h2>
              <div class="control-config-tab-row">
                <button
                  class="menu-button menu-button-secondary control-config-tab${isKbmTab ? " is-active" : ""}"
                  type="button"
                  data-action="control-config-tab"
                  data-tab="kbm"
                  data-focusable="true"
                >
                  KBM
                </button>
                <button
                  class="menu-button menu-button-secondary control-config-tab${!isKbmTab ? " is-active" : ""}"
                  type="button"
                  data-action="control-config-tab"
                  data-tab="controller"
                  data-focusable="true"
                >
                  Controller
                </button>
              </div>
              <ul class="control-config-socket-list">
                ${controlSockets
                  .map(
                    (controlSocket) => `
                  <li class="control-config-row control-config-row-control">
                    <button
                      class="control-config-socket control-config-socket-control"
                      type="button"
                      data-socket-role="control"
                      data-socket-id="${controlSocket.id}"
                      data-focusable="true"
                      aria-label="${controlSocket.label} socket"
                    ></button>
                    <div class="control-config-entry-text">
                      <span class="control-config-entry-title">${controlSocket.label}</span>
                    </div>
                  </li>
                `
                  )
                  .join("")}
              </ul>
              <div class="control-config-column-footer">
                <button class="menu-button menu-button-secondary" data-action="control-config-add-control" data-focusable="true" type="button">Add</button>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div class="menu-action-row menu-action-row-control-config">
        <button class="menu-button" data-action="control-config-save" data-focusable="true"${
          hasUnconnectedComponents ? " disabled" : ""
        }>Save</button>
        <button class="menu-button menu-button-secondary" data-action="control-config-back" data-focusable="true">Back</button>
      </div>
    `);

    this.panel
      .querySelector<HTMLButtonElement>('[data-action="control-config-save"]')
      ?.addEventListener("click", () => this.exitControlConfiguration(true));
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="control-config-back"]')
      ?.addEventListener("click", () => this.exitControlConfiguration(false));
    this.panel
      .querySelectorAll<HTMLButtonElement>('[data-action="control-config-tab"]')
      .forEach((button) => {
        const tab = button.dataset.tab as ControlConfigurationTab | undefined;
        if (!tab || tab === this.controlConfigurationTab) {
          return;
        }
        button.addEventListener("click", () => {
          this.controlConfigurationTab = tab;
          this.showControlConfigurationMenu();
        });
      });
    this.panel
      .querySelectorAll<HTMLButtonElement>('[data-action="control-config-toggle-group"]')
      .forEach((button) => {
        const group = button.dataset.group as ControlConfigurationComponentGroupId | undefined;
        if (!group) {
          return;
        }
        button.addEventListener("click", () => {
          this.controlConfigurationCollapsedGroups[group] =
            !this.controlConfigurationCollapsedGroups[group];
          this.showControlConfigurationMenu();
        });
      });
    this.panel
      .querySelector<HTMLButtonElement>('[data-action="control-config-add-control"]')
      ?.addEventListener("click", () => this.beginControlConfigurationAddControlListen());
    this.setupPreview("single");
    this.preview?.setShips(currentShip, currentShip, currentShip);
    this.setupControlConfigurationWiring(
      componentSockets,
      controlSockets,
      draftConnections
    );
    this.refreshFocusables(0);
    this.focusElement('[data-action="control-config-save"]');
  }

  private shiftControlConfigurationTab(step: -1 | 1): void {
    const currentIndex = CONTROL_CONFIGURATION_TABS.indexOf(this.controlConfigurationTab);
    const nextIndex =
      (currentIndex + step + CONTROL_CONFIGURATION_TABS.length) %
      CONTROL_CONFIGURATION_TABS.length;
    this.controlConfigurationTab = CONTROL_CONFIGURATION_TABS[nextIndex];
    this.showControlConfigurationMenu();
  }

  private renderControlConfigurationComponentSocketRow(
    componentSocket: ControlConfigurationComponentSocket
  ): string {
    return `
      <li class="control-config-row control-config-row-component">
        <div class="control-config-entry-text">
          <span class="control-config-entry-title">${componentSocket.label}</span>
          <span class="control-config-entry-value">${componentSocket.componentName}</span>
        </div>
        <button
          class="control-config-socket control-config-socket-component"
          type="button"
          data-socket-role="component"
          data-socket-id="${componentSocket.id}"
          data-focusable="true"
          aria-label="${componentSocket.label} socket"
        ></button>
      </li>
    `;
  }

  private renderControlConfigurationComponentGroup(
    groupId: ControlConfigurationComponentGroupId,
    groupLabel: string,
    sockets: readonly ControlConfigurationComponentSocket[],
    expanded: boolean
  ): string {
    if (sockets.length <= 0) {
      return "";
    }
    return `
      <section class="control-config-component-group">
        <button
          class="control-config-group-toggle"
          type="button"
          data-action="control-config-toggle-group"
          data-group="${groupId}"
          data-focusable="true"
          aria-expanded="${expanded ? "true" : "false"}"
        >
          ${groupLabel} ${expanded ? "[-]" : "[+]"}
        </button>
        ${
          expanded
            ? `<ul class="control-config-socket-list control-config-group-socket-list">
                ${sockets
                  .map((componentSocket) =>
                    this.renderControlConfigurationComponentSocketRow(componentSocket)
                  )
                  .join("")}
              </ul>`
            : ""
        }
      </section>
    `;
  }

  private buildControlConfigurationComponentSockets(
    ship: ShipDefinition
  ): ControlConfigurationComponentSocket[] {
    const sockets: ControlConfigurationComponentSocket[] = [];
    const cannonMounts = ship.cannonMounts ?? [];
    const missileBays = ship.missileBays ?? [];
    const torpedoLaunchers = ship.torpedoLaunchers ?? [];
    const cannonComponentName = getCannonPrimaryComponentDefinition(
      this.shipSelection.cannonPrimaryComponentId
    ).name;
    const missileComponentName = getMissileBayComponentDefinition(
      this.shipSelection.missileBayComponentId
    ).name;
    const torpedoComponentName = getTorpedoComponentDefinition(
      this.shipSelection.torpedoComponentId
    ).name;

    if (cannonMounts.length > 0) {
      sockets.push({
        id: GENERAL_COMPONENT_SOCKET_IDS.cannonPrimaryFire,
        label: CONTROL_CONFIG_GENERAL_CANNON_LABEL,
        componentName: cannonComponentName,
        groupId: "general"
      });
    }
    if (missileBays.length > 0) {
      sockets.push({
        id: GENERAL_COMPONENT_SOCKET_IDS.missileBayPayload,
        label: CONTROL_CONFIG_GENERAL_MISSILE_LABEL,
        componentName: missileComponentName,
        groupId: "general"
      });
    }
    if (torpedoLaunchers.length > 0) {
      sockets.push({
        id: GENERAL_COMPONENT_SOCKET_IDS.torpedoLauncherPayload,
        label: CONTROL_CONFIG_GENERAL_TORPEDO_LABEL,
        componentName: torpedoComponentName,
        groupId: "general"
      });
    }
    if (ship.builtInEquipmentAbilityId) {
      sockets.push({
        id: GENERAL_COMPONENT_SOCKET_IDS.builtInEquipment,
        label: CONTROL_CONFIG_GENERAL_BUILT_IN_LABEL,
        componentName: "Installed",
        groupId: "general"
      });
    }

    for (const mount of cannonMounts) {
      sockets.push({
        id: `cannon:${mount.id}`,
        label: mount.displayName,
        componentName: cannonComponentName,
        groupId: "cannon"
      });
    }
    for (const bay of missileBays) {
      sockets.push({
        id: `missile:${bay.id}`,
        label: bay.displayName,
        componentName: missileComponentName,
        groupId: "missile"
      });
    }
    for (const launcher of torpedoLaunchers) {
      sockets.push({
        id: `torpedo:${launcher.id}`,
        label: launcher.displayName,
        componentName: torpedoComponentName,
        groupId: "torpedo"
      });
    }

    return sockets;
  }

  private cloneControlConfigurationConnections(
    connections: ControlConfigurationConnectionsByTab
  ): ControlConfigurationConnectionsByTab {
    return {
      kbm: Object.fromEntries(
        Object.entries(connections.kbm).map(([componentSocketId, controlSocketIds]) => [
          componentSocketId,
          [...controlSocketIds]
        ])
      ),
      controller: Object.fromEntries(
        Object.entries(connections.controller).map(([componentSocketId, controlSocketIds]) => [
          componentSocketId,
          [...controlSocketIds]
        ])
      )
    };
  }

  private cloneControlConfigurationControls(
    controlsByTab: ControlConfigurationControlsByTab
  ): ControlConfigurationControlsByTab {
    return {
      kbm: controlsByTab.kbm.map((socket) => ({ ...socket })),
      controller: controlsByTab.controller.map((socket) => ({ ...socket }))
    };
  }

  private resolveControlConfigurationControlLabel(tab: ControlConfigurationTab, id: string): string {
    return CONTROL_CONFIGURATION_DEFAULT_CONTROL_LABELS[tab][id] ?? id;
  }

  private createControlConfigurationControlsFromConnections(
    connections: ControlConfigurationConnectionsByTab
  ): ControlConfigurationControlsByTab {
    const kbmControlIds = Array.from(new Set(Object.values(connections.kbm).flat()));
    const controllerControlIds = Array.from(new Set(Object.values(connections.controller).flat()));
    return {
      kbm: kbmControlIds.map((id) => ({
        id,
        label: this.resolveControlConfigurationControlLabel("kbm", id)
      })),
      controller: controllerControlIds.map((id) => ({
        id,
        label: this.resolveControlConfigurationControlLabel("controller", id)
      }))
    };
  }

  private createDefaultControlConfigurationState(
    componentSockets: readonly ControlConfigurationComponentSocket[]
  ): {
    connections: ControlConfigurationConnectionsByTab;
    controls: ControlConfigurationControlsByTab;
  } {
    const connections: ControlConfigurationConnectionsByTab = {
      kbm: {},
      controller: {}
    };
    const usedControlsByTab: Record<ControlConfigurationTab, Set<string>> = {
      kbm: new Set<string>(),
      controller: new Set<string>()
    };
    usedControlsByTab.kbm.add("kbm_left_click");
    usedControlsByTab.kbm.add("kbm_right_click");
    usedControlsByTab.kbm.add("kbm_shift_left_click");
    usedControlsByTab.kbm.add("kbm_shift_right_click");
    usedControlsByTab.kbm.add("kbm_spacebar");
    usedControlsByTab.controller.add("controller_rt");
    usedControlsByTab.controller.add("controller_lt");
    usedControlsByTab.controller.add("controller_rb");

    const componentSocketIds = new Set(componentSockets.map((componentSocket) => componentSocket.id));
    if (componentSocketIds.has(GENERAL_COMPONENT_SOCKET_IDS.cannonPrimaryFire)) {
      connections.kbm[GENERAL_COMPONENT_SOCKET_IDS.cannonPrimaryFire] = [
        "kbm_left_click",
        "kbm_shift_left_click"
      ];
      connections.controller[GENERAL_COMPONENT_SOCKET_IDS.cannonPrimaryFire] = ["controller_rt"];
    }
    if (componentSocketIds.has(GENERAL_COMPONENT_SOCKET_IDS.missileBayPayload)) {
      connections.kbm[GENERAL_COMPONENT_SOCKET_IDS.missileBayPayload] = [
        "kbm_right_click",
        "kbm_shift_right_click"
      ];
      connections.controller[GENERAL_COMPONENT_SOCKET_IDS.missileBayPayload] = ["controller_lt"];
    }
    if (componentSocketIds.has(GENERAL_COMPONENT_SOCKET_IDS.torpedoLauncherPayload)) {
      connections.kbm[GENERAL_COMPONENT_SOCKET_IDS.torpedoLauncherPayload] = ["kbm_right_click"];
      connections.controller[GENERAL_COMPONENT_SOCKET_IDS.torpedoLauncherPayload] = ["controller_rb"];
    }
    if (componentSocketIds.has(GENERAL_COMPONENT_SOCKET_IDS.builtInEquipment)) {
      connections.kbm[GENERAL_COMPONENT_SOCKET_IDS.builtInEquipment] = ["kbm_spacebar"];
      connections.controller[GENERAL_COMPONENT_SOCKET_IDS.builtInEquipment] = ["controller_rb"];
    }

    const controls: ControlConfigurationControlsByTab = {
      kbm: Array.from(usedControlsByTab.kbm).map((id) => ({
        id,
        label: this.resolveControlConfigurationControlLabel("kbm", id)
      })),
      controller: Array.from(usedControlsByTab.controller).map((id) => ({
        id,
        label: this.resolveControlConfigurationControlLabel("controller", id)
      }))
    };

    return {
      connections,
      controls
    };
  }

  private hasUnconnectedControlConfigurationComponentSockets(
    componentSockets: readonly ControlConfigurationComponentSocket[],
    connectionsByTab: ControlConfigurationConnectionsByTab
  ): boolean {
    for (const componentSocket of componentSockets) {
      const hasKbmBinding = (connectionsByTab.kbm[componentSocket.id]?.length ?? 0) > 0;
      const hasControllerBinding = (connectionsByTab.controller[componentSocket.id]?.length ?? 0) > 0;
      if (!hasKbmBinding && !hasControllerBinding) {
        return true;
      }
    }
    return false;
  }

  private updateControlConfigurationSaveButtonState(
    componentSockets: readonly ControlConfigurationComponentSocket[],
    connectionsByTab: ControlConfigurationConnectionsByTab
  ): void {
    const saveButton = this.panel.querySelector<HTMLButtonElement>('[data-action="control-config-save"]');
    if (!saveButton) {
      return;
    }
    const shouldDisable = this.hasUnconnectedControlConfigurationComponentSockets(
      componentSockets,
      connectionsByTab
    );
    saveButton.disabled = shouldDisable;
  }

  private ensureControlConfigurationFallbackDefaults(
    connections: ControlConfigurationConnectionsByTab,
    controlsByTab: ControlConfigurationControlsByTab,
    componentSockets: readonly ControlConfigurationComponentSocket[]
  ): void {
    const componentSocketIds = new Set(componentSockets.map((componentSocket) => componentSocket.id));
    if (!componentSocketIds.has(GENERAL_COMPONENT_SOCKET_IDS.torpedoLauncherPayload)) {
      return;
    }

    const torpedoSocketId = GENERAL_COMPONENT_SOCKET_IDS.torpedoLauncherPayload;
    const hasAnyTorpedoBinding =
      (connections.kbm[torpedoSocketId]?.length ?? 0) > 0 ||
      (connections.controller[torpedoSocketId]?.length ?? 0) > 0;
    if (hasAnyTorpedoBinding) {
      return;
    }

    connections.kbm[torpedoSocketId] = ["kbm_right_click"];
    const hasRightClickControl = controlsByTab.kbm.some(
      (controlSocket) => controlSocket.id === "kbm_right_click"
    );
    if (!hasRightClickControl) {
      controlsByTab.kbm.push({
        id: "kbm_right_click",
        label: this.resolveControlConfigurationControlLabel("kbm", "kbm_right_click")
      });
    }
  }

  private sanitizeControlConfigurationDraft(
    connections: ControlConfigurationConnectionsByTab,
    controlsByTab: ControlConfigurationControlsByTab,
    componentSockets: readonly ControlConfigurationComponentSocket[]
  ): void {
    const componentSocketIds = new Set(componentSockets.map((socket) => socket.id));
    for (const tab of CONTROL_CONFIGURATION_TABS) {
      const dedupedControls: ControlConfigurationControlSocket[] = [];
      const seenControlSocketIds = new Set<string>();
      for (const controlSocket of controlsByTab[tab]) {
        const normalizedControlSocketId = controlSocket.id.trim();
        if (!normalizedControlSocketId || seenControlSocketIds.has(normalizedControlSocketId)) {
          continue;
        }
        seenControlSocketIds.add(normalizedControlSocketId);
        dedupedControls.push({
          id: normalizedControlSocketId,
          label: controlSocket.label.trim() || this.resolveControlConfigurationControlLabel(tab, normalizedControlSocketId)
        });
      }
      controlsByTab[tab] = dedupedControls;
      const validControlSocketIds = new Set(controlsByTab[tab].map((socket) => socket.id));
      const tabConnections = connections[tab];
      for (const componentSocketId of Object.keys(tabConnections)) {
        const rawControlSocketIds = tabConnections[componentSocketId];
        if (!componentSocketIds.has(componentSocketId)) {
          delete tabConnections[componentSocketId];
          continue;
        }
        const controlSocketIds = Array.isArray(rawControlSocketIds)
          ? rawControlSocketIds
          : [rawControlSocketIds];
        const normalizedControlSocketIds: string[] = [];
        const seenIds = new Set<string>();
        for (const controlSocketId of controlSocketIds) {
          if (!controlSocketId || seenIds.has(controlSocketId)) {
            continue;
          }
          seenIds.add(controlSocketId);
          normalizedControlSocketIds.push(controlSocketId);
          if (!validControlSocketIds.has(controlSocketId)) {
            controlsByTab[tab].push({
              id: controlSocketId,
              label: this.resolveControlConfigurationControlLabel(tab, controlSocketId)
            });
            validControlSocketIds.add(controlSocketId);
          }
        }
        tabConnections[componentSocketId] = normalizedControlSocketIds;
      }
    }
  }

  private addControlSocketToDraft(tab: ControlConfigurationTab, label: string): void {
    const controlsByTab = this.controlConfigurationDraftControls;
    if (!controlsByTab) {
      return;
    }
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      return;
    }
    const tabControls = controlsByTab[tab];
    const existing = tabControls.find(
      (controlSocket) => controlSocket.label.toLowerCase() === normalizedLabel.toLowerCase()
    );
    if (existing) {
      return;
    }
    const slug =
      normalizedLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "input";
    const existingIds = new Set(tabControls.map((controlSocket) => controlSocket.id));
    let nextId = `${tab}_custom_${slug}`;
    let suffix = 2;
    while (existingIds.has(nextId)) {
      nextId = `${tab}_custom_${slug}_${suffix}`;
      suffix += 1;
    }
    tabControls.push({
      id: nextId,
      label: normalizedLabel
    });
  }

  private normalizeKeyboardControlLabel(rawKey: string, shiftPressed: boolean): string | null {
    const normalizedKey = rawKey.toLowerCase();
    if (CONTROL_CONFIGURATION_BLOCKED_KBM_KEYS.has(normalizedKey)) {
      return null;
    }
    if (normalizedKey === "shift") {
      return null;
    }
    if (normalizedKey === " " || normalizedKey === "spacebar") {
      return shiftPressed ? "Shift + Spacebar" : "Spacebar";
    }
    if (normalizedKey === "escape") {
      return null;
    }
    if (/^[0-9]$/.test(normalizedKey)) {
      return shiftPressed ? `Shift + ${normalizedKey}` : normalizedKey;
    }
    if (/^[a-z]$/.test(normalizedKey)) {
      const letter = normalizedKey.toUpperCase();
      return shiftPressed ? `Shift + ${letter}` : letter;
    }
    if (normalizedKey.length <= 0) {
      return null;
    }
    return shiftPressed && rawKey.length > 0 ? `Shift + ${rawKey}` : rawKey;
  }

  private beginControlConfigurationAddControlListen(): void {
    if (this.isControlConfigurationListeningForInput || this.controlConfigurationDraftControls === null) {
      return;
    }

    const addButton = this.panel.querySelector<HTMLButtonElement>(
      '[data-action="control-config-add-control"]'
    );
    if (!addButton) {
      return;
    }

    this.isControlConfigurationListeningForInput = true;
    addButton.disabled = true;
    addButton.textContent = this.controlConfigurationTab === "kbm" ? "Press Key..." : "Press Button...";
    if (this.controlConfigurationTab === "kbm") {
      this.beginControlConfigurationKbmListen();
    } else {
      this.beginControlConfigurationControllerListen();
    }
  }

  private beginControlConfigurationKbmListen(): void {
    const finalizeListen = (added: boolean): void => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
      this.cancelControlConfigurationListen = null;
      this.isControlConfigurationListeningForInput = false;
      if (added) {
        this.showControlConfigurationMenu();
        return;
      }
      const addButton = this.panel.querySelector<HTMLButtonElement>(
        '[data-action="control-config-add-control"]'
      );
      if (addButton) {
        addButton.disabled = false;
        addButton.textContent = "Add";
      }
    };

    const onContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
    };

    const onMouseDown = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      let mouseLabel: string | null = null;
      if (event.button === 0) {
        mouseLabel = "Left Click";
      } else if (event.button === 2) {
        mouseLabel = "Right Click";
      }
      if (!mouseLabel) {
        return;
      }
      const label = event.shiftKey ? `Shift + ${mouseLabel}` : mouseLabel;
      this.addControlSocketToDraft("kbm", label);
      finalizeListen(true);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key.toLowerCase() === "escape") {
        finalizeListen(false);
        return;
      }
      const label = this.normalizeKeyboardControlLabel(event.key, event.shiftKey);
      if (!label) {
        return;
      }
      this.addControlSocketToDraft("kbm", label);
      finalizeListen(true);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    this.cancelControlConfigurationListen = () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
      this.isControlConfigurationListeningForInput = false;
    };
  }

  private beginControlConfigurationControllerListen(): void {
    const baselinePressedButtons = new Set<number>();
    const initialGamepad = getConnectedGamepad();
    if (initialGamepad) {
      initialGamepad.buttons.forEach((button, buttonIndex) => {
        if (button.pressed) {
          baselinePressedButtons.add(buttonIndex);
        }
      });
    }

    let animationFrameId = 0;
    const finalizeListen = (added: boolean): void => {
      if (animationFrameId !== 0) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("keydown", onCancelKeyDown, true);
      this.cancelControlConfigurationListen = null;
      this.isControlConfigurationListeningForInput = false;
      if (added) {
        this.showControlConfigurationMenu();
        return;
      }
      const addButton = this.panel.querySelector<HTMLButtonElement>(
        '[data-action="control-config-add-control"]'
      );
      if (addButton) {
        addButton.disabled = false;
        addButton.textContent = "Add";
      }
    };

    const onCancelKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      finalizeListen(false);
    };

    const pollForPress = (): void => {
      if (!this.isControlConfigurationListeningForInput) {
        return;
      }
      const gamepad = getConnectedGamepad();
      if (gamepad) {
        for (let buttonIndex = 0; buttonIndex < gamepad.buttons.length; buttonIndex += 1) {
          const button = gamepad.buttons[buttonIndex];
          if (!button?.pressed) {
            continue;
          }
          if (baselinePressedButtons.has(buttonIndex)) {
            continue;
          }
          const controlLabel = CONTROL_CONFIGURATION_CONTROLLER_BUTTON_LABELS[buttonIndex];
          if (!controlLabel) {
            baselinePressedButtons.add(buttonIndex);
            continue;
          }
          this.addControlSocketToDraft("controller", controlLabel);
          finalizeListen(true);
          return;
        }
      }
      animationFrameId = requestAnimationFrame(pollForPress);
    };

    window.addEventListener("keydown", onCancelKeyDown, true);
    animationFrameId = requestAnimationFrame(pollForPress);
    this.cancelControlConfigurationListen = () => {
      if (animationFrameId !== 0) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("keydown", onCancelKeyDown, true);
      this.isControlConfigurationListeningForInput = false;
    };
  }

  private ensureControlConfigurationDraft(
    ship: ShipDefinition,
    componentSockets: readonly ControlConfigurationComponentSocket[]
  ): void {
    if (
      this.controlConfigurationDraftShipId === ship.id &&
      this.controlConfigurationDraftConnections !== null &&
      this.controlConfigurationDraftControls !== null
    ) {
      this.sanitizeControlConfigurationDraft(
        this.controlConfigurationDraftConnections,
        this.controlConfigurationDraftControls,
        componentSockets
      );
      return;
    }

    const savedConfiguration = getShipControlConfiguration(ship.id);
    if (savedConfiguration) {
      this.controlConfigurationDraftConnections = this.cloneControlConfigurationConnections(
        savedConfiguration.connectionsByTab
      );
      this.controlConfigurationDraftControls = savedConfiguration.controlsByTab
        ? this.cloneControlConfigurationControls(savedConfiguration.controlsByTab)
        : this.createControlConfigurationControlsFromConnections(this.controlConfigurationDraftConnections);
    } else {
      const defaults = this.createDefaultControlConfigurationState(componentSockets);
      this.controlConfigurationDraftConnections = defaults.connections;
      this.controlConfigurationDraftControls = defaults.controls;
    }
    this.controlConfigurationDraftShipId = ship.id;
    this.sanitizeControlConfigurationDraft(
      this.controlConfigurationDraftConnections,
      this.controlConfigurationDraftControls,
      componentSockets
    );
    this.ensureControlConfigurationFallbackDefaults(
      this.controlConfigurationDraftConnections,
      this.controlConfigurationDraftControls,
      componentSockets
    );
  }

  private exitControlConfiguration(save: boolean): void {
    if (
      save &&
      this.controlConfigurationDraftShipId !== null &&
      this.controlConfigurationDraftConnections !== null &&
      this.controlConfigurationDraftControls !== null
    ) {
      setShipControlConfiguration(this.controlConfigurationDraftShipId, {
        connectionsByTab: this.cloneControlConfigurationConnections(
          this.controlConfigurationDraftConnections
        ),
        controlsByTab: this.cloneControlConfigurationControls(this.controlConfigurationDraftControls)
      });
    }
    this.cancelControlConfigurationListen?.();
    this.cancelControlConfigurationListen = null;
    this.isControlConfigurationListeningForInput = false;
    this.controlConfigurationDraftShipId = null;
    this.controlConfigurationDraftConnections = null;
    this.controlConfigurationDraftControls = null;
    this.showShipConfirmMenu();
  }

  private setupControlConfigurationWiring(
    componentSockets: readonly ControlConfigurationComponentSocket[],
    controlSockets: ControlConfigurationControlSocket[],
    controlConnectionsByTab: ControlConfigurationConnectionsByTab
  ): void {
    const wiringArea = this.panel.querySelector<HTMLElement>('[data-role="control-config-wiring-area"]');
    const wireLayer = this.panel.querySelector<SVGSVGElement>('[data-role="control-config-wire-layer"]');
    if (!wiringArea || !wireLayer) {
      return;
    }

    const socketElements = Array.from(
      this.panel.querySelectorAll<HTMLElement>("[data-socket-role][data-socket-id]")
    );
    const componentSocketElements = new Map<string, HTMLElement>();
    const controlSocketElements = new Map<string, HTMLElement>();
    for (const socketElement of socketElements) {
      const socketId = socketElement.dataset.socketId;
      const socketRole = socketElement.dataset.socketRole;
      if (!socketId || !socketRole) {
        continue;
      }
      if (socketRole === "component") {
        componentSocketElements.set(socketId, socketElement);
      } else {
        controlSocketElements.set(socketId, socketElement);
      }
    }

    const componentSocketIds = new Set(componentSockets.map((socket) => socket.id));
    const controlSocketIds = new Set(controlSockets.map((socket) => socket.id));
    const activeConnections = controlConnectionsByTab[this.controlConfigurationTab];
    for (const componentSocketId of Object.keys(activeConnections)) {
      if (!componentSocketIds.has(componentSocketId)) {
        delete activeConnections[componentSocketId];
        continue;
      }
      const sanitizedControlSocketIds = activeConnections[componentSocketId].filter((controlSocketId) =>
        controlSocketIds.has(controlSocketId)
      );
      const dedupedControlSocketIds = Array.from(new Set(sanitizedControlSocketIds));
      if (dedupedControlSocketIds.length <= 0) {
        delete activeConnections[componentSocketId];
        continue;
      }
      activeConnections[componentSocketId] = dedupedControlSocketIds;
    }

    let dragging:
      | {
          sourceId: string;
          sourceRole: "component" | "control";
          pointerClientX: number;
          pointerClientY: number;
        }
      | null = null;

    const getSocketCenter = (socketElement: HTMLElement): { x: number; y: number } => {
      const areaRect = wiringArea.getBoundingClientRect();
      const socketRect = socketElement.getBoundingClientRect();
      return {
        x: socketRect.left + socketRect.width * 0.5 - areaRect.left,
        y: socketRect.top + socketRect.height * 0.5 - areaRect.top
      };
    };

    const createWirePath = (start: { x: number; y: number }, end: { x: number; y: number }): string => {
      const controlX = (start.x + end.x) * 0.5;
      return `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`;
    };

    const renderWires = (): void => {
      const areaRect = wiringArea.getBoundingClientRect();
      const width = Math.max(1, Math.floor(areaRect.width));
      const height = Math.max(1, Math.floor(areaRect.height));
      wireLayer.setAttribute("viewBox", `0 0 ${width} ${height}`);
      wireLayer.setAttribute("width", `${width}`);
      wireLayer.setAttribute("height", `${height}`);

      const wireSegments: string[] = [];
      for (const componentSocket of componentSockets) {
        const controlSocketIds = activeConnections[componentSocket.id];
        if (!controlSocketIds || controlSocketIds.length <= 0) {
          continue;
        }
        const componentSocketElement = componentSocketElements.get(componentSocket.id);
        if (!componentSocketElement) {
          continue;
        }
        for (const controlSocketId of controlSocketIds) {
          const controlSocketElement = controlSocketElements.get(controlSocketId);
          if (!controlSocketElement) {
            continue;
          }
          const start = getSocketCenter(controlSocketElement);
          const end = getSocketCenter(componentSocketElement);
          wireSegments.push(`<path class="control-config-wire" d="${createWirePath(start, end)}" />`);
        }
      }

      if (dragging) {
        const sourceElement =
          dragging.sourceRole === "component"
            ? componentSocketElements.get(dragging.sourceId)
            : controlSocketElements.get(dragging.sourceId);
        if (sourceElement) {
          const areaRectForDrag = wiringArea.getBoundingClientRect();
          const dragTarget = {
            x: dragging.pointerClientX - areaRectForDrag.left,
            y: dragging.pointerClientY - areaRectForDrag.top
          };
          const sourceCenter = getSocketCenter(sourceElement);
          const start = dragging.sourceRole === "control" ? sourceCenter : dragTarget;
          const end = dragging.sourceRole === "control" ? dragTarget : sourceCenter;
          wireSegments.push(
            `<path class="control-config-wire is-dragging" d="${createWirePath(start, end)}" />`
          );
        }
      }

      wireLayer.innerHTML = wireSegments.join("");

      for (const componentSocket of componentSockets) {
        const socketElement = componentSocketElements.get(componentSocket.id);
        if (!socketElement) {
          continue;
        }
        const isConnected = (activeConnections[componentSocket.id]?.length ?? 0) > 0;
        socketElement.classList.toggle("is-connected", isConnected);
      }
      for (const controlSocket of controlSockets) {
        const socketElement = controlSocketElements.get(controlSocket.id);
        if (!socketElement) {
          continue;
        }
        const isConnected = Object.values(activeConnections).some((controlSocketIds) =>
          controlSocketIds.includes(controlSocket.id)
        );
        socketElement.classList.toggle("is-connected", isConnected);
      }
      this.updateControlConfigurationSaveButtonState(componentSockets, controlConnectionsByTab);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging) {
        return;
      }
      dragging.pointerClientX = event.clientX;
      dragging.pointerClientY = event.clientY;
      renderWires();
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!dragging) {
        return;
      }
      const dropTarget = (
        document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      )?.closest<HTMLElement>("[data-socket-role][data-socket-id]");
      if (dropTarget) {
        const targetSocketRole = dropTarget.dataset.socketRole as "component" | "control" | undefined;
        const targetSocketId = dropTarget.dataset.socketId;
        if (
          targetSocketRole &&
          targetSocketId &&
          targetSocketRole !== dragging.sourceRole
        ) {
          const componentSocketId =
            dragging.sourceRole === "component" ? dragging.sourceId : targetSocketId;
          const controlSocketId =
            dragging.sourceRole === "control" ? dragging.sourceId : targetSocketId;
          if (
            componentSocketIds.has(componentSocketId) &&
            controlSocketIds.has(controlSocketId)
          ) {
            const existingBindings = activeConnections[componentSocketId] ?? [];
            if (existingBindings.includes(controlSocketId)) {
              const nextBindings = existingBindings.filter(
                (bindingControlSocketId) => bindingControlSocketId !== controlSocketId
              );
              if (nextBindings.length <= 0) {
                delete activeConnections[componentSocketId];
              } else {
                activeConnections[componentSocketId] = nextBindings;
              }
            } else {
              activeConnections[componentSocketId] = [...existingBindings, controlSocketId];
            }
          }
        }
      }

      dragging = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderWires();
    };

    const onSocketContextMenu = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      const socketElement = event.currentTarget as HTMLElement;
      const socketRole = socketElement.dataset.socketRole as "component" | "control" | undefined;
      const socketId = socketElement.dataset.socketId;
      if (!socketRole || !socketId) {
        return;
      }

      if (socketRole === "component") {
        delete activeConnections[socketId];
        renderWires();
        return;
      }

      const controlSocketIndex = controlSockets.findIndex((controlSocket) => controlSocket.id === socketId);
      if (controlSocketIndex >= 0) {
        controlSockets.splice(controlSocketIndex, 1);
      }
      for (const componentSocketId of Object.keys(activeConnections)) {
        const nextBindings = activeConnections[componentSocketId].filter(
          (controlSocketId) => controlSocketId !== socketId
        );
        if (nextBindings.length <= 0) {
          delete activeConnections[componentSocketId];
        } else {
          activeConnections[componentSocketId] = nextBindings;
        }
      }
      this.showControlConfigurationMenu();
    };

    const onSocketPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      const socketElement = event.currentTarget as HTMLElement;
      const sourceRole = socketElement.dataset.socketRole as "component" | "control" | undefined;
      const sourceId = socketElement.dataset.socketId;
      if (!sourceRole || !sourceId) {
        return;
      }

      event.preventDefault();
      dragging = {
        sourceId,
        sourceRole,
        pointerClientX: event.clientX,
        pointerClientY: event.clientY
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      renderWires();
    };

    for (const socketElement of socketElements) {
      socketElement.addEventListener("pointerdown", onSocketPointerDown);
      socketElement.addEventListener("contextmenu", onSocketContextMenu);
    }
    window.addEventListener("resize", renderWires);
    this.cleanupControlConfigurationWiring = () => {
      for (const socketElement of socketElements) {
        socketElement.removeEventListener("pointerdown", onSocketPointerDown);
        socketElement.removeEventListener("contextmenu", onSocketContextMenu);
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("resize", renderWires);
    };
    renderWires();
  }

  private startModeSelection(modeId: GameModeId): void {
    this.selectedModeId = modeId;
    this.showShipSelectMenu(this.shipSelection.shipId);
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
    this.preview.setSlotClickHandler(
      mode === "carousel"
        ? (slotIndex) => {
            if (slotIndex === 0) {
              this.shiftShipSelection(-1);
            } else if (slotIndex === 2) {
              this.shiftShipSelection(1);
            }
          }
        : null
    );
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
    this.syncTorpedoSelectionWithCurrentShip();
    this.refreshShipSelectContent();
  }

  private refreshShipSelectContent(): void {
    const current = this.getShipWithOffset(0);
    const previous = this.getShipWithOffset(-1);
    const next = this.getShipWithOffset(1);
    const cannonMounts = current.cannonMounts ?? [];
    const missileBays = current.missileBays ?? [];
    const torpedoLaunchers = current.torpedoLaunchers ?? [];
    this.shipSelection.cannonPrimaryComponentId = resolveCannonPrimaryComponentId(
      current.id,
      this.shipSelection.cannonPrimaryComponentId
    );
    this.shipSelection.missileBayComponentId = resolveMissileBayComponentId(
      current.id,
      this.shipSelection.missileBayComponentId
    );
    this.shipSelection.torpedoComponentId = resolveTorpedoComponentId(
      current.id,
      this.shipSelection.torpedoComponentId
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

    const shipSelectBuiltInSlots = this.panel.querySelector<HTMLElement>(
      '[data-role="ship-select-built-in-slots"]'
    );
    if (shipSelectBuiltInSlots) {
      if (current.id === "test_fighter") {
        shipSelectBuiltInSlots.innerHTML = `
          <div class="menu-button menu-button-secondary component-slot-button component-slot-readonly">
            <span class="component-slot-title">Ability</span>
            <span class="component-slot-value">Built In: Areobatic Roll</span>
          </div>
        `;
      } else {
        shipSelectBuiltInSlots.innerHTML = "";
      }
    }

    const shipSelectTorpedoSlots = this.panel.querySelector<HTMLElement>(
      '[data-role="ship-select-torpedo-slots"]'
    );
    if (shipSelectTorpedoSlots) {
      if (torpedoLaunchers.length <= 0) {
        shipSelectTorpedoSlots.innerHTML = "";
      } else {
        const component = getTorpedoComponentDefinition(this.shipSelection.torpedoComponentId);
        shipSelectTorpedoSlots.innerHTML = torpedoLaunchers
          .map((_, launcherIndex) => {
            return `
              <div class="menu-button menu-button-secondary component-slot-button component-slot-readonly">
                <span class="component-slot-title">Torpedo Launcher ${launcherIndex + 1}</span>
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
    const torpedoLaunchers = selectedShip.torpedoLaunchers ?? [];
    this.shipSelection.cannonPrimaryComponentId = resolveCannonPrimaryComponentId(
      selectedShip.id,
      this.shipSelection.cannonPrimaryComponentId
    );
    this.shipSelection.missileBayComponentId = resolveMissileBayComponentId(
      selectedShip.id,
      this.shipSelection.missileBayComponentId
    );
    this.shipSelection.torpedoComponentId = resolveTorpedoComponentId(
      selectedShip.id,
      this.shipSelection.torpedoComponentId
    );
    this.setTextContent('[data-role="ship-current-label"]', selectedShip.displayName);
    this.setTextContent('[data-role="ship-description"]', selectedShip.description);

    const hasCannonSlot = cannonMounts.length > 0;
    const hasMissileSlot = missileBays.length > 0;
    const hasTorpedoSlot = torpedoLaunchers.length > 0;
    if (
      (this.selectedComponentSlot === "cannon_primary_fire" && !hasCannonSlot) ||
      (this.selectedComponentSlot === "missile_payload" && !hasMissileSlot) ||
      (this.selectedComponentSlot === "torpedo_payload" && !hasTorpedoSlot)
    ) {
      this.selectedComponentSlot = null;
      this.isComponentPickerOpen = false;
      this.hoveredPrimaryFireComponentId = null;
      this.hoveredMissileComponentId = null;
      this.hoveredTorpedoComponentId = null;
    }
    if (this.selectedComponentSlot === null) {
      if (hasCannonSlot) {
        this.selectedComponentSlot = "cannon_primary_fire";
      } else if (hasMissileSlot) {
        this.selectedComponentSlot = "missile_payload";
      } else if (hasTorpedoSlot) {
        this.selectedComponentSlot = "torpedo_payload";
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

    const confirmTorpedoSlotList = this.panel.querySelector<HTMLElement>(
      '[data-role="confirm-torpedo-slot-list"]'
    );
    if (confirmTorpedoSlotList) {
      if (hasTorpedoSlot) {
        const component = getTorpedoComponentDefinition(this.shipSelection.torpedoComponentId);
        const selectedClass =
          this.selectedComponentSlot === "torpedo_payload" ? " component-slot-selected" : "";
        const focusable = !this.isComponentPickerOpen ? ' data-focusable="true"' : "";
        confirmTorpedoSlotList.innerHTML = `
          <button class="menu-button menu-button-secondary component-slot-button${selectedClass}" data-action="select-component-slot" data-slot="torpedo_payload"${focusable} type="button">
            <span class="component-slot-title">${TORPEDO_PAYLOAD_SLOT_LABEL}</span>
            <span class="component-slot-value">${component.name}</span>
          </button>
        `;
      } else {
        confirmTorpedoSlotList.innerHTML = "";
      }
      confirmTorpedoSlotList
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
    const controlConfigurationButton = this.panel.querySelector<HTMLButtonElement>(
      '[data-action="open-control-configuration"]'
    );
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
    if (controlConfigurationButton) {
      const shouldShowControlConfigurationButton = !this.isComponentPickerOpen;
      controlConfigurationButton.style.display = shouldShowControlConfigurationButton ? "" : "none";
      if (shouldShowControlConfigurationButton) {
        controlConfigurationButton.setAttribute("data-focusable", "true");
      } else {
        controlConfigurationButton.removeAttribute("data-focusable");
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
      this.hoveredTorpedoComponentId = null;
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
        } else if (this.selectedComponentSlot === "torpedo_payload") {
          optionList.innerHTML = TORPEDO_COMPONENT_OPTIONS.map((componentId) => {
            const option = getTorpedoComponentDefinition(componentId);
            const equippedSuffix =
              componentId === this.shipSelection.torpedoComponentId ? " (Equipped)" : "";
            return `<button class="menu-button menu-button-secondary component-option-button" data-action="select-torpedo-component-option" data-component-id="${componentId}" data-focusable="true">${option.name}${equippedSuffix}</button>`;
          }).join("");
          optionList
            .querySelectorAll<HTMLButtonElement>('[data-action="select-torpedo-component-option"]')
            .forEach((button) => {
              const componentId = button.dataset.componentId as TorpedoFireComponentId | undefined;
              if (!componentId) {
                return;
              }
              button.addEventListener("click", () => {
                this.selectTorpedoComponent(componentId);
              });
              button.addEventListener("mouseenter", () => this.previewTorpedoComponent(componentId));
              button.addEventListener("focus", () => this.previewTorpedoComponent(componentId));
              button.addEventListener("mouseleave", () => this.clearTorpedoComponentPreview());
              button.addEventListener("blur", () => this.clearTorpedoComponentPreview());
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
    this.handlers.onLaunchMode(this.selectedModeId, {
      shipId: this.shipSelection.shipId,
      cannonPrimaryComponentId: this.shipSelection.cannonPrimaryComponentId,
      missileBayComponentId: this.shipSelection.missileBayComponentId,
      energyComponentId: this.shipSelection.energyComponentId,
      torpedoComponentId: this.shipSelection.torpedoComponentId
    });
  }

  private selectComponentSlot(slot: ComponentSlotId): void {
    this.selectedComponentSlot = slot;
    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.hoveredTorpedoComponentId = null;
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
    this.hoveredTorpedoComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshFocusables(0);
    if (this.selectedComponentSlot === "missile_payload") {
      this.focusElement('[data-action="select-missile-component-option"]');
    } else if (this.selectedComponentSlot === "torpedo_payload") {
      this.focusElement('[data-action="select-torpedo-component-option"]');
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
    this.hoveredTorpedoComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="change-component"]');
  }

  private selectPrimaryFireComponent(componentId: PrimaryFireComponentId): void {
    this.shipSelection.cannonPrimaryComponentId = componentId;
    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.hoveredTorpedoComponentId = null;
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
    this.hoveredTorpedoComponentId = null;
    this.refreshShipConfirmContent();
    this.refreshShipSelectContent();
    this.refreshFocusables(0);
    this.focusElement('[data-action="change-component"]');
  }

  private selectTorpedoComponent(componentId: TorpedoFireComponentId): void {
    this.shipSelection.torpedoComponentId = componentId;
    this.isComponentPickerOpen = false;
    this.hoveredPrimaryFireComponentId = null;
    this.hoveredMissileComponentId = null;
    this.hoveredTorpedoComponentId = null;
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

  private previewTorpedoComponent(componentId: TorpedoFireComponentId): void {
    if (!this.isComponentPickerOpen) {
      return;
    }
    this.hoveredTorpedoComponentId = componentId;
    this.renderSelectedComponentStats();
  }

  private clearTorpedoComponentPreview(): void {
    if (!this.isComponentPickerOpen) {
      return;
    }
    this.hoveredTorpedoComponentId = null;
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

    if (this.selectedComponentSlot === "missile_payload") {
      const componentId = this.hoveredMissileComponentId ?? this.shipSelection.missileBayComponentId;
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
      return;
    }

    if (this.selectedComponentSlot === "torpedo_payload") {
      const componentId = this.hoveredTorpedoComponentId ?? this.shipSelection.torpedoComponentId;
      const component = getTorpedoComponentDefinition(componentId);
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

    {
      statsRoot.innerHTML =
        '<p class="ship-description">Select a component slot on the right to view its detailed stats.</p>';
    }
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

  private syncTorpedoSelectionWithCurrentShip(): void {
    const currentShip = this.ships[this.currentShipIndex];
    this.shipSelection.torpedoComponentId = resolveTorpedoComponentId(
      currentShip.id,
      this.shipSelection.torpedoComponentId
    );
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
    if (this.currentView === "control-config" && this.isControlConfigurationListeningForInput) {
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
    if (this.currentView === "control-config") {
      if (this.isControlConfigurationListeningForInput) {
        event.preventDefault();
        return;
      }
      if (key === "a") {
        this.shiftControlConfigurationTab(-1);
        event.preventDefault();
        return;
      }
      if (key === "d") {
        this.shiftControlConfigurationTab(1);
        event.preventDefault();
        return;
      }
      if (key === "escape") {
        this.exitControlConfiguration(false);
        event.preventDefault();
        return;
      }
    }

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
