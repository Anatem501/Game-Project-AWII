type MainMenuHandlers = {
  onStart: () => void;
  onBackToStart: () => void;
  onPlayerTest: () => void;
};

export class MainMenu {
  private readonly overlay: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly handlers: MainMenuHandlers;

  constructor(parent: HTMLElement, handlers: MainMenuHandlers) {
    this.handlers = handlers;

    this.overlay = document.createElement("div");
    this.overlay.className = "menu-overlay";

    this.panel = document.createElement("div");
    this.panel.className = "menu-panel";

    this.overlay.appendChild(this.panel);
    parent.appendChild(this.overlay);
  }

  showStartMenu(): void {
    this.show(
      `
      <h1>AWII Prototype</h1>
      <p>Build and test your ship systems.</p>
      <button class="menu-button" data-action="start">Start</button>
    `
    );
  }

  showModeSelect(): void {
    this.show(
      `
      <h1>Mode Select</h1>
      <p>Choose a mode to launch.</p>
      <button class="menu-button" data-action="player-test">Player Test</button>
      <button class="menu-button menu-button-secondary" data-action="back">Back</button>
    `
    );
  }

  hide(): void {
    this.overlay.style.display = "none";
  }

  private show(content: string): void {
    this.overlay.style.display = "grid";
    this.panel.innerHTML = content;
    this.wireButtons();
  }

  private wireButtons(): void {
    const start = this.panel.querySelector<HTMLButtonElement>('[data-action="start"]');
    const back = this.panel.querySelector<HTMLButtonElement>('[data-action="back"]');
    const playerTest = this.panel.querySelector<HTMLButtonElement>('[data-action="player-test"]');

    if (start) {
      start.addEventListener("click", () => this.handlers.onStart());
    }

    if (back) {
      back.addEventListener("click", () => this.handlers.onBackToStart());
    }

    if (playerTest) {
      playerTest.addEventListener("click", () => this.handlers.onPlayerTest());
    }
  }
}
