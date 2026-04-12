---
id: relic_guardian_3
name: Relic Guardian 3
faction: Robot
class: Knight
tier: 3
hp: 4
attack: 3
range: 1
---

## Sprite Source

AnimTester title: `RELIC GUARDIAN 3`
Heuristic label: `SUMMON DAGGERS` (green ASEPRITE tag visible in screenshot)
Canvas: 95x65 px

## Animations

From AnimTester readout (tag — frame count):

- cast_sword — 24F
- summon_daggers — 16F (heuristic)
- buff — 13F
- death — 13F
- idle — 10F
- move — 4F

## Abilities

**Reactive Reinforcement.** Whenever another allied Robot unit dies on the
field, Relic Guardian 3 gains +1 Attack permanently for the rest of the
battle. Synergizes with Robot tribe density — the more Robots in your
composition, the more triggering deaths, the faster the snowball grows.
Triggers the `buff` animation on stack gain.

## Rendering Notes

- **Unidentified paired sprite:** The `cast_sword` animation (24F) is meant
  to be paired with a separate projectile/effect sprite that we cannot ID
  yet. When this unit casts, a dual-layer render is required (unit +
  projectile layer). Placeholder for now; will need to locate the sprite
  asset ID when wiring into battle renderer.
- Spawn: no `appear`, no `jump`/`fall` — uses `move` locomotion (4F) to
  enter the lineup slot from off-screen (per [README.md](README.md) spawn
  rules). Quick entry for a Tier 3 unit.
- Death: has `death` → eligible for the roster, plays `death` on KO.
- Buff state: `buff` animation is a visual indicator for the stacked attack
  bonus. Repeats/loops on each trigger or is a single-frame flash; TBD
  based on sprite design intent.
