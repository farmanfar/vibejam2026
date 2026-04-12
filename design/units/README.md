# Unit Authoring

This folder holds the source-of-truth stats for every unit in Hired Swords.
One markdown file per unit. Stats and the animation tag list are captured
from AnimTester by the user showing Claude a screenshot — Claude extracts
what's visible (unit title, heuristic label, animation tags, frame counts,
canvas size) and writes it into the `.md`. **No PNG files are saved to
this folder.**

**Why we record strings verbatim from the screenshot:** the user may
misspell wild unit names in chat ("Electrocuttioner" → actually
`Electrocutioner`), and the sprite's own heuristic label may itself be
misspelled in the source asset (`ELECTRICUITIONER`). Capturing both the
AnimTester title and the heuristic label gives us a ground-truth pair for
asset lookups AND protects display names from typos.

Code in [src/config/](../../src/config/) will be generated from these files
once the catalog is stable.

## Format

```markdown
---
id: electrocutioner
name: Electrocutioner
faction: Robot
class: Knight
tier: 2
hp: 4
attack: 2
range: 2
---

## Sprite Source

AnimTester title: `ELECTROCUTIONER`
Canvas: 157x107 px

## Animations

From AnimTester readout (tag — frame count):

- appear — 6F
- idle — 12F
- attack — 39F
- range_attack — 16F
- teleport — 12F
- death — 16F

## Abilities

Freeform text describing what this unit does, synergies, juice notes, etc.
```

**Field rules:**
- `id` — lowercase snake_case, matches filename
- `name` — display name (can include `#`, spaces, punctuation)
- `faction` — freeform. Whatever the user declares IS the canonical list.
  Anything in [design/game-design-spec.md](../game-design-spec.md) about
  factions is **placeholder** and should be ignored — this folder is the
  source of truth going forward.
- `class` — same rule: freeform, whatever the user declares. The old
  Warrior/Mage/Ranger/Tank/Support list in the design spec is placeholder.
- `tier` — shop tier (integer)
- `hp` / `attack` — base (1-star) integer values
- `range` — tiles reached by an attack. **Defaults to 1 (melee).** Omit
  from chat unless the unit is ranged; always write `range: 1` explicitly
  in the file for code-gen consistency.

## Cross-cutting rules (apply to ALL units)

### Death animation is mandatory

**A unit without a `death` animation is not a candidate for this game.**
Dying is a key moment of juice — if the sprite has no death tag, cut it from
the roster. Always include `death` in the animations list.

### Spawn behavior (entry into the lineup)

Units spawn into the battle lineup with different entrance animations based
on what tags the sprite exposes. The priority order is:

1. **If the sprite has an `appear` animation** → play `appear` in place at
   the lineup slot. This is the preferred spawn for units that have it
   (teleporters, summons, materializers — e.g., Electrocutioner).
2. **Else if the sprite has `jump` and `fall`** → the unit jumps from
   off-screen and falls into its lineup slot.
3. **Else** → the unit moves into its lineup slot from off-screen using
   whichever locomotion tag it has, in priority order:
   `run` → `walk` → `idle` (slid in place as a last resort).

This rule is read at runtime from each unit's animation tag list, so no
per-unit config is needed — the spawn method is a direct function of which
tags exist on the sprite.

### Animations list

Each unit file records the tags present on its `.aseprite` source, copied
verbatim from AnimTester. This lets code generation decide spawn/death
behavior without re-scanning the sprite files.
