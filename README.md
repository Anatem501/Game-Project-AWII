# Game Project AWII

A fresh starter for a top-down 3D game prototype using:

- Vite
- TypeScript
- Three.js

## Quick Start

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` - Start local dev server
- `npm run build` - Create production build
- `npm run preview` - Preview production build locally

## Project Structure

- `src/main.ts` - App entry point
- `src/game/GameApp.ts` - Main game bootstrap
- `src/game/scenes/TopDownScene.ts` - Pure scene composition for factories/controllers
- `src/game/controllers/PlayerController.ts` - Player input + aim logic (separated from ship motion)
- `src/game/controllers/ShipController.ts` - Ship movement/rotation handling from configurable ship stats
- `src/game/controllers/CameraController.ts` - Follow camera behavior and smoothing
- `src/game/controllers/GunController.ts` - Modular gun orchestration for any number of hardpoints
- `src/game/controllers/projectiles/ProjectileTypes.ts` - Projectile factory interfaces
- `src/game/controllers/projectiles/LaserBoltFactory.ts` - Default laser projectile implementation
- `src/game/ships/ShipCatalog.ts` - Ship definitions and active ship selection data
- `src/game/scenes/factories/PlayerFactory.ts` - Ship rig/model creation and configurable gun hardpoints
- `src/game/ui/MainMenu.ts` - Start and mode select menus
- `docs/design/` - Design documents
