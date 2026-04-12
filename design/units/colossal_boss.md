---
id: colossal_boss
name: Sleeping Giant
faction: Robot
class: Ancient
tier: 4
hp: 6
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `COLOSSAL BOSS`
Canvas: 201x94 px (HORIZ)

Label: `HEURISTIC` (green) — no explicit error banner. Non-standard canvas size
(201x94 does not conform to 192x192 grid).

## Animations

From AnimTester readout (tag — frame count):

- move — 24F
- melee attack — 23F (red-flagged)
- death — 21F
- range attack — 21F
- super attack — 18F (primary attack animation)
- buff — 13F (faction synergy feedback)
- wake — 12F (activation animation)
- turnaround to left — 8F
- boomarang arms — 7F
- spin charge — 7F
- turnaround to right — 7F
- spin charge end — 3F
- body solo for boomarang — 1F
- static sleep — 1F (dormant state)

## Abilities

**Omnidirectional Slam.** Sleeping Giant attacks all living enemies
simultaneously for 1 damage each, using the `super attack` animation (18F).
Unlike most units that target a single foe, her slam radius hits the entire
enemy lineup. Damage output scales with enemy density.

**Ancient Resonance (Faction Synergy).** Whenever ANY unit with the Ancient
class deals damage to an enemy on your team, ALL OTHER Ancients on your team
permanently gain **+1 attack to their ability** for the rest of the battle.
Sleeping Giant plays the `buff` animation (13F) when receiving this buff stack,
and the bonus is cumulative — multiple Ancients acting creates multiplicative
bonuses.

Tier 4 tanky support unit. High health (6), low damage (1), but acts as a
force multiplier for other Ancient-class units. Synergizes heavily with
Ancient-heavy team compositions (e.g., Archer, Blood King, other Ancients).

## Rendering Notes

- **Spawn (non-standard):** Sleeping Giant does NOT use the standard spawn
  animations. Instead, the unit begins the battle already on the field in
  `static sleep` (1F dormant, asleep state). When conditions to activate are
  met (trigger TBD — possibly turn 1, or event-based), plays `wake` (12F) to
  transition into active combat. This is a special exception to the normal
  spawn priority rules — no off-screen entry animation.
- **Death:** has `death` (21F) → roster eligible, plays `death` animation on KO.
- **Attack animation:** uses `super attack` (18F) to deliver the omnidirectional
  slam to all enemies.
- **Synergy feedback:** `buff` (13F) plays whenever Sleeping Giant receives a +1
  attack bonus from any Ancient dealing damage (whether on her turn or an ally's).
- **Unused mechanics:** `melee attack` (23F, red-flagged) — unclear purpose;
  possibly intended as a single-target fallback attack (TBD). `range attack`
  (21F) — unused. `boomarang arms` (7F) + `body solo for boomarang` (1F) suggest
  a detachable/armless variant mechanic (unused; clarify with designer).
- **Movement:** `move` (24F), `turnaround to left` (8F), `turnaround to right` (8F),
  `spin charge` (7F), `spin charge end` (3F) — handle locomotion and positioning.
