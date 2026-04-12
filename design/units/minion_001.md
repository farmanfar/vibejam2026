---
id: minion_001
name: Minion #001
faction: Robot
class: Grunt
tier: 1
hp: 1
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `MINION 1`
Canvas: 33x36 px

## Animations

From AnimTester readout (tag — frame count):

- attack — 10F
- death — 8F
- idle — 8F
- run — 8F

## Abilities

**None.** Simple melee grunt — no special mechanics, no triggered effects.
A baseline 1-cost body for filling out the Robot / Grunt tribes and eating
a hit. Exists to be buffed by synergies and star-ups, not to carry on its
own.

## Rendering Notes

- Spawn: no `appear`, no `jump`/`fall` — uses `run` locomotion to enter the
  lineup slot from off-screen (per [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` on KO.
- Melee (range 1) — walks or runs forward into contact with the enemy
  front.
