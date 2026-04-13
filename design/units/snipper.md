---
id: snipper
name: Snipper
faction: Monster
class: Assassin
tier: 1
hp: 1
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `MEDIUM BUG`
Heuristic label: `ATTACK` (red highlighted)
Canvas: 34x37 px

## Animations

From AnimTester readout (tag — frame count):

- attack — 10F (heuristic)
- death — 10F
- idle_move — 8F

> Combined `idle_move` tag suggests either a resting-locomotion hybrid or
> display artifact. Verify if this is a single animation or should be split.

## Abilities

Quick assassin. High attack (2) for tier 1, but fragile (1 HP). Assassin class
mechanics TBD — likely poison or burst-damage synergies from Big Bug tribe.

## Rendering Notes

- Spawn: has `idle_move` — unclear if this is locomotion or resting state.
  Uses available animation to enter the lineup slot (per
  [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` (10F) on KO.
- Melee (range 1) — quick attacker, high damage output for cost.
