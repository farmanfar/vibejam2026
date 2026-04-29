---
id: relic_guardian_3
name: Relic Guardian
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

**Reactive Reinforcement (unique unit ability, `on_ally_death`).** Whenever
another **allied Robot** unit dies (from any source), Relic Guardian 3
gains +1 ATK permanently for the rest of the battle. Only triggers on
OTHER allied Robots — her own death does not trigger the handler (she's
dead by the time it would fire). Non-Robot allies do not trigger the
handler. Stacks cumulatively with no cap. Triggers the `buff` animation
(13F) on each stack gain.

Synergizes with Robot tribe density — the more Robots in your composition,
the more triggering deaths, the faster the snowball grows. Particularly
strong with Minion #001 / #002 / #003 (high-churn Robot Grunts) and
Robot Ancients (whose death triggers can buff Relic Guardian 3's
subsequent attacks).

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
