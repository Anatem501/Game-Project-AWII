import * as THREE from "three";
import type { HealthSnapshot } from "../components/HealthComponent";
import type { ShipResourceSnapshot } from "../components/ShipResourceComponent";
import type { PlayerBuiltInEquipmentAbilityHudSnapshot } from "../equipment/abilities/PlayerBuiltInEquipmentAbility";

type LayerElements = {
  value: HTMLSpanElement;
  fill: HTMLDivElement;
};

type VerticalResourceElements = {
  fill: HTMLDivElement;
  meter: HTMLDivElement;
  state: HTMLSpanElement;
  value: HTMLSpanElement;
};

type AbilitySegmentElements = {
  fill: HTMLDivElement;
  segment: HTMLDivElement;
};

type AbilityPanelElements = {
  label: HTMLSpanElement;
  panel: HTMLDivElement;
  segments: AbilitySegmentElements[];
  status: HTMLSpanElement;
  track: HTMLDivElement;
  value: HTMLSpanElement;
};

type MissileHudSnapshot = {
  ammoCapacity: number;
  ammoLoaded: number;
  cellsPerLauncher: number;
  firedFlashSeconds: number;
  isLocking: boolean;
  launcherCount: number;
  launcherLoadedCounts: number[];
  launcherReloadingFlags: boolean[];
  lockedTargetCount: number;
  lockingProgress01: number;
  isReloading: boolean;
  reloadProgress01: number;
};

export type HudMinimapSnapshot = {
  playerPosition: { x: number; z: number };
  enemies: Array<{ x: number; z: number }>;
  playerYawRadians?: number;
  range?: number;
};

export type HudBoundarySnapshot = {
  playerPosition: { x: number; z: number };
  centerPosition: { x: number; z: number };
  softRadius: number;
  hardRadius: number;
  enemies: Array<{ x: number; z: number }>;
  range?: number;
};

const DEFAULT_MISSILE_DOT_COUNT = 10;
const MAX_MISSILE_DOT_COUNT = 64;
const DEFAULT_MINIMAP_RANGE = 80;
const MINIMAP_SIZE = 128;

export type PlayerHealthHud = {
  update: (
    snapshot: HealthSnapshot,
    missileSnapshot?: MissileHudSnapshot,
    builtInAbilitySnapshot?: PlayerBuiltInEquipmentAbilityHudSnapshot | null,
    resourceSnapshot?: ShipResourceSnapshot,
    minimapSnapshot?: HudMinimapSnapshot,
    boundarySnapshot?: HudBoundarySnapshot
  ) => void;
  dispose: () => void;
};

export function createPlayerHealthHud(root: HTMLElement): PlayerHealthHud {
  const container = document.createElement("div");
  container.className = "player-health-hud";
  const content = document.createElement("div");
  content.className = "player-health-content";
  const mainColumn = document.createElement("div");
  mainColumn.className = "player-health-main";

  const shield = createLayerRow("Shield", "player-health-fill-shield");
  const armor = createLayerRow("Armor", "player-health-fill-armor");
  const hull = createLayerRow("Hull", "player-health-fill-hull");
  const resourceMeters = createVerticalResourceMeters();
  const missile = createMissileRow();
  const abilityPanel = createAbilityPanel();
  const minimap = createMinimapPanel();
  const boundaryMinimap = createBoundaryMinimapPanel();

  mainColumn.appendChild(shield.row);
  mainColumn.appendChild(armor.row);
  mainColumn.appendChild(hull.row);
  mainColumn.appendChild(missile.row);
  content.appendChild(mainColumn);
  container.appendChild(resourceMeters.panel);
  container.appendChild(content);
  container.appendChild(abilityPanel.panel);
  root.appendChild(container);
  root.appendChild(minimap.panel);
  root.appendChild(boundaryMinimap.panel);

  const update = (
    snapshot: HealthSnapshot,
    missileSnapshot?: MissileHudSnapshot,
    builtInAbilitySnapshot?: PlayerBuiltInEquipmentAbilityHudSnapshot | null,
    resourceSnapshot?: ShipResourceSnapshot,
    minimapSnapshot?: HudMinimapSnapshot,
    boundarySnapshot?: HudBoundarySnapshot
  ): void => {
    setLayerRowVisible(shield.row, snapshot.shield.max);
    setLayerRowVisible(armor.row, snapshot.armor.max);
    setLayerRowVisible(hull.row, snapshot.hull.max);
    updateLayer(shield.elements, snapshot.shield.current, snapshot.shield.max);
    updateLayer(armor.elements, snapshot.armor.current, snapshot.armor.max);
    updateLayer(hull.elements, snapshot.hull.current, snapshot.hull.max);
    updateVerticalHeat(resourceMeters.heat, resourceSnapshot);
    updateVerticalEnergy(resourceMeters.energy, resourceSnapshot);
    updateMissiles(missile, missileSnapshot);
    updateBuiltInAbilityPanel(abilityPanel, builtInAbilitySnapshot ?? null);
    updateMinimap(minimap, minimapSnapshot);
    updateBoundaryMinimap(boundaryMinimap, boundarySnapshot);
  };

  const dispose = (): void => {
    container.remove();
    resourceMeters.panel.remove();
    minimap.panel.remove();
    boundaryMinimap.panel.remove();
  };

  return { update, dispose };
}

function createBoundaryMinimapPanel(): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D | null;
  panel: HTMLDivElement;
  rangeValue: HTMLSpanElement;
} {
  const panel = document.createElement("div");
  panel.className = "player-boundary-minimap-panel";
  panel.style.display = "none";

  const label = document.createElement("span");
  label.className = "player-resource-label";
  label.textContent = "Boundary";

  const canvas = document.createElement("canvas");
  canvas.className = "player-boundary-minimap-canvas";
  canvas.width = MINIMAP_SIZE;
  canvas.height = MINIMAP_SIZE;
  const context = canvas.getContext("2d");

  const rangeValue = document.createElement("span");
  rangeValue.className = "player-resource-value";
  rangeValue.textContent = "Range 0m";

  panel.appendChild(label);
  panel.appendChild(canvas);
  panel.appendChild(rangeValue);
  return { canvas, context, panel, rangeValue };
}

function createMinimapPanel(): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D | null;
  panel: HTMLDivElement;
  rangeValue: HTMLSpanElement;
} {
  const panel = document.createElement("div");
  panel.className = "player-minimap-panel";

  const label = document.createElement("span");
  label.className = "player-resource-label";
  label.textContent = "Radar";

  const canvas = document.createElement("canvas");
  canvas.className = "player-minimap-canvas";
  canvas.width = MINIMAP_SIZE;
  canvas.height = MINIMAP_SIZE;
  const context = canvas.getContext("2d");

  const rangeValue = document.createElement("span");
  rangeValue.className = "player-resource-value";
  rangeValue.textContent = `Range ${DEFAULT_MINIMAP_RANGE}m`;

  panel.appendChild(label);
  panel.appendChild(canvas);
  panel.appendChild(rangeValue);
  return { canvas, context, panel, rangeValue };
}

function updateMinimap(
  minimap: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D | null;
    rangeValue: HTMLSpanElement;
  },
  snapshot: HudMinimapSnapshot | undefined
): void {
  const context = minimap.context;
  if (!context) {
    return;
  }

  const size = minimap.canvas.width;
  const half = size * 0.5;
  const range = Math.max(1, snapshot?.range ?? DEFAULT_MINIMAP_RANGE);
  minimap.rangeValue.textContent = `Range ${Math.round(range)}m`;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "rgba(6, 20, 42, 0.92)";
  context.fillRect(0, 0, size, size);

  context.strokeStyle = "rgba(120, 170, 210, 0.34)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, size - 1, size - 1);
  context.beginPath();
  context.moveTo(half, 8);
  context.lineTo(half, size - 8);
  context.moveTo(8, half);
  context.lineTo(size - 8, half);
  context.stroke();

  const rings = [0.33, 0.66, 1];
  for (const ring of rings) {
    context.beginPath();
    context.strokeStyle = "rgba(104, 155, 194, 0.2)";
    context.arc(half, half, half * ring - 6, 0, Math.PI * 2);
    context.stroke();
  }

  if (!snapshot) {
    drawPlayerDot(context, half, half);
    return;
  }

  const playerX = snapshot.playerPosition.x;
  const playerZ = snapshot.playerPosition.z;
  const playerYaw = snapshot.playerYawRadians ?? 0;
  const cosYaw = Math.cos(playerYaw);
  const sinYaw = Math.sin(playerYaw);
  const mapRadius = half - 8;
  const scale = mapRadius / range;

  for (const enemy of snapshot.enemies) {
    const dx = enemy.x - playerX;
    const dz = enemy.z - playerZ;
    const localX = dx * cosYaw - dz * sinYaw;
    const localZ = dx * sinYaw + dz * cosYaw;
    const mapX = half + localX * scale;
    const mapY = half + localZ * scale;
    const distanceFromCenter = Math.hypot(mapX - half, mapY - half);
    if (distanceFromCenter > mapRadius) {
      continue;
    }

    context.beginPath();
    context.fillStyle = "rgba(255, 122, 122, 0.95)";
    context.arc(mapX, mapY, 3.2, 0, Math.PI * 2);
    context.fill();
  }

  drawPlayerDot(context, half, half);
}

function updateBoundaryMinimap(
  minimap: {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D | null;
    panel: HTMLDivElement;
    rangeValue: HTMLSpanElement;
  },
  snapshot: HudBoundarySnapshot | undefined
): void {
  if (!snapshot) {
    minimap.panel.style.display = "none";
    return;
  }
  minimap.panel.style.display = "";

  const context = minimap.context;
  if (!context) {
    return;
  }

  const size = minimap.canvas.width;
  const half = size * 0.5;
  const hardRadius = Math.max(1, snapshot.hardRadius);
  const softRadius = THREEClamp(snapshot.softRadius, 0, hardRadius);
  const range = Math.max(hardRadius, snapshot.range ?? hardRadius + 6);
  minimap.rangeValue.textContent = `Range ${Math.round(range)}m`;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "rgba(5, 18, 40, 0.92)";
  context.fillRect(0, 0, size, size);

  context.strokeStyle = "rgba(120, 170, 210, 0.34)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, size - 1, size - 1);

  const mapRadius = half - 8;
  const scale = mapRadius / range;
  const softPixels = softRadius * scale;
  const hardPixels = hardRadius * scale;

  context.beginPath();
  context.strokeStyle = "rgba(105, 198, 255, 0.28)";
  context.lineWidth = 1.2;
  context.arc(half, half, softPixels, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.strokeStyle = "rgba(255, 153, 122, 0.72)";
  context.lineWidth = 1.4;
  context.arc(half, half, hardPixels, 0, Math.PI * 2);
  context.stroke();

  const dx = snapshot.playerPosition.x - snapshot.centerPosition.x;
  const dz = snapshot.playerPosition.z - snapshot.centerPosition.z;
  const playerX = half + dx * scale;
  const playerY = half + dz * scale;

  for (const enemy of snapshot.enemies) {
    const enemyDx = enemy.x - snapshot.centerPosition.x;
    const enemyDz = enemy.z - snapshot.centerPosition.z;
    const enemyX = half + enemyDx * scale;
    const enemyY = half + enemyDz * scale;
    const distanceFromCenter = Math.hypot(enemyX - half, enemyY - half);
    if (distanceFromCenter > mapRadius) {
      continue;
    }

    context.beginPath();
    context.fillStyle = "rgba(255, 122, 122, 0.95)";
    context.arc(enemyX, enemyY, 3.2, 0, Math.PI * 2);
    context.fill();
  }

  context.beginPath();
  context.fillStyle = "rgba(110, 222, 255, 1)";
  context.arc(playerX, playerY, 3.8, 0, Math.PI * 2);
  context.fill();
}

function drawPlayerDot(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.beginPath();
  context.fillStyle = "rgba(110, 222, 255, 1)";
  context.arc(x, y, 3.8, 0, Math.PI * 2);
  context.fill();
}

function THREEClamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createLayerRow(labelText: string, fillClassName: string): {
  row: HTMLDivElement;
  elements: LayerElements;
} {
  const row = document.createElement("div");
  row.className = "player-health-row";

  const label = document.createElement("span");
  label.className = "player-health-label";
  label.textContent = labelText;

  const value = document.createElement("span");
  value.className = "player-health-value";
  value.textContent = "0 / 0";

  const barTrack = document.createElement("div");
  barTrack.className = "player-health-track";

  const barFill = document.createElement("div");
  barFill.className = `player-health-fill ${fillClassName}`;
  barTrack.appendChild(barFill);

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(barTrack);

  return {
    row,
    elements: {
      value,
      fill: barFill
    }
  };
}

function updateLayer(elements: LayerElements, current: number, max: number): void {
  const clampedCurrent = Math.max(0, current);
  const clampedMax = Math.max(0, max);
  const ratio = clampedMax > 0 ? clampedCurrent / clampedMax : 0;

  elements.fill.style.width = `${Math.round(ratio * 100)}%`;
  elements.value.textContent = `${Math.round(clampedCurrent)} / ${Math.round(clampedMax)}`;
}

function setLayerRowVisible(row: HTMLDivElement, max: number): void {
  row.style.display = Math.max(0, max) > 0 ? "" : "none";
}

function updateVerticalHeat(
  elements: VerticalResourceElements,
  resourceSnapshot: ShipResourceSnapshot | undefined
): void {
  if (!resourceSnapshot || resourceSnapshot.heat.max <= 0) {
    elements.fill.style.height = "0%";
    elements.value.textContent = "N/A";
    elements.state.textContent = "";
    elements.meter.classList.remove("is-alert");
    return;
  }
  const clampedCurrent = Math.max(0, resourceSnapshot.heat.current);
  const clampedMax = Math.max(0, resourceSnapshot.heat.max);
  const ratio = clampedMax > 0 ? clampedCurrent / clampedMax : 0;
  elements.fill.style.height = `${Math.round(ratio * 100)}%`;
  elements.value.textContent = `${Math.round(clampedCurrent)} / ${Math.round(clampedMax)}`;
  if (resourceSnapshot.heat.overheated) {
    elements.state.textContent = "Overheated";
    elements.meter.classList.add("is-alert");
  } else {
    elements.state.textContent = "";
    elements.meter.classList.remove("is-alert");
  }
}

function updateVerticalEnergy(
  elements: VerticalResourceElements,
  resourceSnapshot: ShipResourceSnapshot | undefined
): void {
  if (!resourceSnapshot || resourceSnapshot.energy.max <= 0) {
    elements.fill.style.height = "0%";
    elements.value.textContent = "N/A";
    elements.state.textContent = "";
    elements.meter.classList.remove("is-alert");
    return;
  }
  const current = resourceSnapshot.energy.current;
  const max = Math.max(0, resourceSnapshot.energy.max);
  const ratio = max > 0 ? Math.max(0, Math.min(1, Math.max(0, current) / max)) : 0;
  elements.fill.style.height = `${Math.round(ratio * 100)}%`;
  elements.value.textContent = `${Math.round(current)} / ${Math.round(max)}`;
  if (resourceSnapshot.energy.lowPower) {
    elements.state.textContent = "Low Power";
    elements.meter.classList.add("is-alert");
  } else {
    elements.state.textContent = "";
    elements.meter.classList.remove("is-alert");
  }
}

function createVerticalResourceMeters(): {
  energy: VerticalResourceElements;
  heat: VerticalResourceElements;
  panel: HTMLDivElement;
} {
  const panel = document.createElement("div");
  panel.className = "player-resource-panel player-resource-verticals";

  const heat = createVerticalResourceMeter("Heat", "player-resource-fill-heat");
  const energy = createVerticalResourceMeter("Energy", "player-resource-fill-energy");

  panel.appendChild(heat.meter);
  panel.appendChild(energy.meter);

  return { heat, energy, panel };
}

function createVerticalResourceMeter(
  labelText: string,
  fillClassName: string
): VerticalResourceElements {
  const meter = document.createElement("div");
  meter.className = "player-resource-meter";

  const label = document.createElement("span");
  label.className = "player-resource-label";
  label.textContent = labelText;

  const track = document.createElement("div");
  track.className = "player-resource-track";

  const fill = document.createElement("div");
  fill.className = `player-resource-fill ${fillClassName}`;
  track.appendChild(fill);

  const value = document.createElement("span");
  value.className = "player-resource-value";
  value.textContent = "0 / 0";

  const state = document.createElement("span");
  state.className = "player-resource-state";
  state.textContent = "";

  meter.appendChild(label);
  meter.appendChild(track);
  meter.appendChild(value);
  meter.appendChild(state);

  return {
    fill,
    meter,
    state,
    value
  };
}

function createMissileRow(): {
  dots: HTMLSpanElement[];
  lockProgress: HTMLDivElement;
  progress: HTMLDivElement;
  row: HTMLDivElement;
  track: HTMLDivElement;
  value: HTMLSpanElement;
} {
  const row = document.createElement("div");
  row.className = "player-health-row player-missile-row";

  const label = document.createElement("span");
  label.className = "player-health-label";
  label.textContent = "Missiles";

  const value = document.createElement("span");
  value.className = "player-health-value player-missile-state";
  value.textContent = "Loaded";

  const track = document.createElement("div");
  track.className = "player-missile-track";

  const lockProgress = document.createElement("div");
  lockProgress.className = "player-missile-lock-progress";
  track.appendChild(lockProgress);

  const progress = document.createElement("div");
  progress.className = "player-missile-reload-progress";
  track.appendChild(progress);

  const dots: HTMLSpanElement[] = [];
  ensureMissileDotPool(track, dots, DEFAULT_MISSILE_DOT_COUNT);

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(track);

  return { dots, lockProgress, progress, row, track, value };
}

function createAbilityPanel(): AbilityPanelElements {
  const panel = document.createElement("div");
  panel.className = "player-ability-panel";
  panel.style.display = "none";

  const label = document.createElement("span");
  label.className = "player-health-label";
  label.textContent = "Equipment";

  const value = document.createElement("span");
  value.className = "player-health-value player-missile-state";
  value.textContent = "0 / 0";

  const status = document.createElement("span");
  status.className = "player-resource-state";
  status.textContent = "";

  const track = document.createElement("div");
  track.className = "player-ability-segment-track";

  panel.appendChild(label);
  panel.appendChild(value);
  panel.appendChild(track);
  panel.appendChild(status);

  return { label, panel, segments: [], status, track, value };
}

function updateMissiles(
  missile: {
    dots: HTMLSpanElement[];
    lockProgress: HTMLDivElement;
    progress: HTMLDivElement;
    row: HTMLDivElement;
    track: HTMLDivElement;
    value: HTMLSpanElement;
  },
  snapshot: MissileHudSnapshot | undefined
): void {
  if (!snapshot || snapshot.ammoCapacity <= 0) {
    missile.row.style.display = "none";
    return;
  }
  missile.row.style.display = "";

  const launcherCount = clampInt(snapshot.launcherCount, 1, MAX_MISSILE_DOT_COUNT);
  const cellsPerLauncher = clampInt(snapshot.cellsPerLauncher, 1, MAX_MISSILE_DOT_COUNT);
  const missileDotCount = clampInt(launcherCount * cellsPerLauncher, 1, MAX_MISSILE_DOT_COUNT);
  ensureMissileDotPool(missile.track, missile.dots, missileDotCount);
  missile.track.style.gridTemplateColumns = `repeat(${cellsPerLauncher}, minmax(0, 1fr))`;
  missile.track.style.minHeight = `${Math.max(14, launcherCount * 14 + (launcherCount - 1) * 4)}px`;

  const loadedByLauncher: number[] = [];
  const reloadingByLauncher: boolean[] = [];
  for (let launcherIndex = 0; launcherIndex < launcherCount; launcherIndex += 1) {
    const fromSnapshot = snapshot.launcherLoadedCounts[launcherIndex];
    loadedByLauncher.push(clampInt(fromSnapshot ?? 0, 0, cellsPerLauncher));
    reloadingByLauncher.push(Boolean(snapshot.launcherReloadingFlags[launcherIndex]));
  }

  for (let i = 0; i < missile.dots.length; i += 1) {
    const dot = missile.dots[i];
    if (i >= missileDotCount) {
      dot.style.display = "none";
      continue;
    }

    const launcherIndex = Math.floor(i / cellsPerLauncher);
    const cellIndex = i % cellsPerLauncher;
    const rowLoaded = loadedByLauncher[launcherIndex] ?? 0;
    const rowHasFiredCell = rowLoaded < cellsPerLauncher;
    const rowReloadCellIndex = rowLoaded;

    dot.style.display = "";
    dot.className = "player-missile-dot";
    if (cellIndex < rowLoaded) {
      dot.classList.add("is-loaded");
    } else {
      dot.classList.add("is-fired");
    }
    if (reloadingByLauncher[launcherIndex] && rowHasFiredCell && cellIndex === rowReloadCellIndex) {
      dot.classList.add("is-reloading");
    }
    if (snapshot.firedFlashSeconds > 0 && rowHasFiredCell && cellIndex === rowLoaded) {
      dot.classList.add("is-flash");
    }
  }

  const lockProgress01 =
    snapshot.lockedTargetCount > 0
      ? 1
      : Math.min(1, Math.max(0, snapshot.lockingProgress01));
  missile.lockProgress.style.width = `${Math.round(lockProgress01 * 100)}%`;
  missile.progress.style.width = `${Math.round(snapshot.reloadProgress01 * 100)}%`;

  const statusFlags: string[] = [];
  if (snapshot.lockedTargetCount > 0) {
    statusFlags.push(`Locked x${snapshot.lockedTargetCount}`);
  } else if (snapshot.isLocking) {
    statusFlags.push("Locking");
  }
  if (snapshot.firedFlashSeconds > 0) {
    statusFlags.push("Fired");
  }
  if (snapshot.isReloading) {
    statusFlags.push("Reloading");
  }
  if (statusFlags.length === 0) {
    statusFlags.push("Loaded");
  }

  missile.value.textContent = `${snapshot.ammoLoaded}/${snapshot.ammoCapacity} (${launcherCount}x${cellsPerLauncher}) ${statusFlags.join(" ")}`;
}

function updateBuiltInAbilityPanel(
  ability: AbilityPanelElements,
  snapshot: PlayerBuiltInEquipmentAbilityHudSnapshot | null
): void {
  if (!snapshot || snapshot.chargesMax <= 0) {
    ability.panel.style.display = "none";
    return;
  }
  ability.panel.style.display = "";
  ability.label.textContent = snapshot.label;

  const chargesMax = clampInt(snapshot.chargesMax, 1, 16);
  ensureAbilitySegmentPool(ability.track, ability.segments, chargesMax);
  ability.track.style.gridTemplateColumns = `repeat(${chargesMax}, minmax(0, 1fr))`;

  for (let i = 0; i < ability.segments.length; i += 1) {
    const segment = ability.segments[i];
    if (i >= chargesMax) {
      segment.segment.style.display = "none";
      continue;
    }
    segment.segment.style.display = "";
    segment.segment.classList.remove("is-loaded", "is-reloading", "is-empty");
    const progress01 = THREE.MathUtils.clamp(snapshot.chargeProgress01BySlot[i] ?? 0, 0, 1);
    segment.fill.style.width = `${Math.round(progress01 * 100)}%`;
    if (progress01 >= 0.999) {
      segment.segment.classList.add("is-loaded");
    } else if (progress01 <= 0.001) {
      segment.segment.classList.add("is-empty");
    } else {
      segment.segment.classList.add("is-reloading");
    }
  }

  const chargesAvailableText = Number.isInteger(snapshot.chargesAvailable)
    ? `${snapshot.chargesAvailable}`
    : snapshot.chargesAvailable.toFixed(1);
  ability.value.textContent = `${chargesAvailableText} / ${snapshot.chargesMax}`;

  if (snapshot.statusLabel) {
    ability.status.textContent =
      snapshot.isRecharging && snapshot.nextChargeSecondsRemaining > 0.0001
        ? `${snapshot.statusLabel} ${snapshot.nextChargeSecondsRemaining.toFixed(1)}s`
        : snapshot.statusLabel;
  } else if (snapshot.isRecharging) {
    ability.status.textContent = `Recharging ${snapshot.nextChargeSecondsRemaining.toFixed(1)}s`;
  } else {
    ability.status.textContent = "Ready";
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ensureMissileDotPool(
  track: HTMLDivElement,
  dots: HTMLSpanElement[],
  requiredCount: number
): void {
  for (let i = dots.length; i < requiredCount; i += 1) {
    const dot = document.createElement("span");
    dot.className = "player-missile-dot";
    track.appendChild(dot);
    dots.push(dot);
  }
}

function ensureAbilitySegmentPool(
  track: HTMLDivElement,
  segments: AbilitySegmentElements[],
  requiredCount: number
): void {
  for (let i = segments.length; i < requiredCount; i += 1) {
    const segment = document.createElement("div");
    segment.className = "player-ability-segment";
    const fill = document.createElement("div");
    fill.className = "player-ability-segment-fill";
    segment.appendChild(fill);
    track.appendChild(segment);
    segments.push({ fill, segment });
  }
}
