import type { HealthSnapshot } from "../components/HealthComponent";

type LayerElements = {
  value: HTMLSpanElement;
  fill: HTMLDivElement;
};

type MissileHudSnapshot = {
  ammoCapacity: number;
  ammoLoaded: number;
  cellsPerLauncher: number;
  chargeInitialDelaySeconds: number;
  chargeSeconds: number;
  chargeStepSeconds: number;
  firedFlashSeconds: number;
  isCharging: boolean;
  launcherCount: number;
  isReloading: boolean;
  queuedShots: number;
  reloadProgress01: number;
};

const DEFAULT_MISSILE_DOT_COUNT = 10;
const MAX_MISSILE_DOT_COUNT = 20;

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

  const progress = document.createElement("div");
  progress.className = "player-missile-reload-progress";
  track.appendChild(progress);

  const dots: HTMLSpanElement[] = [];
  for (let i = 0; i < MAX_MISSILE_DOT_COUNT; i += 1) {
    const dot = document.createElement("span");
    dot.className = "player-missile-dot";
    track.appendChild(dot);
    dots.push(dot);
  }

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(track);

  return { dots, progress, row, track, value };
}

function updateMissiles(
  missile: {
    dots: HTMLSpanElement[];
    progress: HTMLDivElement;
    track: HTMLDivElement;
    value: HTMLSpanElement;
  },
  snapshot: MissileHudSnapshot | undefined
): void {
  if (!snapshot || snapshot.ammoCapacity <= 0) {
    missile.value.textContent = "No Launcher";
    missile.progress.style.width = "0%";
    missile.track.style.gridTemplateColumns = `repeat(${DEFAULT_MISSILE_DOT_COUNT}, minmax(0, 1fr))`;
    missile.track.style.minHeight = "14px";
    for (const dot of missile.dots) {
      dot.className = "player-missile-dot";
      dot.style.display = "";
    }
    return;
  }

  const launcherCount = clampInt(snapshot.launcherCount, 1, MAX_MISSILE_DOT_COUNT);
  const cellsPerLauncher = clampInt(snapshot.cellsPerLauncher, 1, MAX_MISSILE_DOT_COUNT);
  const missileDotCount = clampInt(launcherCount * cellsPerLauncher, 1, MAX_MISSILE_DOT_COUNT);
  missile.track.style.gridTemplateColumns = `repeat(${cellsPerLauncher}, minmax(0, 1fr))`;
  missile.track.style.minHeight = `${Math.max(14, launcherCount * 14 + (launcherCount - 1) * 4)}px`;

  const loadedRatio = snapshot.ammoLoaded / Math.max(1, snapshot.ammoCapacity);
  const loadedDots = clampInt(Math.round(loadedRatio * missileDotCount), 0, missileDotCount);
  const holdChargedShots = snapshot.isCharging
    ? snapshot.chargeSeconds >= snapshot.chargeInitialDelaySeconds
      ? Math.max(
          1,
          1 +
            Math.floor(
              (snapshot.chargeSeconds - snapshot.chargeInitialDelaySeconds) /
                Math.max(0.01, snapshot.chargeStepSeconds)
            )
        )
      : 0
    : 0;
  const chargedDots = clampInt(snapshot.queuedShots + holdChargedShots, 0, missileDotCount);
  const flashDotIndex =
    snapshot.firedFlashSeconds > 0 && loadedDots < missileDotCount ? loadedDots : -1;
  const reloadDotIndex =
    snapshot.isReloading && loadedDots < missileDotCount ? loadedDots : missileDotCount - 1;

  for (let i = 0; i < missile.dots.length; i += 1) {
    const dot = missile.dots[i];
    if (i >= missileDotCount) {
      dot.style.display = "none";
      continue;
    }
    dot.style.display = "";
    dot.className = "player-missile-dot";
    if (i < loadedDots) {
      dot.classList.add("is-loaded");
    } else {
      dot.classList.add("is-fired");
    }
    if (i < chargedDots) {
      dot.classList.add("is-charged");
    }
    if (i === reloadDotIndex && snapshot.isReloading) {
      dot.classList.add("is-reloading");
    }
    if (i === flashDotIndex) {
      dot.classList.add("is-flash");
    }
  }

  missile.progress.style.width = `${Math.round(snapshot.reloadProgress01 * 100)}%`;

  const statusFlags: string[] = [];
  if (snapshot.isCharging) {
    statusFlags.push("Charging");
  }
  if (chargedDots > 0) {
    statusFlags.push(`Charged ${chargedDots}`);
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
