export type EnemyAiDebugSnapshot = {
  state: string;
  burstCooldownSecondsRemaining: number;
};

export type EnemyAiDebugPanel = {
  update: (snapshot: EnemyAiDebugSnapshot | null) => void;
  dispose: () => void;
};

export function createEnemyAiDebugPanel(parent: HTMLElement): EnemyAiDebugPanel {
  const panel = document.createElement("div");
  panel.style.position = "absolute";
  panel.style.top = "12px";
  panel.style.right = "12px";
  panel.style.padding = "10px 12px";
  panel.style.minWidth = "190px";
  panel.style.border = "1px solid rgba(255,255,255,0.18)";
  panel.style.background = "rgba(8, 13, 20, 0.82)";
  panel.style.color = "#d7e8ff";
  panel.style.fontFamily = "Consolas, 'Courier New', monospace";
  panel.style.fontSize = "12px";
  panel.style.lineHeight = "1.45";
  panel.style.pointerEvents = "none";
  panel.style.zIndex = "10";

  const title = document.createElement("div");
  title.textContent = "Enemy AI (Test)";
  title.style.fontWeight = "700";
  title.style.marginBottom = "6px";
  title.style.color = "#8fc7ff";

  const stateLine = document.createElement("div");
  const cooldownLine = document.createElement("div");

  panel.append(title, stateLine, cooldownLine);
  parent.append(panel);

  const update = (snapshot: EnemyAiDebugSnapshot | null): void => {
    if (!snapshot) {
      stateLine.textContent = "State: (none)";
      cooldownLine.textContent = "Burst CD: --";
      panel.style.opacity = "0.6";
      return;
    }

    panel.style.opacity = "1";
    stateLine.textContent = `State: ${snapshot.state}`;
    cooldownLine.textContent = `Burst CD: ${snapshot.burstCooldownSecondsRemaining.toFixed(2)}s`;
  };

  update(null);

  return {
    update,
    dispose: () => {
      panel.remove();
    }
  };
}
