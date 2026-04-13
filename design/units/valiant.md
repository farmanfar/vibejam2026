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

**Kill Piercing.** Whenever Valiant kills an enemy with an attack, that
attack pierces past the target and deals **Valiant's current ATK value**
(not a flat 1) as pierce damage to the next living enemy in the opposing
lineup. "Current ATK" means Valiant's live stat at the moment of the kill,
including Knight Honorbound Stance synergy buffs — so a 3-Knight team
(+2/+2 static) would have a Valiant at 3 ATK piercing for 3.

If the pierce damage itself kills the next enemy, it does NOT chain
further — one kill, one pierce, done. This is an on-kill trigger from a
regular attack action only.

Synergizes with Knight-heavy comps (bigger ATK → bigger pierce) and Folk
sacrifice/buff compositions (kills trigger both pierce AND death-trigger
buffs for subsequent units).

## Rendering Notes

- Spawn: has `run` (broken) — intended to use `run` locomotion to enter the
  lineup slot from off-screen (per [README.md](README.md) spawn rules).
  Cannot use until reprocessed.
- Death: has `dead` (broken) → intended to be eligible, but animation must
  be reprocessed.
- Melee (range 1) — defensive knight stance with conditional pierce.
