---
id: hog_knight
name: Hog Knight
faction: Folk
class: Knight
tier: 2
hp: 3
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `TRIBE HUNTER`
Heuristic label: `TRIBE HUNTER` (green ASEPRITE tag)
Canvas: 34x37 px

## Animations

From AnimTester readout (tag — frame count):

- tribe_hunter — 17F (heuristic)
- death — 17F
- walk — 10F
- shoot — 7F
- idle — 6F

> Directional variants (walk_down/up, shoot_down/up, idle_down/up) exist in
> the source but are not used. Using base animations only.

## Abilities

**Ricochet Shot.** Mounted ranged attacker. Whenever an enemy unit dies on
the field, Hog Knight automatically shoots the next living enemy in line,
dealing 1 damage to them (regardless of whether Hog Knight is in the front
row or positioned behind). The shot arcs/bounces over ally heads to reach
distant targets.

Creates a chaining mechanic: enemy KOs trigger immediate counter-damage to
the next foe. Synergizes with high-kill-rate comps (Folk warriors that die
and buff subsequent units, creating a cascade of damage chains).

## Rendering Notes

- **Mounted unit with directional shots:** Hog Knight is mounted (animation
  shows rider on a creature). The `shoot` variants (down/up/neutral) should
  fire at different angles. When the next enemy is killed, the mounted unit
  shoots toward that new target's position, animating the projectile path
  over allies' heads to reach it.
- Spawn: has `walk` (and variants) — uses `walk` locomotion (10F) to enter
  the lineup slot from off-screen (per [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` (17F) on KO.
- Attack range: range 1 means melee slot, but ranged projectile delivery via
  the ricochet mechanic.
