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
#002 hurls her payload forward and deals **2 damage to the opponent's
frontmost alive unit**. Single target — no friendly fire, no
multi-slot blast, no backward splash.

If the blast is lethal, the killed target is appended to the SAME death
batch queue and fires its own `on_faint` handler in slot order before
compaction. This means Minion #002's blast can still chain into Starter
Warrior's Sacrifice Pass, Blood King's Heart Slam, another Minion #002's
Volatile Payload, etc. — one batch, one compaction at the end.

The `prep_explode` animation (4F) plays as the death wind-up; then the
separate `minion_2_parent` explosion sprite spawns on the enemy front
unit to sell the hit.

If there is no living enemy at the moment Minion #002 dies (e.g. she
died to a poison tick after her last opponent fell), the ability fizzles
— the log records the attempt but no damage is applied.

Synergizes with chip-damage compositions that want to pop a fat
frontliner: her death shaves 2 off the enemy tank regardless of how
many allies are left standing.

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
