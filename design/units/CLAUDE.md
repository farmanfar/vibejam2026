# CLAUDE.md — Unit Catalog (design/units/)

## Purpose

This folder is the source-of-truth for unit stats and animation data. One markdown file per unit. **No PNG files are saved here.**

Each unit `.md` is a reference document that:
1. Captures verbatim data from AnimTester screenshots (title, heuristic label, animation tags, frame counts, canvas size)
2. Documents the unit's abilities and synergies in freeform prose
3. Serves as the foundation for future code generation in `src/config/`

## Workflow

User shows Claude an AnimTester screenshot + describes the unit → Claude reads the screenshot data and writes the unit's `.md` file, following the format rules below.

## Markdown Format

```markdown
---
id: unit_name
name: Display Name
faction: Faction
class: Class
tier: 1
hp: 2
attack: 1
range: 1
---

## Sprite Source

AnimTester title: `TITLE`
Heuristic label: `LABEL` (optional; include if present on sprite)
Canvas: WxH px

Optional: note non-standard dimensions, BUGGED status, or aseprite errors.

## Animations

From AnimTester readout (tag — frame count):

- tag_name — NF
- ...

Optional: note non-standard notations (e.g., "6 sprites" instead of "6F"), broken animations, duplicates.

## Abilities

Freeform prose describing:
- What the unit's core attack/ability does
- Synergies (dual-tag interactions, combo mechanics)
- Juice notes (visual/feel feedback)

## Rendering Notes (optional but recommended)

Bullet points for implementation clarity:
- Spawn animation choice and why
- Death animation eligibility confirmation
- Attack animation mappings
- Clarifications on unusual tags
```

## YAML Front Matter Rules

- **id** — lowercase `snake_case`, matches the filename (e.g., `ancient_guardian.md` has `id: ancient_guardian`)
- **name** — display name; can include `#`, spaces, punctuation, non-ASCII
- **faction** — freeform. User-declared, NOT constrained by design spec. Update design spec as roster grows.
- **class** — freeform. User-declared, NOT constrained by design spec.
- **tier** — shop tier (integer, 1–3 typical)
- **hp** / **attack** — base stats (1-star values, integers)
- **range** — tiles reached by attack. **Default is 1 (melee).** Always write `range: 1` explicitly in file for code-gen consistency. Omit only when NOT mentioned by user; always add it when writing the file.

## Cross-cutting Rules

### Death Animation is Mandatory

A unit without a `death` animation **is not a candidate for the game.**

Death is a key juice moment. If the sprite has no `death` tag → cut it from the roster.

**Why:** Dying is the last impression players have of a unit. Silent removal or placeholder death damages game feel.

**How to apply:** Every unit file must list `death` in the Animations section. If an AnimTester screenshot shows no death tag, flag it in the file (e.g., "STATUS: INCOMPLETE — no death animation") and ask before adding to roster.

### Spawn Behavior (Entry Animation Priority)

Units enter the battle lineup using different animations based on tag availability. Check tags in this priority order:

1. **If `appear` exists** → play in-place at lineup slot (teleporter, materializer, summoned)
2. **Else if `jump` + `fall` both exist** → jump from off-screen, fall into slot
3. **Else, use locomotion in priority order:** `run` → `walk` → `idle` (slide in place as last resort)

This is read at runtime from the unit's tag list — no per-unit config needed.

**Why:** Different spawn styles set visual tone (sudden materializer vs. athletic entry vs. graceful slide). Matching animation to unit fantasy.

**How to apply:** Note in Rendering Notes which spawn method the unit will use based on its tags.

### Capture AnimTester Data Verbatim

Always copy the title, tags, and frame counts exactly as shown in AnimTester. Do NOT clean up, correct, or interpret.

**Why:** User may misspell ("Electrocuttioner") but the sprite itself has the correct name. AnimTester title + heuristic label together form a ground-truth pair for asset lookup. Typos in either tell us which system has the bug.

**How to apply:** Put AnimTester title in backticks in Sprite Source section. Include heuristic label if present on the sprite. If a tag looks misspelled (e.g., `ELECRTICAL` in the sprite), write it as-is and note the suspicion in Rendering Notes.

### Animations List Consistency

Each unit file records animation tags copied verbatim from AnimTester. Code generation will read this list to determine spawn behavior and valid action animations.

**Why:** Avoids re-scanning sprite files and keeps decisions (spawn method, death eligibility) in one place that's easy to audit.

**How to apply:** Use bullet format `- tag — NF`. If AnimTester shows non-standard notations (e.g., "6 sprites" instead of "6F"), copy exactly and note the non-standard notation. Do NOT convert `6 sprites` to `6F`.

## Conventions

- **Bugged sprites:** Flag with `STATUS: BUGGED` in Sprite Source if AnimTester shows a red error banner or canvas dimensions don't conform to the sprite's standard grid (e.g., 192x192).
- **Broken animations:** Mark individual tags as "(broken)" if they appear in red in AnimTester. Flag the whole file as "INCOMPLETE" or "NEEDS REPROCESSING" if most tags are broken.
- **Non-standard canvas sizes:** If the sprite canvas is not standard (e.g., 174x25 or 166x96 instead of 192x192), document the actual size and note tag-derived frame fallback if applicable.

## Generator Responsibilities

`scripts/generate-alpha-units.mjs` reads all `design/units/*.md` files and produces `src/config/alpha-units.generated.json`. Run with `npm run alpha:generate`.

**What the generator controls (not the design docs):**
- **ability_id mapping** — `ABILITY_MAP` in the generator maps unit id → ability_id string. The `.md` file describes what the ability does in prose; the generator decides which `ability_id` string wires it to code.
- **basicAttackOverride** — `BASIC_ATTACK_OVERRIDE` table. Units whose basic attack behavior deviates from their class mechanic (e.g., Blood King = Ancient class but single-target melee).
- **skipBasicAttack** — `SKIP_BASIC_ATTACK` table. Units that never take a basic attack turn (e.g., Cloaker).
- **art status** — `ART_STATUS` table (placeholder vs. imported).
- **balance overrides** — `src/config/alpha-balance-overrides.json`. Stat adjustments applied on top of frontmatter values. Do NOT edit `alpha-units.generated.json` directly.

**Rule:** If you change a unit's mechanic in its `.md`, also update the generator's `ABILITY_MAP` and the corresponding ability handler in `src/systems/combat/abilities/`. The `.md` and the code must stay in sync.

## Future Code Generation

Once this folder is stable, the generator will also produce:
- `src/config/units.json` (stats, tier, faction, class for the live game)
- `src/config/unit-animations.json` (tag lists for spawn/death logic)

Do NOT manually edit config files in `src/config/` — they will be overwritten. All source truth lives here.
