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

Ghoul has no unique unit ability handler. Her identity is the **Monster
faction synergy**, of which she is the archetypal representative.

## Faction Synergy — Undead Persistence (Monster)

**Undead Persistence (Monster faction synergy, not a Ghoul unique).** Every
Monster on the team has a **10% base chance to reanimate** on death,
**+10% per OTHER Monster on the team**, capped at 50%. Solo Monster = 10%,
2 Monsters = 20%, 3 Monsters = 30%, 4 Monsters = 40%, 5+ Monsters = 50%.

> The "10% base + 10% per additional Monster" wording is preserved
> literally from the original Ghoul doc. Solo Monsters retain the 10% base
> rate; the rule generalizes to all Monsters, not just Ghoul.

On death, the dying Monster rolls the reanimate chance. If it procs AND
the alive count on her team is less than 5 (i.e., there's a back slot
available after compaction), she is placed at the back slot with full HP
and **acts starting the next round, not the round she reanimates**.

**Slot-order tiebreak:** if multiple Monsters die in the same damage
batch and both roll reanimate success, the lower-slot Monster claims the
back slot first. Subsequent Monsters in the same batch fail their
reanimate proc because no slot is available (batch emits a
`reanimate_failed_slot_full` event for them).

Tier 1 monster grunt with moderate durability and low damage. Synergizes
heavily with other Monsters — stacking the faction grants pseudo-resurrection
to the whole team.

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
