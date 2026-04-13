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

Blood King is the exception among Ancients: his **basic attack is still a
standard single-target melee strike** for his current ATK value (2 at base).
His Ancient class AoE fires specifically on death, not on attack.

**Heart Slam on Death (unique unit ability, `on_faint`).** When Blood King
dies, his death trigger fires the Ancient class AoE: deals
`1 + blood_king.resonanceStacks` damage to every living enemy. He stays
dead after the trigger (no Archer-style interrupt — this is revenge, not
survival). Uses the `heart slam` animation (18 sprites, non-standard
notation). Any new deaths caused by Heart Slam are appended to the SAME
death batch queue and resolve in slot order before compaction.

Blood King continues to participate in **Ancient Resonance** during his
life: when any OTHER Ancient deals damage, he gains a Resonance stack
(cap 5), and his Heart Slam benefits from those stacks on death. His own
basic melee attack also grants stacks to other Ancients.

Tier 4 power unit with high base HP and mid-tier damage. The death
mechanic provides guaranteed AoE damage if he falls, punishing concentrated
enemy comps and synergizing with other Ancients (who buff his Heart Slam
via Resonance) and death-trigger scalers.

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
