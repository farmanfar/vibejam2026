# CLAUDE.md — scenes/

Phaser Scene classes. Each scene is a full-screen game state.

## Scene Flow

```
Boot → Menu → Shop ⟷ Battle → GameOver
                              → HallOfFame (9 wins)
```

Scenes pass state via `init(data)` with: `{ stage, gold, wins, losses, team, runId, opponent }`.

## Files

- **BootScene.js** — Generates placeholder textures (warrior sprites, merchant). Initializes PixelFont and Supabase auth. No real asset loading yet.
- **MenuScene.js** — Title screen. "PLAY" button starts a run with `{ stage: 1, gold: 10, runId }`. Shows art credits (PENUSBMIC).
- **ShopScene.js** — Core recruitment UI. Rolls 4 warrior cards via ShopManager, team bench (5 slots), buy/sell/reroll. Async ghost matchmaking on "FIGHT!" button.
- **BattleScene.js** — Renders both teams with health bars, animates battle log at 500ms/step, camera shake on hits. Routes to Shop (win/loss) or GameOver/HallOfFame on completion.
- **GameOverScene.js** — Shown at 3 losses. Displays W-L record, play again / main menu.
- **HallOfFameScene.js** — Shown at 9 wins. Submits champion to Supabase, displays top 8 leaderboard.

## Patterns

- All UI built from `src/ui/` components (PixelLabel, PixelButton, PixelPanel, WarriorCard, FloatingBanner).
- No scene uses `this.load` for external assets — everything is generated textures from BootScene.
- Scanline overlay (CRT effect) on Menu, GameOver, HallOfFame screens.
- Survivors carry over between battles (damaged units keep reduced HP).

## Upcoming Changes

- **ShopScene** will be the most heavily modified scene. Needs: star-level combining UI, commander display + swap button, credit cost for commander swap, parallax background that changes every 3 wins.
- **Currency rename:** all `gold` references → `credits` throughout scenes.
- **New scene or UI layer** for commander selection at run start (random assignment).
- Battle results need to account for star-level stat bonuses and commander synergies.
