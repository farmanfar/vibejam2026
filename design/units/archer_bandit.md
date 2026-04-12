---
id: archer_bandit
name: Cloaker
faction: Folk
class: Assassin
tier: 4
hp: 1
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `ARCHER BANDIT`
Canvas: 85x112 px (HORIZ)

**STATUS: BUGGED** — canvas dimensions (85x112) do not conform to standard grid
(192x192); tag-derived frame fallback applied. Error noted: `ASEPRITE CANVAS
192X192 DID NOT DIVIDE ARCHER BANDIT SPRITE SHEET 85X1`.

## Animations

From AnimTester readout (tag — frame count):

- archer bandit without bow — 18F (variant state)
- vanish — 18F
- appear — 16F
- death — 16F
- idle — 8F
- run — 8F (red-flagged)
- volley vfx — 8F (red-flagged; projectile animation for ability)
- fall — 1F
- jump — 1F
- archer bandit — 19 sprites (non-standard notation)
- bow sprite — 19 sprites (non-standard notation)

## Abilities

**Sniper's Venom.** At the **start of battle**, if Cloaker is positioned in the
**last lineup slot** (back of the line), she fires a volley using the `volley vfx`
animation. This volley poisons **every living enemy on the field with 1 poison
stack**, regardless of position or range.

Cloaker **cannot perform normal attacks** at any time. She is a utility assassin:
low health (1), no offensive capability in normal combat, but devastating if
positioned last for opening turn setup.

Synergizes with poison-scaling units and position-based team composition (bench
optimizing for late-position abilities).

## Rendering Notes

- **Spawn:** has `appear` (16F) + `jump`/`fall` (1F each) — uses `appear` as
  primary spawn animation (per CLAUDE.md spawn priority 1).
- **Death:** has `death` (16F) → eligible for roster, plays `death` animation on
  KO.
- **Attack animation:** Cloaker has no normal attack. `volley vfx` (8F) is the
  projectile animation for the startup ability, not a regular attack animation.
- **Vanish mechanic:** `vanish` (18F) tag present but mechanic TBD — may be related
  to ability trigger, stealth state, or repositioning. Clarify with designer.
- **Variant states:** `archer bandit without bow` (18F) and two non-standard
  `sprites` entries (`archer bandit` 19 sprites, `bow sprite` 19 sprites) suggest
  layered rendering or state-specific sprite variants. Likely used for bow-vs-no-bow
  visual distinction.
- **Red flags:** `run` and `volley vfx` flagged in AnimTester; determine if these
  are broken animations or intentional special markings.
