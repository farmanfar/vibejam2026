# CLAUDE.md — Hired Swords

## Framework

- **Phaser 4.0.0** (`^4.0.0` in package.json). This is NOT Phaser 3.
- **Never use Phaser 3 APIs.** Many tutorials, docs, and LLM training data reference Phaser 3. Always verify APIs exist in Phaser 4 before using them.
- Key Phaser 3 → 4 breaking changes to watch for:
  - `GeometryMask` is Canvas-only in v4 WebGL. Masks moved to the filters system.
  - Scene lifecycle, input, and camera APIs have changed. Check the migration guide.
- **Build:** `npm run dev` (Vite dev server)
- **Stack:** Phaser 4 + Vite 8 + Supabase (auth/cloud)

## Game

- Auto-battler roguelike: recruit warriors, build synergies, fight AI/ghost opponents, survive 9 stages
- 960x540 pixel art, m5x7 bitmap font, DarkTech theme
- 5 factions: Robot, Undead, Beast, Fantasy, Tribal
- Currency is **credits** (not gold). All references should use "credits."
- All art is procedural placeholders for now — final art from PENUSBMIC (STRANDED + THE DARK packs)

## Design Direction

- **Tabletop card game feel.** Players arrange warriors in a single-file row.
- **Star levels (TFT-style).** Combine 2 copies → 2-star. Combine 2x 2-star → 3-star. Top tier → legendary boss card with unique abilities.
- **Commanders.** Random commander assigned at run start. Provides synergies to card types. Can be swapped for credits (full replacement, old one removed). Art: PENUSBMIC fantasy cards.
- **Shop visual tiers.** Shop background changes every 3 wins (aligned with parallax). Cosmetic only — no gameplay effect.

## Structure

Each subdirectory has its own CLAUDE.md with subsystem-specific rules.

```
src/
├── main.js              # Phaser Game config (960x540, pixelArt, scene order)
├── supabase.js          # Supabase client, anonymous auth
├── config/              # Data definitions (warriors, synergies, layout-overrides.json)
├── scenes/              # Phaser Scenes (Boot, Menu, Shop, Battle, GameOver, HallOfFame, Settings)
├── systems/             # Game logic (BattleEngine, ShopManager, GhostManager, LayoutEditor)
└── ui/                  # PixelUI components (Theme, Font, Button, Label, Panel, etc.)
```

## Workflow

This is a Codex-reviewed project. Follow this loop:

1. **Plan mode always.** Plan tests that prove success. Log EVERYTHING — positions, state transitions, decisions, fallbacks. Codex will review, so make the plan unambiguous.
2. Codex reviews plan, gives feedback.
3. Improve plan knowing Codex will look again.
4. Codex gives second feedback pass.
5. Get plan 1000% right. No living in revision loops.
6. Implementation (suggest Sonnet when work is mechanical / no design ambiguity).
7. Codex reviews implementation.
8. Ship — or fix and re-review.

**Do NOT invoke Codex, codex:rescue, or any Codex-related tooling from Claude Code.** The user handles plan/code review externally by copy-pasting to Codex.

## Logging

Log aggressively. The user debugs by pasting console output — silent failures are invisible.

- **Every layout-managed element:** `[Layout] Scene.ElementId at (x, y)`
- **Every state transition:** scene changes, W/L updates, gold changes
- **Every network call:** before, result, error with context
- **Every fallback path:** log WHY the fallback was taken
- **Every error:** never `catch (_) {}` — always `catch (e) { console.error('[System] context:', e) }`
- **System prefixes:** `[Layout]`, `[Editor]`, `[Auth]`, `[Ghost]`, `[Shop]`, `[Battle]`, `[Menu]`

## UI / Visual Work

Claude is weak at spatial layout. The **F2 Layout Editor** exists so the user does visual positioning.

- The `frontend-design` skill has limited utility for Phaser canvas rendering — it's designed for HTML/CSS, not game engine UIs.
- Every authored UI element must be registered with LayoutEditor for F2 editing.
- Decorative elements (scanlines, grid lines, dividers) are NOT registered.

## F2 Layout Editor

Runtime debug tool — press **F2** to toggle edit mode.

- **Hotkeys (edit mode only):**
  - **F2** — toggle edit mode on/off
  - **`[` / `]`** — scale selected element down / up (10% per step)
  - **G** — cycle grid snap: OFF → 8px → 16px → 32px → OFF
  - **R** — reset selected element to default position + scale
  - **Escape** — deselect current element
- **Registered elements:** panels, labels, buttons, cards. NOT combat sprites, health bars, or decorative primitives.
- **Edit mode:** disables all game input (prevents buy/sell/reroll). Drag elements freely. Green position labels + yellow selection highlight.
- **Persistence:** positions + scale saved to **localStorage** immediately. Survives page refresh.
- **Buttons:** Export JSON, Reset Scene (current scene to defaults), Clear All (all scenes).
- **Export:** click "Export" in edit mode (or `LayoutEditor.exportJSON()` in console). Copy into `src/config/layout-overrides.json`.
- **Load priority:** localStorage > layout-overrides.json > hardcoded defaults.
- **For publish:** commit `layout-overrides.json` with the user's preferred positions. Clear localStorage.
- **Console commands:** `LayoutEditor.exportJSON()`, `LayoutEditor.clearAll()`
- **Scene lifecycle:** each scene calls `LayoutEditor.unregisterScene()` on shutdown. No stale refs.
