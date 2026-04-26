---
id: colossal_boss
name: Sleeping Giant
faction: Robot
class: Ancient
tier: 4
hp: 6
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `COLOSSAL BOSS`
Canvas: 201x94 px (HORIZ)

Label: `HEURISTIC` (green) — no explicit error banner. Non-standard canvas size
(201x94 does not conform to 192x192 grid).

## Animations

From AnimTester readout (tag — frame count):

- move — 24F
- melee attack — 23F (red-flagged)
- death — 21F
- range attack — 21F
- super attack — 18F (primary attack animation)
- buff — 13F (faction synergy feedback)
- wake — 12F (activation animation)
- turnaround to left — 8F
- boomarang arms — 7F
- spin charge — 7F
- turnaround to right — 7F
- spin charge end — 3F
- body solo for boomarang — 1F
- static sleep — 1F (dormant state)

## Abilities

Sleeping Giant has no unique unit ability handler. Her offensive profile is
**the Ancient class mechanic in full**: Ancient AoE basic attack plus
Ancient Resonance stacking.

**Omnidirectional Slam (Ancient class AoE basic attack).** In place of a
normal single-target attack, Sleeping Giant's basic action deals 1 damage
(plus her current Resonance stacks) to every living enemy. Uses the
`super attack` animation (18F). This is not a unique unit ability — every
Ancient-class unit's "basic attack" is an Ancient AoE (Ancient Guardian's
laser, Archer's volley, Blood King's death Heart Slam).

**Ancient Resonance (Ancient class synergy).** Whenever any Ancient-class
unit on the team deals damage (basic attack OR ability), every OTHER
Ancient on that team gains +1 Resonance stack, capped at 3 stacks per
Ancient. Resonance stacks add directly to effective ATK for damage
calculations. An Ancient never gains a stack from her own action — only
from other Ancients'. Stack gain is one per action, not per damage
instance (Sleeping Giant's AoE hitting 5 enemies grants 1 stack to each
other Ancient, not 5). Sleeping Giant plays the `buff` animation (13F)
when receiving a stack.

Tier 4 tanky support unit. High health, low base damage, but acts as a
force multiplier for Ancient-heavy compositions.

## Rendering Notes

- **Spawn:** Sleeping Giant acts from round 1 like any other Ancient — she
  is NOT dormant in combat. The `static sleep` (1F) and `wake` (12F) tags
  are available for out-of-combat / menu flavor use only. In battle, she
  uses standard spawn priority (locomotion fallback since no `appear` is
  present) and begins attacking on round 1.
- **Death:** has `death` (21F) → roster eligible, plays `death` animation on KO.
- **Attack animation:** uses `super attack` (18F) to deliver the omnidirectional
  slam to all enemies.
- **Synergy feedback:** `buff` (13F) plays whenever Sleeping Giant receives a +1
  attack bonus from any Ancient dealing damage (whether on her turn or an ally's).
- **Unused mechanics:** `melee attack` (23F, red-flagged) — unclear purpose;
  possibly intended as a single-target fallback attack (TBD). `range attack`
  (21F) — unused. `boomarang arms` (7F) + `body solo for boomarang` (1F) suggest
  a detachable/armless variant mechanic (unused; clarify with designer).
- **Movement:** `move` (24F), `turnaround to left` (8F), `turnaround to right` (8F),
  `spin charge` (7F), `spin charge end` (3F) — handle locomotion and positioning.
