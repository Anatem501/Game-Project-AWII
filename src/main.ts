import "./styles/main.css";
import { GameApp } from "./game/GameApp";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) {
  throw new Error("Missing #app root element");
}

const app = new GameApp(root);
app.start();
