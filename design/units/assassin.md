---
id: assassin
name: Swordknight
faction: Folk
class: Knight
tier: 3
hp: 3
attack: 1
range: 3
---

## Sprite Source

AnimTester title: `ASSASSIN`
Canvas: 91x19 px (VERT)

Label: `ASEPRITE` (green, direct Aseprite load — no fallback applied).

Note: non-standard canvas dimensions (91x19); sprite is narrow and horizontal,
not conforming to typical grid. Aseprite load successful without errors.

## Animations

From AnimTester readout (tag — frame count):

**⚠️ This spritesheet has significant issues:**
- Multiple duplicates (sweep_attack x2, run x2, attack x3, cross_slice x2, land x2)
- Multiple red-flagged entries (sweep_attack, idle, attack x2, cross_slice x2, attack x2, hit)
- Non-standard "sprites" notation (three entries use "sprites" instead of "F")

**Full list (verbatim from AnimTester):**

- sweep attack — 10F (red)
- sweep attack — 10F (red, duplicate)
- idle — 9F (red)
- death — 8F
- run — 8F
- run — 8F (duplicate)
- attack — 5F (red)
- attack — 5F (red, duplicate)
- cross slice — 5F (red)
- cross slice — 5F (red, duplicate)
- vfx for cross slice — 5F
- attack — 4F (red)
- vfx for land — 4F
- vfx for attack — 4F
- land — 4F
- jump — 4F
- fall — 4F
- attack — 4F (red)
- land — 4F (duplicate)
- hit — 2F (red)
- vfx for sweep attack — 10 sprites (non-standard notation)
- vfx for run — 8 sprites (non-standard notation)
- vfx for attack — 5 sprites (non-standard notation)

## Abilities

**Sweeping Strikes.** Swordknight attacks all 3 frontmost living enemies for
1 damage each, hitting them **simultaneously** using the `sweep attack`
animation. The range-3 mechanic means her sword swing arcs across the first,
second, and third enemy positions in the opposing lineup.

Tier 3 melee multi-target unit. Synergizes with comps that benefit from or
trigger off "hit all enemies" mechanics (global poison, global stuns, etc.).
Mid-tier DPS spread across multiple targets rather than focused.

## Rendering Notes

- **Spawn:** has `jump` (4F) + `fall` (4F) but no `appear` — uses jump/fall entry
  animation per CLAUDE.md spawn priority (Priority 2). Sprite jumps from off-screen
  into its lineup slot.
- **Death:** has `death` (8F) → roster eligible, plays `death` animation on KO.
- **Attack animation:** uses `sweep attack` (10F) as the primary attack trigger.
  Render as a wide slash or swing animation that visually sweeps across 3 enemy
  positions simultaneously.
- **Alternate attack tag:** `cross slice` (5F, red-flagged) — may be intended as
  an alternate attack animation or future ability variant. Currently not wired;
  clarify usage with sprite designer.
- **Damage received:** `hit` (2F, red-flagged) — brief feedback animation when
  damaged but not killed.
- **Duplicate cleanup needed:** Multiple duplicate tag entries (sweep_attack x2,
  run x2, attack x3, cross_slice x2, land x2) suggest spritesheet needs
  re-export from Aseprite. All red-flagged entries should be reviewed for
  correctness.
