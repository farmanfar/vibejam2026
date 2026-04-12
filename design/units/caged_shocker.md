---
id: caged_shocker
name: Caged Demon
faction: Monster
class: Knight
tier: 2
hp: 2
attack: 3
range: 1
---

## Sprite Source

AnimTester title: `CAGED SHOCKER`
Canvas: 220x210 px (HORIZ)

**STATUS: ANIMATIONS GLITCHED** — AnimTester failed to cleanly parse the
spritesheet. Error: `ASEPRITE CANVAS 192X192 DID NOT DIVIDE CAGED SHOCKER 1(8X42).PNG USED`

Tag-derived fallback applied, but animation list is corrupted and unreadable.
**Animation data must be reparsed from the source `.aseprite` file** before this
unit can be finalized.

## Animations

**⚠️ INCOMPLETE — requires reparse from source .aseprite**

AnimTester output was corrupted. Once the .aseprite export is fixed, copy the
clean animation tag list here in `- tag — NF` format.

## Abilities

**Spiteful Demise.** When Caged Demon dies, she deals **1 damage to a random
enemy** on the opposing team before being removed from the battlefield. This is
a final spite mechanic — even in defeat, she deals guaranteed damage output.

Tier 2 offensive unit. Low health (2), high damage (3), glass cannon archetype.
The death mechanic punishes units that focus-kill her — she guarantees chip
damage on exit. Synergizes with comps that benefit from "die to trigger
something" mechanics.

## Rendering Notes

- **Spawn:** animations unknown until reparse. Standard spawn priority will
  apply once tag list is complete (check for `appear` → `jump`/`fall` → `run`/`walk`/`idle`).
- **Death:** animations unknown. Will be roster-eligible once `death` tag is
  confirmed in reparse. Spiteful Demise mechanic fires on KO, before death
  animation plays.
- **Attack animation:** unknown. Will be assigned once animations are reparsed.
- **Pending clarification:** cage mechanic and "demon" fantasy — any associated
  animations (bound state, cage break, summon)? Clarify with sprite designer
  once .aseprite is fixed.

**ACTION ITEM:** Reparse this unit's `.aseprite` file and update the Animations
section with the full tag list once glitch is resolved.
