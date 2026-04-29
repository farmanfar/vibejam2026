---
id: dagger_bandit
name: CLKD DAGGR
faction: Folk
class: Assassin
tier: 1
hp: 1
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `DAGGER BANDIT`
Canvas: 128x78 px (HORIZ)

**STATUS: BUGGED** — canvas dimensions (128x78) do not conform to standard grid
(192x192); tag-derived frame fallback applied. Error noted: `ASEPRITE CANVAS
192X192 DID NOT DIVIDE DAGGER BANDIT SPRITE SHEET 128X`.

## Animations

From AnimTester readout (tag — frame count):

- bat fang attack — 20F
- vanish — 18F
- appear — 16F (red)
- death — 16F (red)
- idle — 8F
- attack — 7F
- fall — 1F
- jump — 1F
- dagger bandit — 8 sprites (non-standard notation)
- run — 8 sprites (non-standard notation)

## Abilities

**High-Speed Dagger.** Cloaked Dagger attacks with a quick dagger strike using
the `attack` animation (7F), dealing 2 damage per hit. Tier 1 rogue archetype:
extremely fragile (1 HP), high damage output (2 ATK), rewards precise positioning
and quick takedowns before she dies.

No passive ability — pure offense with glass-cannon risk/reward.

## Rendering Notes

- **Spawn:** has `appear` (16F, red) + `jump` (1F) + `fall` (1F) → uses `appear`
  as spawn animation (priority 1, per CLAUDE.md spawn rules). Materializes in-place
  at lineup slot.
- **Death:** has `death` (16F, red) → roster eligible, plays `death` animation on KO.
- **Attack animation:** uses `attack` (7F) — short, fast animation befitting a
  dagger strike.
- **Vanish mechanic:** `vanish` (18F) tag present but mechanic TBD. May be related
  to a future evasion ability or repositioning tech. Currently unused.
- **Movement:** `run` (8 sprites, non-standard notation) — locomotion animation.
- **Red-flagged entries:** `appear`, `death` — review for correctness once sprite
  is finalized.
