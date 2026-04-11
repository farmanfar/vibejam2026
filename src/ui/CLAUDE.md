# CLAUDE.md — ui/

PixelUI component library. Ported from TorchWars — independent copy, no shared imports.

## Theme

**DarkTech palette** in `Theme.js`. Near-black blue-grey backgrounds, cool blue accents, fantasy gold overlays for cards. Includes spacing constants and font scale presets.

Key color groups: screen/panel backgrounds, 4-tier text hierarchy (critical → ambient), accent blue + hover/selection variants, semantic (warning gold, error red, success teal), health bar pairs, fantasy card overlay (gold + purple).

**Never use `Color * float` for opacity** — dims RGB. Use alpha parameter on Phaser objects instead.

## Font

`PixelFont.js` — m5x7 bitmap font (5×7 glyphs) with embedded glyph data. Call `PixelFont.init(scene)` once in BootScene. Use `FONT_KEY` for all `bitmapText` calls. `PixelFont.measure(text, scale)` for layout calculations.

## Components

| Component | Purpose | Key API |
|---|---|---|
| **PixelButton** | Two styles: text-glow (9Kings) and filled (Balatro) | `new PixelButton(scene, x, y, label, onClick, opts)` |
| **PixelLabel** | Positioned bitmap text with theme colors | `new PixelLabel(scene, x, y, text, opts)` |
| **PixelPanel** | Container with optional title bar, 1px border | `new PixelPanel(scene, x, y, w, h, opts)` |
| **PixelHealthBar** | HP bar with friendly (teal) / enemy (red) styles | `new PixelHealthBar(scene, x, y, maxHp, opts)` |
| **FloatingBanner** | Async animated banner (stage announcements, victory) | `FloatingBanner.show(scene, text, opts)` returns Promise |
| **WarriorCard** | Shop card: sprite, name, stats, cost badge, faction tag | `new WarriorCard(scene, x, y, warrior, opts)` |

All components extend `GameObjects.Container` and call `scene.add.existing(this)`.

## Upcoming

- **WarriorCard** needs a star-level indicator (visual pips or border treatment showing 1★/2★/3★/legendary). Legendary cards should have a distinct visual treatment (different border color, glow, or animation).
- **CommanderCard** — new component for displaying the active commander. Larger format than WarriorCard, shows synergy bonuses and swap cost.
- **Shop background** — parallax layer that changes every 3 wins. Not a UI component per se, but will live near the scene/rendering boundary.

## Rules

- All new components must follow the Container pattern (extend `GameObjects.Container`, add children, call `scene.add.existing`).
- Use `Theme` constants for all colors — no hardcoded hex values except in Theme.js itself.
- Export new components from `index.js` barrel file.
