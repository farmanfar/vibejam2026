---
id: blaster_bot
name: Blaster Bot
faction: Robot
class: Gunner
tier: 1
hp: 2
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `STARTER HERO`
Heuristic label: `IDLE` (red highlighted; "HERO (36)" container visible)
Canvas: 32x32 px

**STATUS: ANIMATIONS BROKEN — user flagged for reprocessing**

Error in AnimTester metadata: gun sprite metadata unuseable; fell back to
secondary. Gun sprite file: `GUN SPRITE BLUE.PNG` (separate asset).

## Animations

**ALL BROKEN — need reprocessing**

From AnimTester readout (tag — frame count; structure is complex):

- gun_sprite — 1F (multiple variants: gun_sprite, gun_sprite_pink)
- idle — 5F (appears 6+ times; red heuristic)
- move_left/right — 4F (appears 6 times)
- down — 8F (appears 5 times; possibly shoot_down or similar, unclear)

> Animation structure is heavily duplicated with directional/variant tags
> (left/right, down). All flagged as broken. Metadata parsing errors on
> gun sprite integration. Entire sprite requires reprocessing.

## Abilities

Ranged gunner. Gun sprite is tied to this unit — a separate asset
(`GUN_SPRITE_BLUE.PNG`) that must be rendered alongside Blaster Bot's body
animations (likely on a separate layer or anchored to the unit).

Mechanics TBD pending animation reprocessing and gun sprite integration work.

## Rendering Notes

- **Separate gun sprite:** The unit uses `GUN_SPRITE_BLUE.PNG` as a distinct
  layer (gun/weapon rendered separately from body). Metadata for this
  integration is broken; will need wiring in the rendering system.
- Spawn: has `move_left/right` variants — unclear which is primary. Cannot
  spawn until animations reprocessed. If using directional movement (like
  TorchWars-style), use left/right based on direction; otherwise consolidate
  to a base `move` animation.
- Death: no explicit death animation visible in list — **likely missing**.
  Sprite must have a `down` or `death` animation added.
- Gunner class (range 1 default — confirm if ranged unit should be range 2+).
