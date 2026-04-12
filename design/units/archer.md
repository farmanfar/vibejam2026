---
id: archer
name: Archer
faction: Folk
class: Ancient
tier: 3
hp: 4
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `ARCHER`
Heuristic label: `ancient archer`
Canvas: 174x25 px

**STATUS: BUGGED** — canvas dimensions (174x25) do not conform to standard grid
(192x192); tag-derived frame fallback applied. Error noted: `ASEPRITE CANVAS
192X192 DID NOT DIVIDE ALL.PNG  USED TAG-DERIVED FRAME`.

## Animations

From AnimTester readout (tag — frame count):

- special attack — 26F
- idle — 20F
- attack — 14F
- run — 8F
- vfx for special — 1F
- damaged — 6 sprites (non-standard notation)
- death — 6 sprites (non-standard notation)
- all — 2 sprites (non-standard notation)

## Abilities

**Volley Arrow.** Instead of a normal single-target attack, Archer fires an
arrow that damages **all living enemies on the field for 1 damage each**,
regardless of position or range. Does not consume ammunition or stamina.
Synergizes with high-enemy-count comps (scales damage output with enemy
density).

**Death-Defying Repositioning.** **Once per combat:** If Archer would be killed
while serving as the active fighter (top of the lineup), instead of dying, she
uses the `special attack` animation to vanish and reappear at the back of the
lineup. Upon reappearing, she fires a point-blank AoE attack that deals **1
damage to all enemies and friendlies in front of her position** in the lineup
(a "pass-through" damage volley). After this repositioning, Archer continues
battling normally.

## Rendering Notes

- **Spawn:** no `appear` or `jump`/`fall` animations — uses `run` (8F) locomotion
  to enter the lineup slot from off-screen.
- **Death:** has `death` (6 sprites) → eligible for the roster, plays `death`
  animation on normal KO. However, the Death-Defying Repositioning ability may
  intercept this, preventing death and triggering `special attack` (26F) instead.
- **Attack animation:** uses `attack` (14F) to trigger the Volley Arrow ability
  (AoE damage to all enemies).
- **Special repositioning animation:** `special attack` (26F) — used for
  Death-Defying Repositioning mechanic. Render as a vanish + reappear sequence
  with AoE damage marker at back-of-line position.
- **Damaged state:** `damaged` (6 sprites) — feedback animation when hit but not
  killed.
