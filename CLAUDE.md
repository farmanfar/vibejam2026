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
├── config/              # Data definitions (warriors, synergies, future: commanders)
├── scenes/              # Phaser Scenes (Boot, Menu, Shop, Battle, GameOver, HallOfFame)
├── systems/             # Game logic (BattleEngine, ShopManager, GhostManager)
└── ui/                  # PixelUI components (Theme, Font, Button, Label, Panel, etc.)
```
