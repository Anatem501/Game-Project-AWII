# Resource Systems Design (Heat + Energy)

This document defines the current design contract for ship resource systems so future weapon/system work stays consistent.

## Scope

- Heat system behavior and constraints.
- Energy system behavior and constraints.
- Integration points in current code.
- Extension rules for new weapons/systems.
- Clarifying questions to ask before implementation.

## Core Concepts

- `Heat` represents thermal load from heat-based actions and plasma impacts.
- `Energy` represents power budget for energy-based actions.
- Resources are currently managed by `src/game/components/ShipResourceComponent.ts`.

## Heat System

### Inputs

- Weapon/equipment `heatCost` (from component definitions).
- Incoming `Plasma` damage converted to heat using `plasmaHeatPerDamage`.

### Normal Cooling

- Heat does not start cooling immediately after heat is added.
- Cooling starts only after `heatDissipationDelaySeconds` has elapsed since the last heat gain.
- Current default delay: `0.4s` (400ms).

### Overheat Trigger

- Overheat starts when `heat > maxHeat`.

### Overheat Lock Behavior

- Cannons are disabled while overheated.
- Any weapon/system that requires heat (cost `heatCost > 0`) is disabled while overheated.

### Overheat Clear Behavior

- Overheat uses a forced clear timer (not normal cooling).
- Heat is reduced to zero over exactly `3.0s` (linear clear).
- While this forced clear is active, additional heat is ignored.
- Systems reactivate only after heat reaches zero and overheat ends.

## Energy System

### Consumption

- Weapon/equipment `energyCost` reduces current energy.
- Energy can go negative down to `-maxEnergy * minEnergyRatio`.
- Current default minimum ratio: `0.5` (energy floor = `-50%` of max).

### Recharge

- Energy does not recharge immediately after energy spend.
- Recharge starts only after `energyRechargeDelaySeconds` has elapsed since last energy spend.
- Current default delay: `0.8s` (800ms).

### Low-Power Penalties

- Low-power state is active when `energy <= 0`.
- Weapon fire interval multiplier becomes `2x`.
- Energy-based equipment usage should be blocked while low-power is active.

## Current Weapon Cost Mapping

- `Repeating Plasmabolt Fire`: heat-based.
- `Repeating Laserbolt Fire`: energy-based.
- `Repeating Ionbolt Fire`: energy-based.
- `Concussive Swarm Missiles`: heat-based.
- `Concussive Barrage Missiles`: no heat/energy cost.

Authoritative cost data lives in `src/game/weapons/WeaponComponentCatalog.ts`.

## Runtime Integration Points

- `src/game/components/ShipResourceComponent.ts`:
  - Resource state, delays, overheat clear, penalties.
- `src/game/controllers/GunController.ts`:
  - Calls cost consumption per shot.
  - Applies fire-interval multiplier for low power.
- `src/game/controllers/MissileBayController.ts`:
  - Calls cost consumption per launcher salvo.
  - Applies fire-interval multiplier for low power.
- `src/game/scenes/TopDownScene.ts`:
  - Instantiates resource components.
  - Wires cannon/launcher cost callbacks.
  - Applies plasma-hit heat to enemies.
- `src/game/ui/PlayerHealthHud.ts` + `src/styles/main.css`:
  - Displays health + vertical heat/energy meters.

## Rules For Adding New Weapons Or Systems

1. Define explicit `heatCost` and `energyCost` in component data.
2. Decide whether the new system should be blocked by:
   - overheat (`heatCost > 0` behavior), or
   - low power (`energy <= 0` behavior), or both.
3. Wire resource checks in controller logic before action execution.
4. Ensure timing penalties are applied from resource state, not duplicated locally.
5. Update HUD only if player-facing feedback is required.
6. Update this doc and `docs/design/03-mechanics-systems.md` when behavior contracts change.

## Clarifying Questions Checklist (Ask Before Implementing)

Use these for any new resource-driven weapon/system:

1. What resource does it use (`heat`, `energy`, both, or neither)?
2. What is the per-use cost and when is the cost applied (on trigger, per shot, per burst, on hit)?
3. Should it be disabled by overheat?
4. Should it be disabled by low power?
5. Should low power change its cadence, effectiveness, or both?
6. If overheat happens during use, should in-flight/queued actions continue or cancel?
7. Does incoming damage interact with this resource?
8. Should the system have separate cooldown/recovery rules from global resource rules?
9. What HUD/FX feedback is required for blocked state and recovery?
10. Are AI ships expected to use identical rules, or a different resource profile?

## Validation Checklist

- Cost is consumed exactly once per intended action.
- Delay timers reset on each relevant spend/gain event.
- Overheat lock applies to all intended systems and no unintended systems.
- Overheat clear always ends with heat `0`.
- Low-power penalties activate at `energy <= 0` and clear at `energy > 0`.
- Build passes and no controller regressions are introduced.
