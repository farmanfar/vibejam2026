---
id: slopper
name: Slopper
faction: Monster
class: Assassin
tier: 2
hp: 5
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `MEDIUM BUG 2`
Heuristic label: `ATTACK` (red highlighted)
Canvas: 88x37 px

## Animations

From AnimTester readout (tag — frame count):

- death — 11F
- attack — 8F (heuristic)
- idle_move — 8F
- medium2_bug — 8F

> Combined `idle_move` tag suggests either a resting-locomotion hybrid or
> display artifact. `medium2_bug` tag is unusual; may be a stray heuristic
> label or variant. Verify if both should be retained or if one is a
> duplicate/metadata artifact.

## Abilities

Tank assassin. Inverts the typical tier 2 profile: high durability (5 HP)
but low damage (1 attack). Synergizes with Big Bug tribe defenses. Assassin
class mechanics (poison, burst, or utility) TBD.

## Rendering Notes

- Spawn: has `idle_move` — unclear if this is locomotion or resting state.
  Uses available animation to enter the lineup slot (per
  [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` (11F) on KO.
- Melee (range 1) — sturdy frontliner with low threat level, likely a
  support/debuff unit.
