# CLAUDE.md — config/

Data definitions for all game entities. Mix of JS modules and JSON data files, with a generated art catalog.

## Files

- **warriors.js** — Re-exports from `units.js`. Provides `SYNERGIES` object and `getEnabledWarriors()` function. Legacy entry point — prefer importing from `units.js` directly.
- **units.js** — Main unit data management (~1,200 lines). Loads/merges unit definitions from JSON, handles import status, validation, and draft persistence to localStorage. Exports `WARRIORS`, `SYNERGIES`, `getEnabledWarriors()`, `saveUnitDefinitionsDraft()`.
- **unit-definitions.json** — Canonical unit definitions repository (~32KB). Source of truth for unit stats and metadata.
- **unit-catalog.generated.json** — Generated art catalog (~71KB). Maps unit IDs to PENUSBMIC sprite assets. Do not hand-edit.
- **unit-sources.json** — Source metadata for units (~20KB). Tracks which asset pack each unit originates from.
- **unit-import-report.generated.json** — Generated import status report (~10KB). Tracks art pipeline status per unit.
- **layout-overrides.json** — F2 Layout Editor export target. Currently empty (`{}`). See root CLAUDE.md F2 section.

## Warrior Schema

Each warrior: `{ id, name, atk, hp, cost, tier, faction, enabled, spriteKey, hasPortrait, hasAtlas, importStatus, importWarnings, importErrors, art, source }`. IDs are snake_case, used as sprite texture keys. Tier maps to cost 1:1 (tier 0 = 1 credit, tier 4 = 5 credits).

## Synergy Schema

**Source of truth is `src/systems/combat/` — not this directory.** Faction mechanics live in `src/systems/combat/factions/*.js`, class mechanics in `src/systems/combat/classes/*.js`. They run inside `CombatCore` and are not stat-threshold bonuses.

Live factions (alpha pool only carries these three):
- **Folk** — on any Folk death, a random surviving Folk ally gains +1 ATK.
- **Monster** — on death, reanimate at full HP. 10% base, +10% per other Monster (cap 50%).
- **Robot** — each Robot gains +1 HP per other Robot on team (battle-start).

Tooltip / rules-screen copy for the above lives in `src/config/synergy-icons.js` as `FACTION_ICONS[tag].description`. Keep that file in sync with `src/systems/combat/factions/*.js` when mechanics change.

### Legacy `SYNERGIES` table (dead data)

`SYNERGIES` in `units.js` is the pre-alpha stat-threshold table (Undead/Beast/Fantasy/Tribal). **Nothing applies it at runtime** — the old `BattleEngine.js` now imports an empty `SYNERGIES` from `alpha-units.js`, and even that path is superseded by `BattleSceneAdapter.runAlphaBattle`. The four entries still exist only because `RulesScene` iterates the table to render tiles for those dead tags; no alpha unit carries those factions. Safe to delete once the Rules screen stops listing them.

## Upcoming

- **Pool shrink.** Cut from 98 to ~40-50 units. Even faction distribution (~8-10 per faction across all tiers).
- **Class tag.** Every unit gets a second tag: one of 4-5 classes (Warrior, Mage, Ranger, Tank, Support). Schema adds `class` field.
- **Star-level stat scaling.** +1 HP / +1 ATK per star (flat SAP-style). Schema adds `star` field (1/2/3).
- **Commander definitions.** New config: `{ id, name, artKey, ability }`. Baseline ability: reduce synergy thresholds. Each commander unique.
- **Merchant definitions.** New config: `{ id, name, poolBias, artKey }`. Merchants influence shop unit pool weights.
- **Class synergies.** New synergy axis: `CLASS_SYNERGIES[class][threshold]` → mechanical effects (armor, splash, double-attack, taunt, heal).
- **Legendaries:** Cut for now.

## Rules

- Tier balance: keep total stats (atk+hp) roughly proportional to cost. Tier 0 ~ 5 total, Tier 4 ~ 15-17 total.
- Every faction needs representation across all tiers (at least 1 unit in T0-T1, 1 in T2-T3, 1 in T4).
- Every class needs representation across at least 3 factions.
- IDs must match sprite asset keys (enforced by unit-catalog system).
- Never hand-edit `*.generated.json` files — they're produced by the import pipeline.
