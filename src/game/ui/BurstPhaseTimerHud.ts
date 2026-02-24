export type BurstPhaseTimerHudSnapshot = {
  cycleSeconds: number;
  cycleTimeSeconds: number;
  phaseASeconds: number;
  phaseBSeconds: number;
  isFiringActive: boolean;
  lowPowerMultiplier?: number;
};

export type BurstPhaseTimerHud = {
  update: (snapshot: BurstPhaseTimerHudSnapshot | null) => void;
  dispose: () => void;
};

export function createBurstPhaseTimerHud(parent: HTMLElement): BurstPhaseTimerHud {
  const panel = document.createElement("div");
  panel.style.position = "absolute";
  panel.style.top = "10px";
  panel.style.left = "50%";
  panel.style.transform = "translateX(-50%)";
  panel.style.padding = "8px 10px";
  panel.style.minWidth = "300px";
  panel.style.border = "1px solid rgba(129, 186, 255, 0.28)";
  panel.style.background = "rgba(6, 12, 22, 0.84)";
  panel.style.color = "#d7ebff";
  panel.style.fontFamily = "Consolas, 'Courier New', monospace";
  panel.style.fontSize = "12px";
  panel.style.lineHeight = "1.35";
  panel.style.pointerEvents = "none";
  panel.style.zIndex = "210";

  const title = document.createElement("div");
  title.textContent = "Burst Ion Arc Phase (Azure Arrow)";
  title.style.fontWeight = "700";
  title.style.color = "#86c7ff";
  title.style.marginBottom = "4px";

  const statusLine = document.createElement("div");
  const timingLine = document.createElement("div");

  const barTrack = document.createElement("div");
  barTrack.style.position = "relative";
  barTrack.style.height = "8px";
  barTrack.style.marginTop = "6px";
  barTrack.style.border = "1px solid rgba(255,255,255,0.12)";
  barTrack.style.background = "rgba(255,255,255,0.05)";
  barTrack.style.overflow = "hidden";

  const phaseAStroke = document.createElement("div");
  phaseAStroke.style.position = "absolute";
  phaseAStroke.style.top = "0";
  phaseAStroke.style.width = "2px";
  phaseAStroke.style.height = "100%";
  phaseAStroke.style.background = "#77ffbd";

  const phaseBStroke = document.createElement("div");
  phaseBStroke.style.position = "absolute";
  phaseBStroke.style.top = "0";
  phaseBStroke.style.width = "2px";
  phaseBStroke.style.height = "100%";
  phaseBStroke.style.background = "#7ec0ff";

  const cursor = document.createElement("div");
  cursor.style.position = "absolute";
  cursor.style.top = "0";
  cursor.style.width = "3px";
  cursor.style.height = "100%";
  cursor.style.background = "#ffffff";
  cursor.style.boxShadow = "0 0 8px rgba(255,255,255,0.65)";

  barTrack.append(phaseAStroke, phaseBStroke, cursor);
  panel.append(title, statusLine, timingLine, barTrack);
  parent.append(panel);

  const setPercentLeft = (element: HTMLElement, value01: number): void => {
    const clamped = Math.min(1, Math.max(0, value01));
    element.style.left = `calc(${(clamped * 100).toFixed(2)}% - ${element === cursor ? 1 : 1}px)`;
  };

  const update = (snapshot: BurstPhaseTimerHudSnapshot | null): void => {
    if (!snapshot || snapshot.cycleSeconds <= 0) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "block";

    const cycleSeconds = Math.max(0.001, snapshot.cycleSeconds);
    const cycleTimeSeconds =
      ((snapshot.cycleTimeSeconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
    const phaseA = ((snapshot.phaseASeconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
    const phaseB = ((snapshot.phaseBSeconds % cycleSeconds) + cycleSeconds) % cycleSeconds;

    const nextA = cycleTimeSeconds <= phaseA ? phaseA - cycleTimeSeconds : cycleSeconds - cycleTimeSeconds + phaseA;
    const nextB = cycleTimeSeconds <= phaseB ? phaseB - cycleTimeSeconds : cycleSeconds - cycleTimeSeconds + phaseB;
    panel.style.opacity = snapshot.isFiringActive ? "1" : "0.6";
    statusLine.textContent = snapshot.isFiringActive
      ? `Live: t=${cycleTimeSeconds.toFixed(2)} / ${cycleSeconds.toFixed(2)}s`
      : `Paused: t=${cycleTimeSeconds.toFixed(2)} / ${cycleSeconds.toFixed(2)}s (hold fire)`;
    const multiplierText =
      snapshot.lowPowerMultiplier && snapshot.lowPowerMultiplier > 1
        ? ` | gap x${snapshot.lowPowerMultiplier.toFixed(2)}`
        : "";
    timingLine.textContent =
      `A@${phaseA.toFixed(2)}s (next ${nextA.toFixed(2)}s)  B@${phaseB.toFixed(2)}s (next ${nextB.toFixed(2)}s)` +
      multiplierText;

    setPercentLeft(phaseAStroke, phaseA / cycleSeconds);
    setPercentLeft(phaseBStroke, phaseB / cycleSeconds);
    setPercentLeft(cursor, cycleTimeSeconds / cycleSeconds);
  };

  update(null);

  return {
    update,
    dispose: () => {
      panel.remove();
    }
  };
}
