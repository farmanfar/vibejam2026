---
id: bloat_flyer
name: Bloat Flyer
faction: Big Bug
class: Assassin
tier: 2
hp: 4
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `BIG BUG`
Heuristic label: (top animation, partially cut off in screenshot — appears to be death or similar, red highlighted, 13F)
Canvas: 72x44 px

## Animations

From AnimTester readout (tag — frame count; note: top entry partially obscured):

- death (or similar) — 13F (red heuristic, partially cut off)
- move_idle (or move_hole) — 8F (text partially obscured)
- attack — 6F

> Top animation label is cut off; assumed to be death based on frame count
> and red selection highlight. Second animation label unclear from screenshot
> (MOVETOLE, MOVEHOLE, or MOVE_IDLE variant). May need clarification.

## Abilities

**Toxic Cascade.** Bloat Flyer coats enemies with poison on hit. Each
poisoned enemy has a stacking chance to bounce the poison to the next living
enemy upon death: 10% per poison stack, capped at 50% (5 stacks maximum).

Synergizes with high-kill-rate compositions (Berserkers, Folk death-triggers)
— the more enemy deaths, the more poison bounces, the more targets become
infected. Creates a spreading contagion loop.

## Rendering Notes

- Spawn: has `move`/`move_idle` — unclear which locomotion is primary. Uses
  available move/flight animation to enter the lineup slot from off-screen
  (per [README.md](README.md) spawn rules).
- Death: likely has `death` (13F top entry) → eligible for the roster. 
  Confirm animation label when screenshot is clarified.
- Poison visual: applies a status effect indicator on poisoned targets. On
  bounce (enemy death), animate the poison transferring to next target.
- Ranged or melee: range 1 assumed (not specified). If Bloat Flyer is meant
  to be ranged, confirm and update to range 2+.
