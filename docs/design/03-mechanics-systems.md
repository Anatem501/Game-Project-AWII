# 03 - Mechanics and Systems

List core mechanics, dependencies, and balancing assumptions.

## Current Implementation

- Player controller is implemented in `src/game/controllers/PlayerController.ts` and now handles input/aim responsibilities separately from ship movement.
- Ship movement and rotation behavior is implemented in `src/game/controllers/ShipController.ts`.
- Camera follow behavior is implemented in `src/game/controllers/CameraController.ts`.
- Gun orchestration is implemented in `src/game/controllers/GunController.ts` and supports any number of ship hardpoints.
- Projectile behaviors are modular via projectile factories in `src/game/controllers/projectiles/` (laser bolts are the current default).
- Ship definitions are data-driven via `src/game/ships/ShipCatalog.ts` and can provide per-ship handling and hardpoint configuration.
- Ship rig setup in `src/game/scenes/factories/PlayerFactory.ts` supports ship-specific hardpoint counts and local offsets.
- Current player test supports keyboard and mouse control with top-down ship movement and aiming reticles.

## Weapon Module Model (Design Notes)

- A `weapon` is a ship weapon module.
- There are two weapon module types: `Gun` and `Launcher`.
- Both are component-driven and use socketed weapon components.
- `Gun` supports:
- `Primary Fire` component (current test behavior: laser bolt firing).
- `Secondary Fire` component (required by design, to be implemented).
- `Launcher` supports:
- A `Payload` component only (projectile/fire mode fired by the launcher).
- Weapon components should be interchangeable when they fit the target weapon type/socket.
- Current test ship loadout: 2 `Gun` modules, 0 `Launcher` modules.
- Additional module families will be documented in later design updates.

## Equipment Module Model (Design Notes)

- Ships have `Equipment Modules` separate from weapon modules.
- Current equipment categories (expandable): `Defensive`, `Mobility`, `General`.
- Equipment modules can be either:
- `Passive` modules: always on, provide stat upgrades or persistent benefits.
- `Active` modules: require an assigned activation input and only provide effects while active.
- Each ship may have a different number of equipment module slots.
- Ships may also include `Built-In Modules` in addition to equippable modules.
- Built-in modules are fixed to the ship and cannot be removed.
- Future feature under consideration: per-ship limits/caps for module categories (for example speed-focused or defense-focused constraints).
- Current test ship state: `0` equipment slots, and no equipment modules equipped.

## Future Support (Potential)

- Gamepad/controller input support may be added later.
- Local co-op support may be added later.
- Peer-to-peer network multiplayer support may be added later.
- Additional projectile types and per-gun fire behaviors may be added later.
