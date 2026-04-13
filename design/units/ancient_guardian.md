---
id: ancient_guardian
name: Ancient Guardian
faction: Robot
class: Ancient
tier: 3
hp: 6
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `ANCIENT GUARDIAN`
Heuristic label: `LASER` (red highlighted)
Canvas: 166x96 px

Note: Spritesheet dimensions (166x96) do not conform to standard grid
(192x192); metadata fallback applied.

## Animations

From AnimTester readout (tag — frame count):

- (top entry, partially obscured) — 24F (likely idle or similar)
- blast — 24F
- idle — 24F
- laser — 24F (heuristic, AoE attack animation)
- death — 12F
- tele — 12F
- guardian — 8F
- appear — 8F (spawn animation)

## Abilities

Ancient Guardian has no unique unit ability handler. Her profile is the
**Ancient class mechanic in full** (identical to Sleeping Giant's, just at
T3 with a different stat line).

**Omnidirectional Pulse (Ancient class AoE basic attack).** In place of a
normal single-target attack, Ancient Guardian's basic action deals 1 damage
(plus her current Resonance stacks) to every living enemy. Uses the `laser`
animation (24F). Same Ancient AoE mechanic as Sleeping Giant — the two are
mechanically identical basic attacks, just different tier / stat variants.

**Ancient Resonance (Ancient class synergy).** See
[colossal_boss.md](colossal_boss.md) for the full rule. Summary: whenever
any Ancient deals damage, every OTHER Ancient gains +1 stack (cap 5).
Stacks add directly to effective ATK. No self-stack. One stack per
action, not per damage instance.

Tier 3 support/control unit. Low base ATK, but AoE hits everything and
scales through Resonance when paired with other Ancients.

## Rendering Notes

- **Attack animation:** uses `laser` (24F, not `blast`). Render as a wide-arc
  laser beam or pulse effect that hits all enemies simultaneously.
- Spawn: has `appear` → uses `appear` spawn animation (8F) to materialize in
  place at the lineup slot (per [README.md](README.md) spawn rules).
- Death: has `death` (12F) → eligible for the roster, plays `death` on KO.
- Teleport: has `tele` (12F) — mechanical use TBD (repositioning? Teleport
  ability? Clarify if this is a unit ability or animation artifact).
- Guardian state: `guardian` (8F) tag is unusual; may be a stance or shield
  state. Clarify usage.
