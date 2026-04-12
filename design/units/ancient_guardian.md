---
id: ancient_guardian
name: Ancient Guardian
faction: Robot
class: Ancient
tier: 3
hp: 6
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `ANCIENT GUARDIAN`
Heuristic label: `LASER` (red highlighted)
Canvas: 166x96 px

Note: Spritesheet dimensions (166x96) do not conform to standard grid
(192x192); metadata fallback applied.

## Animations

From AnimTester readout (tag — frame count):

- (top entry, partially obscured) — 24F (likely idle or similar)
- blast — 24F
- idle — 24F
- laser — 24F (heuristic, AoE attack animation)
- death — 12F
- tele — 12F
- guardian — 8F
- appear — 8F (spawn animation)

## Abilities

**Omnidirectional Pulse.** Instead of a normal single-target attack, Ancient
Guardian fires a laser that damages **all living enemies on the field for 1
damage each**, regardless of position or range. Uses the `laser` animation
for the attack trigger.

Tier 3 support/control unit. Synergizes with high-enemy-count comps (forces
them to spread out or die to cascading 1-damage hits). Low attack (1) per
target, but AoE scales with enemy density.

## Rendering Notes

- **Attack animation:** uses `laser` (24F, not `blast`). Render as a wide-arc
  laser beam or pulse effect that hits all enemies simultaneously.
- Spawn: has `appear` → uses `appear` spawn animation (8F) to materialize in
  place at the lineup slot (per [README.md](README.md) spawn rules).
- Death: has `death` (12F) → eligible for the roster, plays `death` on KO.
- Teleport: has `tele` (12F) — mechanical use TBD (repositioning? Teleport
  ability? Clarify if this is a unit ability or animation artifact).
- Guardian state: `guardian` (8F) tag is unusual; may be a stance or shield
  state. Clarify usage.
