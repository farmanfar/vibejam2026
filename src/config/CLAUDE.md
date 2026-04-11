# CLAUDE.md — config/

Data definitions for all game entities. Currently a single JS module; will move to JSON when data-driven loading is implemented.

## Files

- **warriors.js** — 21 warriors across 5 tiers (0-4), 5 faction synergy definitions. Exports `WARRIORS` array and `SYNERGIES` object.

## Warrior Schema

Each warrior: `{ id, name, atk, hp, cost, tier, faction }`. IDs are snake_case, used as sprite texture keys. Tier maps to cost 1:1 (tier 0 = 1 credit, tier 4 = 5 credits).

## Synergy Schema

`SYNERGIES[faction][threshold]` → `{ atk?, hp? }`. Thresholds: 2, 3, 4+. Highest met threshold wins (no stacking).

## Upcoming

- **Star-level stat scaling.** Warriors need per-star multipliers or additive bonuses. A 2-star warrior is strictly better than 1-star.
- **Legendary variants.** Each warrior ID needs a legendary version with unique abilities (triggered when 3 copies are combined to max star).
- **Commander definitions.** New config for commanders: `{ id, name, artKey, synergies }`. Commander synergies boost specific card types/factions, layered on top of faction synergies.

## Rules

- Tier balance: keep total stats (atk+hp) roughly proportional to cost. Tier 0 ≈ 5 total, Tier 4 ≈ 15-17 total.
- Every faction needs representation across at least 3 tiers.
- IDs must match sprite asset keys when real art is integrated.
