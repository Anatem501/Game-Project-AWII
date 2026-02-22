# 03 - Mechanics and Systems

List core mechanics, dependencies, and balancing assumptions.

## Current Implementation

- Player controller is implemented in `src/game/controllers/PlayerController.ts` and now handles input/aim responsibilities separately from ship movement.
- Ship movement and rotation behavior is implemented in `src/game/controllers/ShipController.ts`.
- Camera follow behavior is implemented in `src/game/controllers/CameraController.ts`.
- Gun orchestration is implemented in `src/game/controllers/GunController.ts` and supports any number of ship hardpoints.
- Missile bay orchestration is implemented in `src/game/controllers/MissileBayController.ts` with multi-bay, per-cell launch behavior.
- Projectile behaviors are modular via projectile factories in `src/game/controllers/projectiles/` (laser bolts are the current default).
- Ship definitions are data-driven via `src/game/ships/ShipCatalog.ts` and can provide per-ship handling and hardpoint configuration.
- Ship rig setup in `src/game/scenes/factories/PlayerFactory.ts` supports ship-specific hardpoint counts and local offsets.
- Current player test supports keyboard/mouse and controller input with top-down movement and aiming reticles.
- Locking and target indicator systems are active for missile payloads that define lock behavior.

## Weapon Module Model (Design Notes)

- A `weapon` is a ship weapon module.
- There are two weapon module types: `Gun` and `Launcher`.
- Both are component-driven and use socketed weapon components.
- `Gun` currently supports `Primary Fire` components (laser-based implementations are active).
- `Launcher` currently supports `Payload` components (missile bay payload behavior).
- Weapon components should be interchangeable when they fit the target weapon type/socket.
- Current prototype ships include both cannon mounts and missile bay launchers.
- Current missile payloads: `Concussive Barrage missiles` (straight-flight/homing lock behavior) and `Concussive Swarm Missiles` (multi-missile spline-flight with lock-stack targeting).
- Weapon components now support per-action `heatCost` and `energyCost` values for resource-driven behavior.
- Additional module families will be documented in later design updates.

## Heat + Energy Systems (Current Design Contract)

- Heat and energy are ship-level resource systems used by weapons/equipment.
- Heat grows from `heatCost` actions and incoming `Plasma` damage.
- Heat cooling has a short delay after recent heat gain (`400ms` default).
- If heat exceeds max, overheat begins:
  - cannons are disabled immediately;
  - all heat-cost systems are disabled;
  - heat clears to zero over a forced `3s` clear window;
  - systems reactivate only when heat reaches zero.
- Energy decreases from `energyCost` actions and can go negative to `-50%` of max by default.
- Energy recharge has a delay after recent energy spend (`800ms` default).
- At `energy <= 0`, low-power penalties apply:
  - weapon fire interval multiplier is `2x`;
  - energy-based equipment is disabled.
- Current resource-linked weapons:
  - `Repeating Plasmabolt Fire` (heat),
  - `Repeating Laserbolt Fire` (energy),
  - `Repeating Ionbolt Fire` (energy),
  - `Concussive Swarm Missiles` (heat),
  - `Concussive Barrage Missiles` (no cost).
- Detailed implementation guidance and extension checklist are documented in `docs/implementation/resource-systems-design.md`.

## Equipment Module Model (Design Notes)

- Ships have `Equipment Modules` separate from weapon modules.
- Current equipment categories (expandable): `Defensive`, `Mobility`, `General`.
- Equipment modules can be either passive (always-on bonuses) or active (input-driven effects).
- Each ship may have a different number of equipment module slots.
- Ships may also include `Built-In Modules` in addition to equippable modules.
- Built-in modules are fixed to the ship and cannot be removed.
- Future feature under consideration: per-ship limits/caps for module categories (for example speed-focused or defense-focused constraints).
- Current test ship state: `0` equipment slots, and no equipment modules equipped.

## Future Support (Potential)

- Local co-op support may be added later.
- Peer-to-peer network multiplayer support may be added later.
- Additional projectile/payload families and energy launcher gameplay are planned.

## Rogue Pilot Boundary + Enemy Behavior Plan

- Rogue Pilot mode uses an invisible circular arena to keep encounters contained.
- Boundary model:
  - soft radius: ships are gradually nudged inward.
  - hard radius: ships are clamped to guarantee containment.
- Current implementation priority is player containment. Existing static test enemies can be clamped, but moving enemy behaviors are not yet implemented.
- Planned moving-enemy behavior:
  - assign each enemy a `home` anchor (spawn position).
  - enemy state machine: `engage`, `return-home`, `hard-leash-correct`.
  - when outside combat leash or target is lost, enemy returns to `home`.
  - when outside max leash, enemy uses immediate hard-leash correction.
- Goal: keep targets near encounter space so enemies can reacquire the player quickly and avoid drifting far from spawn.
