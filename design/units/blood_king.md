---
id: blood_king
name: Blood King
faction: Folk
class: Ancient
tier: 4
hp: 5
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `BLOOD KING`
Canvas: 168x79 px (VERT SPRITES)

**STATUS: BUGGED** — canvas dimensions (168x79) do not conform to standard grid
(192x192); tag-derived frame fallback applied. Error noted: `ASEPRITE CANVAS
168X79 DID NOT DIVIDE CHARGE TRANSITION DOWN (-40X32).P`.

## Animations

From AnimTester readout (tag — frame count):

- double slash — 14F (red)
- stab and spin throw with — 13F
- jump slam attack — 13F
- jump slam attack with — 13F
- idle — 12F
- teleport appear — 12F (spawn animation)
- death of teleport — 11F
- run — 8F
- finisher — 8F
- charge transition down — 6F
- charge — 6F
- charge transition up — 6F
- vfx for jump slam — 4F (red)
- jump — 4F
- fall — 4F
- stab and spin throw — 4F
- jump to fall trans — 2F
- hit > — 2F (red)
- vfx for double slash — 23 sprites (red)
- heart slam — 18 sprites (red)
- vfx for stab and spin throw — 12 sprites (non-standard notation)
- gore charge attack — 6 sprites (non-standard notation)

## Abilities

**Heart Slam on Death.** Blood King attacks normally for 2 damage using standard
melee attacks. **On death,** instead of falling, he disappears and triggers the
`heart slam` animation — a ground-shaking slam that deals **1 damage to all
living enemies** on the field as a final, revenge-style blow.

Tier 4 power unit with high base HP (5) and mid-tier damage (2). The death
mechanic provides guaranteed AoE damage if he falls, punishing concentrated
enemy comps and synergizing with units that scale on damage-dealt or enemy-KO
triggers.

## Rendering Notes

- **Spawn:** has `teleport appear` (12F) + `jump` (4F) + `fall` (4F) — uses
  `teleport appear` as primary spawn animation (priority 1, per CLAUDE.md spawn
  rules). Materializes in-place at the lineup slot.
- **Death:** has `death of teleport` (11F) → roster eligible. However, the
  **Heart Slam on Death** mechanic may intercept the normal death animation and
  trigger `heart slam` (18F, non-standard "sprites" notation) instead, dealing
  the AoE damage before final removal.
- **Attack animations:** `double slash` (14F, red) and `stab and spin throw`
  (4F) — unclear which is primary melee attack. Likely `double slash` (longer
  animation, more impactful).
- **Charge mechanic:** `charge`, `charge transition down`, `charge transition up`
  (6F each) — these suggest a possible future charge or stance system. Currently
  unused; clarify with designer if these are future mechanics or legacy tags.
- **Finisher animation:** `finisher` (8F) — possibly related to the Heart Slam
  mechanic or a high-combo finisher. Clarify usage.
- **Red-flagged entries:** `double slash`, `vfx for jump slam`, `hit >`,
  `vfx for double slash`, `heart slam` — review for correctness.
