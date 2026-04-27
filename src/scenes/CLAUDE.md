# CLAUDE.md — scenes/

Phaser Scene classes. Each scene is a full-screen game state.

## Scene Flow

```
Boot → Menu → Shop ⟷ Battle → Shop (win/loss, team persists — no permadeath)
                 ↓              ↓ (3 losses) → GameOver
                 ↓              ↓ (9 wins) → HallOfFame
                 ├→ Settings (stub)
                 └→ HallOfFame (leaderboard viewer, no runId)
```

Current run start flow is `Menu -> ModeSelect -> CommanderSelect -> Shop`; ModeSelect sets the per-run `tutorial` flag.

Scenes pass state via `init(data)` with: `{ stage, credits, wins, losses, team, runId, opponent, commander, merchant, tutorial }`.
Dynamic run length: play rounds until 9 wins or 3 losses (not fixed 9 stages).

## Files

- **BootScene.js** — Preloads cross-scene assets: alpha unit aseprite atlases (22), commander sprites (25), merchant spritesheets (6), blank card frames (11), synergy icons, and stat icons. Generates warrior placeholder textures and a merchant placeholder. Initializes PixelFont and Supabase auth. 150ms delay then transitions to Menu. Parallax textures are NOT loaded here — BattleScene.preload() will queue them (narrowed via `pickMountainCitySets`) when parallax is re-enabled.
- **MenuScene.js** — Title screen with name input (PixelTextInput), typewriter messages, merchant with idle bob/breathing animation + reflection. Buttons: START GAME, HALL OF FAME, FACTION & CLASS RULES, SETTINGS. START GAME routes to ModeSelect. Scanline overlay.
- **ModeSelectScene.js** - opt-in run mode picker. TUTORIAL MODE and NORMAL MODE both route to CommanderSelect with a fresh runId and `tutorial` boolean. BACK returns to Menu.
- **ShopScene.js** — Core recruitment UI. Header: stage label, credit label, lives label (3 - losses). Team row (5 full WarriorCards, top of screen) with drag-to-sell via merchant zone (1 credit flat). 4 shop cards at bottom via ShopManager; drag-to-buy onto team row. Merchant strip (right) with sell zone below. Button strip (left): REROLL (1 credit), FIGHT! (triggers ghost snapshot + opponent fetch, then transitions to Battle). Each shop turn begins with exactly 10 credits — no carryover, no W/L variance. In tutorial mode, stage 1 seeds the shop and uses TutorialOverlay callouts.
- **tutorialSeed.js** - pure helper for deterministic tutorial stage-1 shop offers: three copies of one tier-1 unit plus a different same-tag tier-1 unit.
- **BattleScene.js** — Currently uses a flat tan (`0xC4A882`) background while parallax is disabled. When parallax is re-enabled, add `BattleScene.preload()` and queue via `pickMountainCitySets()` (~36 layers, 4 sets — not `getAllParallaxAssets`). Player team (left, x:100-420) vs enemy team (right, x:540-860) at y=320. Health bars above units. VS text center, battle log center-bottom. Animates at 500ms/step with camera shake. No gold awarded — shop resets to 10 credits each turn regardless of outcome. Full team carries over (no permadeath — dead units re-enter next round at full HP). Routes to appropriate next scene.
- **GameOverScene.js** — Shown at 3 losses. Displays W-L record. Buttons: PLAY AGAIN, MAIN MENU. Scanline overlay.
- **HallOfFameScene.js** — Two modes: champion (has runId, submits to Supabase, shows "CHAMPION!") or leaderboard viewer (from menu, shows "HALL OF FAME"). Fetches and displays top 8 as `${wins}W - ${losses}L`. Buttons vary by mode.
- **SettingsScene.js** — Stub. Shows "Nothing here yet..." placeholder and BACK button. Wired from Menu.
- **RulesScene.js** — Reference screen wired from Menu. Two-column layout: factions (with SYNERGIES tiers) and classes (with SYNERGY_ICONS tiers/descriptions). Footer alludes to Commanders and Merchants. Back button returns to Menu.

## Patterns

- All UI built from `src/ui/` components (PixelLabel, PixelButton, PixelPanel, WarriorCard, FloatingBanner, PixelTypewriter, PixelTextInput).
- Boot loads cross-scene assets (atlases, commander sprites, merchants, cards, icons). Scene-specific assets that are only needed by one scene should live in that scene's `preload()` — today this means parallax goes into `BattleScene.preload()` and commander normal-map generation runs in `CommanderSelectScene.create()`. Phaser's texture cache makes per-scene loads a one-time-per-page-load cost.
- Scanline overlay (CRT effect) on Menu, GameOver, HallOfFame screens.
- Full team persists between rounds — no permadeath. Units re-enter each Battle at full HP via fresh sprite construction in `BattleScene.create()`.
- **LayoutEditor registration:** all authored UI elements must be registered with `LayoutEditor.register(this, 'elementId', element, defaultX, defaultY)`. Hook `this.events.once('shutdown', () => LayoutEditor.unregisterScene(this.scene.key))` for cleanup. Do NOT register decorative elements (scanlines, grid lines, dividers).

## Upcoming Changes

- **ShopScene:** Star-level combining UI (auto-merge on duplicate buy). Commander display + swap offer every 3 wins (10 credits). Merchant display (random per round, weighted by team). 5 bench slots from stage 1 (remove team-size scaling). No permadeath — full team persists.
- **BattleScene:** Support class synergy effects (armor, splash, double-attack, taunt, heal). Trigger abilities (on-attack, on-hurt, on-faint, start-of-battle).
- **Currency rename:** all `gold` references → `credits` throughout scenes.
- **Commander assignment** at run start (random) — new scene or UI layer.
- **Dynamic run length:** Rounds continue until 9 wins or 3 losses (not fixed stage count).
- **SettingsScene** needs actual settings (audio, display, keybinds, etc.).
