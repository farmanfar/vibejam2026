# CLAUDE.md — Hired Swords

SAP/TFT/Underlords-style auto-battler roguelike. 960x540 pixel art, m5x7 font, DarkTech theme.

**Stack:** Phaser **4.0.0** + Vite 8 + Supabase (auth/cloud). Currency is **credits** (code still says `gold` — rename pending). Full design spec: `design/game-design-spec.md` (locked 2026-04-11).

## Commands

- `npm run dev` — Vite dev server
- `npm test` — vitest (alpha combat engine only, headless Node)
- `npm run sim` / `npm run sim:balance` — alpha combat sim (1 or 1000 battles)
- `npm run alpha:generate` — `design/units/*.md` → `src/config/alpha-units.generated.json`
- `npm run alpha:sprites` — re-bake alpha atlases from `src/config/alpha-sprite-mapping.json`

## Phaser 4 — not 3

- **Never use Phaser 3 APIs.** Most tutorials and LLM training data are Phaser 3. Verify every API against Phaser 4.
- `GeometryMask` is Canvas-only in v4 WebGL; masks moved to the filters system.
- The MCP docs server is the **sole source of truth** for Phaser APIs (no web search, no training knowledge). See `design/mcp_server.md`. Tell the user when you consult it.

## Subsystem rules

Each subdirectory has its own CLAUDE.md — read the relevant one(s) before editing:

- `src/scenes/` — scene flow, state shape, LayoutEditor registration contract
- `src/systems/` — BattleEngine, ShopManager, GhostManager, LayoutEditor internals
- `src/systems/combat/` — headless alpha combat engine (sim/tests only — never imported by scenes)
- `src/rendering/` — Aseprite pipeline, portrait frame resolution, alpha animation wiring, portrait-frame footgun
- `src/ui/` — PixelUI components, Theme (DarkTech palette), m5x7 font
- `src/widgets/` — multi-layer UI widgets
- `src/config/`, `public/assets/`, `design/units/` — data + asset conventions

Project-wide rules live here; subsystem rules stay in subsystem files.

## Workflow

1. **Plan mode always.** Log EVERYTHING — positions, transitions, decisions, fallbacks. Make the plan unambiguous for Codex review.
2. Codex reviews the plan (user copy-pastes externally). Iterate until the plan is right — no revision-loop living.
3. Implement (suggest Sonnet when work is mechanical / no design ambiguity).
4. Codex reviews the code. Ship or fix.

**Do not invoke Codex, codex:rescue, or Codex tooling from Claude Code — the user drives all Codex review externally.**

## Logging

Log aggressively. The user debugs by pasting console output — silent failures are invisible.

- Every layout-managed element: `[Layout] Scene.ElementId at (x, y)`
- Every state transition, network call, and fallback path (log WHY the fallback ran)
- Never `catch (_) {}` — always `catch (e) { console.error('[System] context:', e) }`
- System prefixes: `[Layout]`, `[Editor]`, `[Auth]`, `[Ghost]`, `[Shop]`, `[Battle]`, `[Menu]`, `[Boot]`

## F2 Layout Editor

Claude is weak at spatial layout — the user positions UI visually via F2 drag editor. The `frontend-design` skill targets HTML/CSS and has limited utility for Phaser canvas UI.

- Every authored UI element (panels, labels, buttons, cards) must call `LayoutEditor.register(this, 'elementId', element, defaultX, defaultY)`. Decorative primitives (scanlines, grids, dividers) and combat sprites/health bars do NOT register.
- Each scene hooks `this.events.once('shutdown', () => LayoutEditor.unregisterScene(this.scene.key))`.
- Load priority: **localStorage > `src/config/layout-overrides.json` > hardcoded defaults.** For publish, commit overrides and clear localStorage.
- Hotkeys (edit mode): **F2** toggle · **[ / ]** scale · **G** grid snap · **R** reset · **Esc** deselect. Console: `LayoutEditor.exportJSON()`, `LayoutEditor.clearAll()`.

## Debug Capture (F9 / F10)

Claude is blind to canvas pixels — these hotkeys close that gap. Wired in `src/systems/DebugCapture.js`.

- **F9** — screenshot active scene to PNG (downloads `{sceneKey}-{timestamp}.png`). Drag into chat so Claude can see the layout.
- **F10** — toggle annotated overlay: cyan bounds + `id (x,y) WxH` label on every registered element. Combine with F9 for a labelled screenshot.
- Read-only (no input/gameplay changes). Overlay auto-clears on scene shutdown.
- Self-test: `await DebugCapture.runSelfTest()` in console — exercises F9/F10 and reports `[SelfTest] ✓/✗` per check.
