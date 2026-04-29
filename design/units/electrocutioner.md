---
id: electrocutioner
name: Electro
faction: Robot
class: Knight
tier: 2
hp: 4
attack: 2
range: 2
---

## Sprite Source

AnimTester title: `ELECTROCUTIONER`
Heuristic label (misspelled in source asset): `ELECTRICUITIONER`
Canvas: 157x107 px

> Canonical spelling is **Electrocutioner** (from the AnimTester title).
> The sprite's internal heuristic label is misspelled as `ELECTRICUITIONER`
> — keep that exact string around for asset lookups, but never use it as
> the display name.

## Animations

From AnimTester readout (tag — frame count):

- appear — 6F
- idle — 12F
- attack — 39F — **NOT USED** (see Rendering Notes)
- range_attack — 16F — sole attack animation, programmatically rotated
- teleport — 12F
- death — 16F

## Abilities

**Piercing Bolt.** The Electrocutioner's attacks hit the first TWO units in
the enemy line instead of only the front unit. This is the core mechanic
that distinguishes it from a standard ranged unit — prioritize clustered
back-line damage in synergy calculations.

Ranged attacker (range 2) — fires from within its own lineup, never steps
forward to engage.

## Rendering Notes

- **Only `range_attack` is used for attacks.** The `attack` tag on the
  sprite is ignored — Electrocutioner is ranged-only.
- **`range_attack` must be rotated to point at the enemy team**, not the
  default upward direction baked into the sprite. The sprite layer will be
  rotated independently at runtime, so the rendering system needs to expose
  a per-attack rotation angle derived from the attacker→target vector.
- Spawn: has `appear` → uses the appear spawn path (per
  [README.md](README.md) spawn rules).
- Death: has `death` → eligible for the roster, plays `death` on KO.
