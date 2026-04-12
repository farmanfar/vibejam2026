# CLAUDE.md — systems/

Game logic modules. No rendering — these are pure data/logic that scenes consume.

## Files

- **BattleEngine.js** — Turn-based auto-resolve. Front-most alive unit attacks each turn. Applies faction synergies before combat. Generates step-by-step log for animated playback. Max 50 turns. Also generates scaled enemy teams (`generateEnemyTeam(stage)`).
- **ShopManager.js** — Weighted random unit selection. Tier availability gates by stage (stages 1-2: tiers 0-1, stages 7+: all tiers). 4 cards per roll. Weight formula: base weights `[50, 30, 20, 10, 5]` plus stage bonus.
- **GhostManager.js** — Supabase-backed async PvP. Snapshots player teams, fetches opponent ghosts matched by W-L record (picks random from up to 20 matches), falls back to synthetic AI. Also handles Hall of Fame submissions and leaderboard (top 50).
- **LayoutEditor.js** — F2 runtime layout editing tool (~28KB). Manages element registration, drag positioning, scale, grid snap, localStorage persistence, JSON export. See root CLAUDE.md for full hotkey reference.
- **PlayerConfig.js** — Player name persistence via localStorage. Minimal module (~21 lines).

## Key Contracts

### BattleEngine.resolve(playerTeam, enemyTeam)
Returns `{ won, log, playerTeam, enemyTeam }`. Log entries: `{ message, playerHp[], enemyHp[] }`. Teams are cloned internally — originals not mutated.

### BattleEngine.generateEnemyTeam(stage)
Returns a scaled enemy team. Team size and stat ranges increase with stage. Max available tier gated by stage progression.

### ShopManager.roll()
Returns array of 4 warrior objects (cloned from enabled WARRIORS pool, weighted by tier).

### GhostManager (static module)
All functions are async. All operations log with `[Ghost]` prefix.
- `snapshotTeam(runId, wins, losses, stage, roster)` — saves to `ghost_snapshots` table
- `fetchOpponent(wins, losses, stage)` — returns roster array (ghost or synthetic fallback)
- `submitChampion(runId, roster, wins, losses)` — inserts into `hall_of_fame` table
- `fetchLeaderboard()` — returns top 50 by losses asc, then created_at asc

## Upcoming Changes

- **BattleEngine:** Add class synergies (mechanical effects: armor, splash, double-attack, taunt, heal). Add trigger abilities (on-attack, on-hurt, on-faint, start-of-battle). Commander synergy threshold reduction. Star-level stat bonuses (+1/+1 per star).
- **ShopManager:** Duplicate combine system (buying a duplicate auto-merges → higher star, no new bench slot). Merchant system (random per round, pool bias weighted by team comp). Remove team-size scaling (always 5 slots). Remove permadeath (team persists between rounds).
- **Economy overhaul:** Flat 10 credits/round (no win/loss variance). Full sell refund during shop phase, ceil(cost/2) after battle. No loss gold penalty.
- **New system: MerchantManager** — Merchant rotation, type weighting by team/commander, pool bias.
- **New system: CommanderManager** — Commander assignment, swap offers every 3 wins (10 credits), synergy threshold reduction.
- Currency variable rename: `gold` → `credits` throughout all systems and scenes.
