---
id: minion_002
name: Minion #002
faction: Robot
class: Grunt
tier: 1
hp: 1
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `MINION 2`
Heuristic label: (top entry, partially cut off in red; appears to be ~8F)
Canvas: 13x15 px

## Animations

From AnimTester readout (tag — frame count):

- (heuristic, cut off) — 8F (likely attack or death; top entry obscured)
- run — 8F
- prep_explode — 4F

> Top animation label is cut off; likely the main heuristic animation
> (possibly death or attack). Verify label when screenshot is clarified.

## Abilities

**Volatile Payload.** On death, Minion #002 explodes in a 2-range radius
burst: deals 2 damage to all enemy units within 2 range **in front** (forward
direction) AND deals 2 damage to all allied units within 2 range **behind**
(backward direction). Friendly fire applies — this is an indiscriminate
detonation.

Synergizes with expendable strategies (Folk sacrifice buffs, high-churn
compositions). The prep_explode animation triggers as the death detonation
winds up.

## Rendering Notes

- **Separate explosion sprite:** The explosion effect uses a distinct sprite
  sheet called `minion_2_parent` (not embedded in this unit's sprite). When
  Minion #002 dies, play `prep_explode` (4F) as a wind-up, then spawn and
  play the explosion effect from the parent sprite at the minion's position.
- Spawn: has `run` — uses `run` locomotion (8F) to enter the lineup slot
  from off-screen (per [README.md](README.md) spawn rules).
- Death: explosion replaces normal death animation. The `prep_explode` is
  the death trigger visual.
- Melee (range 1) — low-cost cannon fodder with AoE death payoff.
