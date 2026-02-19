import type { HealthSnapshot } from "../components/HealthComponent";

type LayerElements = {
  value: HTMLSpanElement;
  fill: HTMLDivElement;
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

const DEFAULT_MISSILE_DOT_COUNT = 10;
const MAX_MISSILE_DOT_COUNT = 64;

export type PlayerHealthHud = {
  update: (snapshot: HealthSnapshot, missileSnapshot?: MissileHudSnapshot) => void;
  dispose: () => void;
};

export function createPlayerHealthHud(root: HTMLElement): PlayerHealthHud {
  const container = document.createElement("div");
  container.className = "player-health-hud";

  const shield = createLayerRow("Shield", "player-health-fill-shield");
  const armor = createLayerRow("Armor", "player-health-fill-armor");
  const hull = createLayerRow("Hull", "player-health-fill-hull");
  const missile = createMissileRow();

  container.appendChild(shield.row);
  container.appendChild(armor.row);
  container.appendChild(hull.row);
  container.appendChild(missile.row);
  root.appendChild(container);

  const update = (snapshot: HealthSnapshot, missileSnapshot?: MissileHudSnapshot): void => {
    updateLayer(shield.elements, snapshot.shield.current, snapshot.shield.max);
    updateLayer(armor.elements, snapshot.armor.current, snapshot.armor.max);
    updateLayer(hull.elements, snapshot.hull.current, snapshot.hull.max);
    updateMissiles(missile, missileSnapshot);
  };

  const dispose = (): void => {
    container.remove();
  };

  return { update, dispose };
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

function updateMissiles(
  missile: {
    dots: HTMLSpanElement[];
    lockProgress: HTMLDivElement;
    progress: HTMLDivElement;
    track: HTMLDivElement;
    value: HTMLSpanElement;
  },
  snapshot: MissileHudSnapshot | undefined
): void {
  if (!snapshot || snapshot.ammoCapacity <= 0) {
    missile.value.textContent = "No Launcher";
    missile.lockProgress.style.width = "0%";
    missile.progress.style.width = "0%";
    missile.track.style.gridTemplateColumns = `repeat(${DEFAULT_MISSILE_DOT_COUNT}, minmax(0, 1fr))`;
    missile.track.style.minHeight = "14px";
    ensureMissileDotPool(missile.track, missile.dots, DEFAULT_MISSILE_DOT_COUNT);
    for (let i = 0; i < missile.dots.length; i += 1) {
      const dot = missile.dots[i];
      dot.className = "player-missile-dot";
      dot.style.display = i < DEFAULT_MISSILE_DOT_COUNT ? "" : "none";
    }
    return;
  }

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
