# CLAUDE.md — ui/

PixelUI component library. Independent copy (originally ported from TorchWars — no shared imports).

## Theme

**DarkTech palette** in `Theme.js`. Near-black blue-grey backgrounds, cool blue accents, fantasy gold overlays for cards. Includes spacing constants, font scale presets, and color utility functions (`brighten`, `lerpColor`, `colorToCSS`).

Key color groups: screen/panel backgrounds, 4-tier text hierarchy (critical → ambient), accent blue + hover/selection variants, semantic (warning gold, error red, success teal), health bar pairs, fantasy card overlay (gold + purple).

**Never use `Color * float` for opacity** — dims RGB. Use alpha parameter on Phaser objects instead.

## Font

`PixelFont.js` — m5x7 bitmap font (5x7 glyphs) with embedded glyph data. Call `PixelFont.init(scene)` once in BootScene. Use `FONT_KEY` for all `bitmapText` calls. `PixelFont.measure(text, scale)` for layout calculations.

## Components

| Component | Purpose | Key API |
|---|---|---|
| **PixelButton** | Two styles: text-glow (9Kings) and filled (Balatro). Supports disabled state. | `new PixelButton(scene, x, y, label, onClick, opts)` |
| **PixelLabel** | Positioned bitmap text with theme colors + alignment | `new PixelLabel(scene, x, y, text, opts)` |
| **PixelPanel** | Container with optional title bar, 1px border | `new PixelPanel(scene, x, y, w, h, opts)` |
| **PixelHealthBar** | HP bar with friendly (teal) / enemy (red) styles | `new PixelHealthBar(scene, x, y, maxHp, opts)` |
| **FloatingBanner** | Async animated banner (stage announcements, victory). Fade-in, hold, fade-out. | `FloatingBanner.show(scene, text, opts)` returns Promise |
| **WarriorCard** | Shop card: sprite, name, ATK/HP stats, cost badge, faction tag. Hover lift + scale, click effects. | `new WarriorCard(scene, x, y, warrior, opts)` |
| **PixelTypewriter** | Animated typewriter text with message pool rotation | `new PixelTypewriter(scene, x, y, messages, opts)` |
| **PixelTextInput** | Text input with char filter, max length, placeholder | `new PixelTextInput(scene, x, y, opts)` |
| **PixelList** | Vertical uniform-scale menu list (one Container, one scale for every row). Hover: slide + focus band. Ported from TorchWars. | `new PixelList(scene, x, y, items, opts)` where `items: [{ label, onClick }]` |

All components extend `GameObjects.Container` and call `scene.add.existing(this)`. Exception: PixelLabel extends BitmapText directly.

## Upcoming

- **WarriorCard** needs: star-level indicator (visual pips or border treatment for 1/2/3-star). Class tag display alongside faction tag. Sell price indicator (full refund vs half).
- **CommanderCard** — new component for active commander. Shows synergy threshold reduction, commander identity, swap offer UI (every 3 wins, 10 credits).
- **MerchantDisplay** — new component showing current merchant type and its pool bias effect.
- **Class synergy icons** — visual indicators for mechanical class effects (armor, splash, double-attack, taunt, heal).

## Rules

- All new components must follow the Container pattern (extend `GameObjects.Container`, add children, call `scene.add.existing`). Exception: PixelLabel extends BitmapText directly.
- Use `Theme` constants for all colors — no hardcoded hex values except in Theme.js itself.
- Export new components from `index.js` barrel file.
- **LayoutEditor:** components are NOT responsible for registering themselves — the scene that creates them calls `LayoutEditor.register()`. Components just need settable x/y (all GameObjects already have this).
