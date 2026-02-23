# Enemy AI Architecture

This document defines the intended architecture direction for enemy ships so future work optimizes for reuse and scalability instead of only reducing file size.

## Goals

1. Reusable AI states across multiple enemy types
2. Data-driven behavior tuning per enemy type
3. Unique enemy behavior via pluggable actions/modules, not hardcoded branches in shared states
4. Clear separation between AI decision logic and ship movement/combat primitives

## Core Principles

## 1. States should be reusable and mostly generic

Shared states should describe behavior categories, not a specific enemy implementation.

Examples:

- `Spawn`
- `Patrol`
- `Engage`
- `Attack`
- `Flyby`
- `Evade`
- `Search`
- `Dead`

These states should rely on an agent interface and AI config data, not direct knowledge of a specific ship type.

## 2. AI behavior should be data-driven per enemy type

Enemy-specific behavior tuning belongs in enemy AI data (archetype/config), not embedded in state code.

Examples of data that should live in config:

- Sensor ranges (`passiveSensorRange`, `passiveSensorLoseRange`)
- Aim vision (`aimVisionRange`, `aimVisionFovRadians`)
- Attack ranges / disengage ranges
- State timings (`searchHoldSeconds`, flyby duration, evade duration)
- Evade probabilities and cooldowns
- Maneuver tuning (strafe switch counts/intervals)

This allows changing enemy behavior without rewriting state logic.

## 3. Unique behavior should come from pluggable actions/modules

Unique enemy identity should come from capabilities and actions, not from special-casing shared states.

Examples:

- `LaserBurstAttackAction`
- `MissileVolleyAttackAction`
- `MineDropAction`
- `RamAction`
- `ChargedBeamAction`

Shared states (especially `Attack` and `Engage`) should call generic attack/action interfaces, while each enemy type provides different action implementations and config.

## 4. Keep AI state logic separate from actor movement/combat primitives

The enemy ship actor (`EnemyCannonShip` or future ship actors) should expose movement/combat primitives and sensing hooks.

Examples:

- `faceTarget(...)`
- `updatePatrolMovement(...)`
- `updateEngageMovement(...)`
- `updateAttackMovement(...)`
- `buildFlybyTargetPoint(...)`
- `updateEvadeMovement(...)`

State modules should own state-specific runtime variables (timers/phases), while the actor owns reusable ship motion and combat execution.

## 5. State runtime belongs in the state (when it is behavior-specific)

Behavior-specific timers and phases should live in the state module instead of the ship actor.

Examples:

- `Flyby` phase (`approach` / `turnback`)
- `Flyby` timer
- `Evade` timer
- `Evade` strafe sign / switch timers

This keeps the actor reusable and prevents it from accumulating AI-state-specific fields.

## 6. Extract shared subsystems as reusable components

When a responsibility is shared across enemies, extract it into a reusable module.

Current examples:

- Flight model / banked turning (`EnemyShipFlightController`)
- Burst attack sequencing (`EnemyBurstWeaponController`)
- Projectile lifecycle (`EnemyProjectileRuntime`)
- Perception/target tracking (`EnemyShipPerceptionController`)
- Patrol routing (`CenterPassEdgePatrolPlanner`)
- Muzzle visuals (`EnemyShipMuzzleRig`)
- Model/socket/outline utilities (`EnemyShipModelRigUtils`)

## What To Avoid

- Hardcoding enemy-specific behavior inside shared state modules
- Embedding tuning constants directly in state code when they should be configurable
- Letting actor classes accumulate many AI-only timers/phases
- Creating one giant generic enemy class with many `if enemyType === ...` branches

## Recommended Pattern For New Enemies

1. Create or reuse a ship actor that implements the shared AI agent interface.
2. Define enemy AI data/config for ranges, timings, probabilities, and action selection.
3. Reuse shared states where possible.
4. Add unique actions/modules for enemy identity.
5. Create state variants only when behavior truly diverges and cannot be expressed through data + actions.

## Current Direction (Design Intent)

- Optimize for reusable states and modular actions first.
- Optimize file size/line count only when it improves architecture boundaries.
- Prefer data-driven behavior differences over duplicated state logic.
