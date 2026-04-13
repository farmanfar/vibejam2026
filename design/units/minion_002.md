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

**Volatile Payload (unique unit ability, `on_faint`).** On death, Minion
#002 detonates in both directions with explicit slot-distance semantics:

- **Forward blast:** deals 2 damage to every enemy in slots 0..range-1 of
  the opposing team, where range = 2. ("Forward" = toward the enemy side;
  after compaction, the frontmost 2 enemies.)
- **Backward blast:** deals 2 damage to every allied unit at slot-distance
  ≤ 2 behind Minion #002's own slot at the moment she died. "Backward" =
  toward her own team's back slots, i.e., slot indices higher than hers,
  within a 2-slot radius. Friendly fire is intentional.

Both blasts resolve as part of the same damage batch. Any new deaths
caused by either blast are appended to the SAME death batch queue and
fire their own `on_faint` handlers in slot-order before compaction. This
means Minion #002's blast can chain into Starter Warrior's Sacrifice
Pass, Blood King's Heart Slam, another Minion #002's Volatile Payload,
etc. — one batch, one compaction at the end.

The `prep_explode` animation (4F) plays as the death wind-up; then the
separate `minion_2_parent` explosion sprite spawns at her slot position.

Synergizes with expendable strategies (Folk sacrifice buffs, high-churn
compositions).

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
