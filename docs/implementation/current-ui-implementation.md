# Current UI Implementation

This document describes the current UI architecture and behavior in the prototype.

## UI Entry Points

- App bootstrap: `src/main.ts`
- Main application shell: `src/game/GameApp.ts`
- Main menu system: `src/game/ui/MainMenu.ts`
- Ship preview renderer: `src/game/ui/ShipCarouselPreview.ts`
- In-game health HUD: `src/game/ui/PlayerHealthHud.ts`
- Styles: `src/styles/main.css`

## View Flow

Current menu view state machine (`MenuView` in `MainMenu.ts`):

1. `start`
2. `mode-select`
3. `ship-select`
4. `ship-confirm`

Flow:

- Start -> Mode Select -> Ship Select -> Ship Confirm -> Launch Player Test
- Back buttons return to previous menu state.

## Ship Select Screen

Purpose:

- Pick ship only.
- Show fixed equipped weapon components on right panel (read-only in this view).

Layout:

- Left: 3D ship carousel preview (previous/current/next).
- Bottom actions: `Previous`, `Confirm`, `Next`, `Back`.
- Right panel: read-only cannon instance summary with current `Primary Fire` component.
- Right panel: read-only missile bay instance summary with current `Payload` component.
- Note that editing happens in Ship Confirm.

Implementation references:

- `showShipSelectMenu` in `src/game/ui/MainMenu.ts`
- `refreshShipSelectContent` in `src/game/ui/MainMenu.ts`
- CSS: `.ship-select-layout-primary`, `.menu-action-row`

## Ship Confirm (Equipment) Screen

Purpose:

- Final ship confirmation.
- Component slot selection and component swap flow.

Layout:

- Left panel: selected component stats.
- Center: selected ship preview.
- Right panel: component slots and change workflow.

Current component workflow:

1. Select `Cannons Primary Fire` or `Missile Bay Payload` slot.
2. `Change Component` button appears.
3. Clicking opens overlay picker panel over the right panel only.
4. Hover/focus component option previews stats in the left panel.
5. Select option to equip and close picker.

Implementation references:

- `showShipConfirmMenu` in `src/game/ui/MainMenu.ts`
- `refreshShipConfirmContent` in `src/game/ui/MainMenu.ts`
- `renderSelectedComponentStats` in `src/game/ui/MainMenu.ts`
- CSS: `.component-panel-column`, `.component-picker-overlay`, `.component-picker-overlay-open`

## Input and Focus Behavior

### Keyboard

- Ship Select:
  - `A`/`D` cycles ships.
- Global menu focus:
  - Arrow keys move focus.
  - `Enter` activates focused control.
  - `Escape` closes component picker (on confirm screen).

### Mouse

- Click buttons directly.
- Hovering/focusing component options updates stat preview while picker is open.

### Controller (Menu)

- Left stick navigates focus (deadzone + repeat timing).
- A button confirms/activates focused control.
- Focus uses `data-focusable="true"` elements and `menu-focus` CSS class.

### In-Game Controller

- Movement: left stick controls forward/back and strafe.
- Turning: keyboard uses `Q`/`E`; controller auto-turn recentering is used when side-stick input is not active.
- Aim: mouse or right stick controls reticle.
- Fire: right bumper on controller, plus mouse button weapon inputs.

Implementation references:

- `handleControllerFrame` in `src/game/ui/MainMenu.ts`
- `refreshFocusables`, `moveFocus`, `applyFocus` in `src/game/ui/MainMenu.ts`

## Ship Preview UI

`ShipCarouselPreview` renders ships to a dedicated menu canvas using Three.js.

Modes:

- `carousel`: previous/current/next visible.
- `single`: only center ship visible.

Visual setup:

- Pedestal per slot.
- Continuous model rotation.
- Selected pedestal emissive pulse.
- Cached model loading by URL.

Implementation references:

- `src/game/ui/ShipCarouselPreview.ts`

## In-Game UI

Current in-game UI elements:

- Player health HUD (shield/armor/hull bars): `src/game/ui/PlayerHealthHud.ts`
- Missile status row in player HUD with per-bay/cell missile dots, reload bar, lock bar, and lock/reload/fire status text.
- Aim reticles (input reticle and true aim reticle): `src/game/scenes/factories/ReticleFactory.ts`
- World-space lock indicator sprites for locked targets, including lock count badge for stack-lock payloads.

HUD root is attached in `TopDownScene` and disposed with scene lifecycle.

## Styling Notes

All current UI styles are centralized in:

- `src/styles/main.css`

Main style sections:

- Menu overlay/panel/buttons
- Ship selection and confirm layouts
- Component picker overlay
- Responsive behavior (`@media (max-width: 980px)`)
- Player health HUD

## Known Scope Limits (Current)

- Ship Select screen does not allow component editing.
- Equipment flow currently edits weapon component selection only (no stat point allocation yet).
- Cannon secondary fire is intentionally not implemented in the current design pass.
- Energy launcher has placeholder catalog data but no active gameplay implementation.
- No dedicated pause/settings UI yet.
