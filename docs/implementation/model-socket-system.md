# Model Socket System

This document describes how ship model sockets are authored and how they are consumed at runtime.

## What Sockets Are Used For

- Cannon sockets drive gun hardpoint positions.
- Thruster sockets drive thruster VFX spawn positions and per-socket scale.
- Missile cell sockets drive missile launch cell positions, grouped by missile bay.

Current runtime consumers:

- `src/game/scenes/factories/PlayerFactory.ts`
- `src/game/scenes/TopDownScene.ts`
- `src/game/effects/PlayerThrusterEffect.ts`
- `src/game/controllers/MissileBayController.ts`

## Required Naming

Socket names are matched case-insensitively.

Supported cannon name pattern:

- `Cannon01`
- `Cannon02`
- `Cannon_03`
- `Cannon-04`
- Blender duplicates like `Cannon01.001`

Supported thruster name pattern:

- `Thruster01`
- `Thruster02`
- `Thruster_03`
- `Thruster-04`
- Blender duplicates like `Thruster01.001`

Supported missile cell name patterns:

- `MissileBay1Cell1`
- `Missile_Bay_1_Cell_2`
- `Missile-Bay-2-Cell-1`
- `MissileCell01` (implicitly bay 1)
- `Missile_04` (implicitly bay 1)
- Blender duplicates like `MissileBay1Cell1.001`

Matching rule in code:

- Prefix + numeric index is required.
- Optional `_` or `-` before index is allowed.
- Optional Blender duplicate suffix like `.001` is allowed.
- Missile cells can use explicit bay + cell naming (`MissileBay{n}Cell{m}`).
- Missile cells can also use cell-only naming (`MissileCell{m}`, `Missile{m}`), which maps to bay 1.

Implementation reference:

- `parseSocketIndex` in `src/game/scenes/factories/PlayerFactory.ts`
- `parseMissileCellSocketName` in `src/game/scenes/factories/PlayerFactory.ts`

## Runtime Pipeline

1. The ship model is loaded via `GLTFLoader`.
2. The model is uniformly scaled to a target size and re-centered to the ship root.
3. Cannon socket nodes are found, sorted by numeric index, and converted to local offsets.
4. Those offsets are copied onto pre-created gun hardpoints.
5. Thruster socket nodes are found the same way and sent to the thruster effect system.
6. Thruster socket scale is read from world scale and normalized by overall model scale.
7. Missile cell socket nodes are parsed by bay/cell index, grouped, sorted, and used to place missile launch cells.
8. Missile bay `maxCells` in `ShipCatalog` is applied as a cap when sockets exceed configured capacity.

Key references:

- `loadPlayerModel` in `src/game/scenes/factories/PlayerFactory.ts`
- `extractSocketLocalOffsets` in `src/game/scenes/factories/PlayerFactory.ts`
- `extractSocketSizeScales` in `src/game/scenes/factories/PlayerFactory.ts`
- `createPlayerThrusterEffect` in `src/game/effects/PlayerThrusterEffect.ts`

## Important Behavior

- Gun count is controlled by `gunHardpointLocalOffsets` length in `ShipCatalog`.
- Runtime applies `min(gunHardpoints.length, cannonSockets.length)`.
- If cannon sockets are missing and `autoAlignGunHardpointsToModel` is true, fallback auto-align is used.
- Thrusters always use socket offsets when present. If none are found, scene fallback offsets are used.
- Missile bays use socket offsets when found. If none are found, ship-level fallback offsets can be used.

So if a model has 4 cannon sockets but ship config defines 2 hardpoints, only the first 2 sockets are used.

## Blender Authoring Guidelines

Use Empty objects for sockets.

- Parent socket empties under the ship object.
- Apply transforms on the ship mesh before export.
- Keep forward axis consistent across models.
- Use consistent scale (avoid accidental per-socket scale unless intended for VFX size).
- Name sockets exactly by the patterns above.

Recommended minimal socket set for a new ship:

- `Cannon01`, `Cannon02`
- `Thruster01`, `Thruster02`
- If the ship has missile bays, add missile cell sockets such as `MissileBay1Cell1`, `MissileBay1Cell2`, ...

## Current Ship Config Notes

Ship catalog lives in:

- `src/game/ships/ShipCatalog.ts`

For socket-driven cannon placement, ships should use:

- `autoAlignGunHardpointsToModel: false`
- `gunHardpointLocalOffsets` with count matching expected cannon socket count

Thruster visuals can be tuned per ship with:

- `thrusterEffectScale`
- `thrusterTrailLengthScale`

## Troubleshooting

If cannons or thrusters look offset:

1. Verify socket names match supported patterns.
2. Verify socket parent is inside the ship hierarchy.
3. Confirm socket count matches configured gun hardpoint count.
4. Check for unapplied transforms in Blender.
5. Confirm model forward orientation is consistent with existing ships.

If thrusters look too large/small:

1. Adjust per-ship `thrusterEffectScale`.
2. Adjust per-ship `thrusterTrailLengthScale`.
3. Check socket object scale values in Blender.

If missile launch positions are wrong:

1. Verify missile sockets use supported names.
2. Confirm bay/cell numbering starts at 1 and is contiguous where expected.
3. Check `maxCells` on each ship missile bay definition in `ShipCatalog`.
4. Confirm sockets are parented under the ship hierarchy and exported in the GLB.
