# 05 - Technical Design

Outline architecture, tooling, performance targets, and risks.

## Runtime Containment (Rogue Pilot)

- Containment is handled in scene update after ship movement and before HUD/camera-dependent feedback.
- Arena uses a 2D circular boundary on the XZ plane:
  - soft radius for smooth inward correction.
  - hard radius for strict positional clamp.
- Implementation is mode-gated to Rogue Pilot so test-map behavior remains unchanged.
- Future moving-enemy integration plan:
  - reuse the same boundary utility for enemy roots.
  - add per-enemy leash radii and return-home behavior tied to spawn anchors.
  - keep enemy target selection bounded to improve player reacquisition consistency.
