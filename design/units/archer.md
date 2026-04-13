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

**Volley Arrow (Ancient class AoE basic attack).** In place of a normal
single-target attack, Archer's basic action deals 1 damage (plus her current
Resonance stacks) to every living enemy. This is the Ancient class AoE, the
same mechanic as Sleeping Giant and Ancient Guardian — see
[colossal_boss.md](colossal_boss.md) for the full Ancient class rule
including Resonance stacking. Archer participates fully in Ancient Resonance
with other Ancients on the team.

**Death-Defying Repositioning (unique unit ability, `on_faint`, single-use
per battle).** The first time Archer would take lethal damage in a battle,
her death trigger intercepts the kill: instead of being removed, she clears
her `dying` flag, is moved to the back slot of her team, and fires a
point-blank AoE that deals **1 damage to every enemy AND every friendly in
slots in front of her new back position** — friendly fire is intentional.
The AoE uses the `special attack` animation (26F). After this trigger,
Archer continues battling normally with whatever HP she has. She flags
`usedDeathDefy: true` at that point; any subsequent lethal damage in the
same battle resolves as a normal death (no second interrupt).

**`on_faint` interrupt contract (rendering + runtime):**
1. Archer takes lethal damage → health drops to 0.
2. She is queued into the death batch with `dying: true`.
3. Her `on_faint` handler fires in registration order:
   - Sets `dying: false`.
   - Moves her to the back slot of her team.
   - Fires the friendly-fire AoE against all units in slots in front of
     her new position (both teams).
4. Any new deaths caused by the AoE are appended to the SAME death batch
   (not a new batch) and resolve via the normal slot-order tiebreak.
5. One compaction runs after the whole batch settles. Archer is skipped
   during removal because `dying === false`.
6. Subsequent lethal damage skips the handler — she dies normally.

Tier 3 / 4 Ancient Folk hybrid. Scales through Resonance and survives one
lethal hit per battle.

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
