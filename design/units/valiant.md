---
id: valiant
name: Valiant
faction: Folk
class: Knight
tier: 1
hp: 2
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `STARTER GUARD`
Heuristic label: `GUARD` (green ASEPRITE tag; appears to be a container/group)
Canvas: 32x32 px

**STATUS: BUGGED (red warning in AnimTester)**

## Animations

**ALL BROKEN — marked in red, need reprocessing**

From AnimTester readout (tag — frame count; note: all entries flagged):

- idle — 5F (broken, appears twice)
- run — 4F (broken, appears twice)
- attack — 5F (broken, appears twice)
- dead — 16F (broken, appears twice)

> All animations in red. Duplicates present. Entire sprite requires
> reprocessing before use.

## Abilities

**Kill Piercing.** Whenever Valiant kills an enemy unit with an attack, that
attack's damage continues past the target and hits the next living enemy in
line for 1 additional damage (same as Electrocutioner's inherent piercing,
but triggered only on kills, not always active).

Synergizes with Folk sacrifice/buff compositions — kills trigger both pierce
damage AND death-trigger buffs for subsequent units.

## Rendering Notes

- Spawn: has `run` (broken) — intended to use `run` locomotion to enter the
  lineup slot from off-screen (per [README.md](README.md) spawn rules).
  Cannot use until reprocessed.
- Death: has `dead` (broken) → intended to be eligible, but animation must
  be reprocessed.
- Melee (range 1) — defensive knight stance with conditional pierce.
