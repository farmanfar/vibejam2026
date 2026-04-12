---
id: glitch_samurai
name: Glitch Samurai
faction: Robot
class: Knight
tier: 2
hp: 3
attack: 2
range: 1
---

## Sprite Source

AnimTester title: `GLITCH SAMURAI`
Canvas: 140x46 px (HORIZ)

**STATUS: BUGGED** — canvas dimensions (140x46) do not conform to standard grid
(192x192); tag-derived frame fallback applied. Error noted: `ASEPRITE CANVAS
192X192 DID NOT DIVIDE GLITCH SAMURAI 140X46.PNG USED`.

## Animations

From AnimTester readout (tag — frame count):

- death — 12F
- run — 12F
- idle glitch — 11F
- idle — 11F
- slash — 7F (red)
- glitch out — 5F
- glitch samurai — 4F
- fall — 4F
- jump glitch — 4F
- jump — 4F
- land — 3F
- wall sit — 1F
- glitch slices — 20 sprites (red, non-standard notation)
- glitch sweep — 20 sprites (non-standard notation)
- slash — 7 sprites (non-standard notation)
- wall slide — 4 sprites (non-standard notation)

## Abilities

**Honorbound Stance (Class Synergy).** Glitch Samurai gains **+1 HP and +1 ATK
for each other Knight on your team**. This bonus is cumulative and applies at
the start of battle (static, recalculated when new Knights enter or old ones
leave).

Example: 1 Knight on team = base 3 HP / 2 ATK. 2 Knights = +1/+1 bonus = 4 HP /
3 ATK. 3 Knights = +2/+2 bonus = 5 HP / 4 ATK, etc.

Tier 2 melee Knight. Moderate base stats (3 HP, 2 ATK). The synergy rewards
Knight-heavy compositions — building an all-Knight squad creates a powerful
scaling effect.

## Rendering Notes

- **Spawn:** has `jump` (4F) + `fall` (4F) — uses jump/fall entry (priority 2,
  per CLAUDE.md spawn rules). Jumps from off-screen into the lineup slot.
- **Death:** has `death` (12F) → roster eligible, plays `death` animation on KO.
- **Attack animation:** uses `slash` (7F, red) — primary melee attack. Render as
  a sword slash or samurai strike.
- **Glitch theme:** `idle glitch` (11F), `glitch out` (5F), `glitch samurai`
  (4F), `jump glitch` (4F), `glitch slices` (20 sprites, red) — multiple
  "glitch" state animations suggest visual distortion or teleportation effects.
  May be used to render flickering, visual glitches, or phase-like appearance.
- **Wall mechanics:** `wall sit` (1F), `wall slide` (4 sprites) — possible
  wall-cling or ledge-grab mechanics (unused; clarify with designer).
- **Movement:** `run` (12F), `land` (3F) — standard locomotion.
- **Red-flagged entries:** `slash`, `glitch slices` — review once sprite is
  finalized.
- **Non-standard notation:** four entries use "sprites" instead of "F"
  (`glitch slices`, `glitch sweep`, `slash`, `wall slide`) — flag for
  clarification on frame counts.
