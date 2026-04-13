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

**Ricochet Shot (unique unit ability, `on_enemy_death`).** Whenever ANY
enemy unit dies, from ANY source — Hog Knight's attack, another ally's
attack, a death trigger chain, poison tick, Volatile Payload blast — Hog
Knight reactively fires one 1-damage shot at the next living enemy in
the opposing lineup. The trigger does not require Hog Knight to have
dealt the kill herself. It fires once per enemy death, regardless of
Hog Knight's slot position.

The reactive shot itself does NOT trigger Bloodlust / Kill Piercing /
other on-kill effects from Hog Knight herself (only her basic attack
action does). If the reactive shot kills the next enemy, that death
fires its own triggers and can in turn fire Hog Knight's Ricochet Shot
again — the chain is bounded by the number of living enemies.

Creates a chain-damage mechanic: enemy KOs trigger immediate
counter-damage to the next foe. Synergizes with AoE compositions
(Ancient class), death-trigger units, and Folk sacrifice buffs.

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
