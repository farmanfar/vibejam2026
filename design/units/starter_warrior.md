---
id: starter_warrior
name: Warrior
faction: Folk
class: Grunt
tier: 1
hp: 1
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `STARTER WARRIOR`
Heuristic label: `IDLE` (green ASEPRITE tag)
Canvas: 32x32 px

## Animations

**STATUS: BROKEN — needs reprocessing**

From AnimTester readout (tag — frame count):

- idle — 5F (broken)
- run — 4F (broken)
- attack — 5F (broken)
- hit — 2F (broken)
- dead — 8F (broken)

> All animations for this sprite are corrupted and require reprocessing
> before use in-game. Mark with "f" suffix in future screenshots to flag
> similar issues.

## Abilities

**Sacrifice Pass.** When this unit dies, grant the unit directly behind it
(second slot in the lineup) +1 Attack permanently for the rest of battle.
Synergizes with Folk tribe compositions — creates a "chain sacrifice" loop
where expendable frontliners buff the ranks behind them.

Thematic anchor: cheap, disposable, high-value-death buff. Pairs well with
high-health backliners that benefit from the attack boost.

## Rendering Notes

- Spawn: no `appear`, no `jump`/`fall` — uses `run` locomotion (4F) to
  enter the lineup slot from off-screen (per [README.md](README.md) spawn
  rules).
- Death: has `dead` → eligible for the roster, plays `dead` on KO. Triggers
  the "Sacrifice Pass" buff to the unit in slot N+1 immediately on death.
- Melee (range 1) — basic warrior stance, straightforward attack animation.
