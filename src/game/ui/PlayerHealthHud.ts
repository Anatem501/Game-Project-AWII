import type { HealthSnapshot } from "../components/HealthComponent";

type LayerElements = {
  value: HTMLSpanElement;
  fill: HTMLDivElement;
};

export type PlayerHealthHud = {
  update: (snapshot: HealthSnapshot) => void;
  dispose: () => void;
};

export function createPlayerHealthHud(root: HTMLElement): PlayerHealthHud {
  const container = document.createElement("div");
  container.className = "player-health-hud";

  const shield = createLayerRow("Shield", "player-health-fill-shield");
  const armor = createLayerRow("Armor", "player-health-fill-armor");
  const hull = createLayerRow("Hull", "player-health-fill-hull");

  container.appendChild(shield.row);
  container.appendChild(armor.row);
  container.appendChild(hull.row);
  root.appendChild(container);

  const update = (snapshot: HealthSnapshot): void => {
    updateLayer(shield.elements, snapshot.shield.current, snapshot.shield.max);
    updateLayer(armor.elements, snapshot.armor.current, snapshot.armor.max);
    updateLayer(hull.elements, snapshot.hull.current, snapshot.hull.max);
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
