---
id: minion_003
name: Minion #003
faction: Robot
class: Grunt
tier: 2
hp: 1
attack: 2
range: 3
---

## Sprite Source

AnimTester title: `MINION 3`
Heuristic label: `RANGE ATTACK` (top of the animation list, partially cut
off in the screenshot — frame count `15F` matches the `F10/15` playback
indicator, confirming the heuristic-selected animation is `range_attack`)
Canvas: 25x15 px

## Animations

From AnimTester readout (tag — frame count):

- range_attack — 15F (heuristic)
- idle — 8F
- run — 8F
- death — 7F

## Abilities

**Lobbed Bolt.** Ranged attacker that fires a lobbed (arcing/parabolic)
projectile at an enemy up to 3 tiles away. No piercing, no splash — single
target. Simple ranged grunt to pair with Minion #001's melee front line.

## Rendering Notes

- **Projectile sprite:** `MINION 3 PROJECTILE` (26x53 px, 2F)
  - idle — 2F (in-flight state)
  - explode — 6F (on-impact state)
  - Trajectory is **lobbed (arcing/parabolic)**, not straight. Arc apex
    height scales with distance. Use the idle frame during flight, explode
    frame on impact.
- Uses the `range_attack` animation for firing (rotation toward target may
  still apply — TBD based on sprite orientation).
- Spawn: no `appear`, no `jump`/`fall` — uses `run` locomotion to enter
  the lineup slot from off-screen (per [README.md](README.md) spawn
  rules).
- Death: has `death` → eligible for the roster, plays `death` on KO.
