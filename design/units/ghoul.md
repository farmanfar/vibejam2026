---
id: ghoul
name: Ghoul
faction: Monster
class: Grunt
tier: 1
hp: 3
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `GHOUL`
Canvas: 52x33 px (HORIZ)

Label: `ASEPRITE` (green) — clean Aseprite load, no fallback or errors.

Small, compact sprite. Standard load without issues.

## Animations

From AnimTester readout (tag — frame count):

- spawn — 11F
- walk — 9F
- death — 8F
- attack — 7F (red)
- hit — 4F
- wake — 4F
- static idle — 1F

## Abilities

**Undead Persistence (Faction Synergy).** When Ghoul dies, she has a **10% base
chance to reanimate at the back of the lineup** instead of being permanently
removed. This reanimation chance **increases by 10% for each additional Monster**
on your team (i.e., 2 Monsters = 20% chance, 3 Monsters = 30%, etc.).

If reanimation procs, Ghoul is placed at the back of your team's lineup with
full HP and resumes combat.

Tier 1 monster grunt with moderate durability (3 HP) and low damage (1). The
reanimation mechanic rewards stacking Monsters — building a Monster-heavy comp
grants access to pseudo-resurrection mechanics. Synergizes heavily with other
Monster-class units.

## Rendering Notes

- **Spawn:** has `spawn` (11F) — uses this as the spawn animation (entering
  the lineup). Also has `wake` (4F) which may relate to reanimation recovery
  (triggering when rejoining the lineup).
- **Death:** has `death` (8F) → roster eligible, plays `death` animation before
  reanimation check. If reanimation procs, `wake` may play as the recovery
  animation at the back of line.
- **Attack animation:** uses `attack` (7F, red) — standard melee attack.
- **Movement:** `walk` (9F) — locomotion animation.
- **Idle:** `static idle` (1F) — dormant standing frame.
- **Damage received:** `hit` (4F) — brief feedback when taking damage.
