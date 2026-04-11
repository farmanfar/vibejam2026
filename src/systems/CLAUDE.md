# CLAUDE.md — systems/

Game logic modules. No rendering — these are pure data/logic that scenes consume.

## Files

- **BattleEngine.js** — Turn-based auto-resolve. Front-most alive unit attacks each turn. Applies faction synergies before combat. Generates step-by-step log for animated playback. Max 50 turns. Also generates scaled enemy teams (`generateEnemyTeam(stage)`).
- **ShopManager.js** — Weighted random unit selection. Tier availability gates by stage (stages 1-2: tiers 0-1, stages 7+: all tiers). 4 cards per roll.
- **GhostManager.js** — Supabase-backed async PvP. Snapshots player teams, fetches opponent ghosts matched by W-L record, falls back to synthetic AI. Also handles Hall of Fame submissions and leaderboard.

## Key Contracts

### BattleEngine.resolve(playerTeam, enemyTeam)
Returns `{ won, log, playerTeam, enemyTeam }`. Log entries: `{ message, playerHp[], enemyHp[] }`. Teams are cloned internally — originals not mutated.

### ShopManager.roll()
Returns array of 4 warrior objects (cloned from WARRIORS pool).

### GhostManager (static module)
All functions are async. `fetchOpponent()` returns a roster array (ghost or synthetic fallback). All operations log with `[Ghost]` prefix.

## Upcoming Changes

- **BattleEngine** needs to apply commander synergies alongside faction synergies. Star-level stat bonuses must be factored into combat (higher-star units hit harder, have more HP).
- **ShopManager** needs to support the combining system — when a player buys a duplicate, it should be combinable into a higher star level rather than occupying a new team slot.
- **Legendary abilities** will require BattleEngine extensions (abilities that trigger on attack, on death, on turn start, etc.).
- Currency references: `gold` → `credits` in any user-facing strings/logs.
