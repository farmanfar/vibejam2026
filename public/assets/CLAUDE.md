# CLAUDE.md — public/assets/

All art is from PENUSBMIC asset packs (STRANDED + THE DARK series). See `design/asset-catalog.md` for full pack inventory.

## Directory Structure

```
assets/
├── commanders/          # PENUSBMIC Fantasy Cards pack — commander character art
│   ├── cards/           # 25 card PNGs (character on bordered card frame)
│   ├── sprites/         # 27 detailed character PNGs (transparent bg, ~100x100)
│   └── source/          # Aseprite originals (Card BORDER, Card MEGA, Cards SPRITE)
├── cards/               # Generic card UI elements
│   ├── blanks/          # 11 blank card frame templates (match commander card borders)
│   └── icons/           # 27 small skill/item icons (Icon1-27, ~16x16)
├── merchants/           # Shop NPC art
│   ├── npcs/            # 43 merchant sprites — horizontal animation strips (multi-frame)
│   ├── decor/           # 9 decorative NPCs (statues, guards, etc.)
│   ├── shops/           # 3 shop background variants (blood, herb, tech)
│   └── portals/         # 4 portal animations
├── parallax/            # 29 PENUSBMIC parallax background sets (~180 PNGs total)
│   └── {set-name}/      # Each set: 3-11 layer PNGs (sky → foreground)
├── warriors/            # Unit art (managed by unit-catalog pipeline)
│   ├── runtime/         # Exported portraits/sheets for game use
│   └── source/          # Aseprite source files
├── fonts/               # m5x7.ttf bitmap font
├── backgrounds/         # (empty — backgrounds use parallax sets)
└── ui/                  # (empty — UI is procedural via PixelUI components)
```

## Commander Art (Fantasy Cards Pack)

Commanders use the detailed character sprites from the Fantasy Cards pack. 25 cards + 27 sprites of unique characters.

- **For in-game display:** use `sprites/SpriteN.png` — detailed characters on transparent background, suitable for scaling
- **For selection UI / card display:** use `cards/cardN.png` — same characters pre-composited onto bordered card frames
- Card and sprite numbers correspond (card1 = Sprite1, etc.)
- Source Aseprite files in `source/` if new exports are needed

## Merchant NPCs

All merchant sprites in `npcs/` are **horizontal animation strips** (multiple frames side-by-side in one PNG). To display:
- Load as spritesheet with calculated frame width (`image.width / frameCount`)
- Or crop to first frame for static display
- Color variants exist for some merchants (blue/green/red) + matching shadow versions

## Parallax Backgrounds

- Managed via `src/rendering/parallax-manifest.json` and `FactionPalettes.js`
- Preloaded in BootScene (all 29 sets, ~180 textures)
- Each set has 3-11 layers ordered back-to-front (sky, far, mid, close)
- Sets with fewer than 3 layers are skipped by the parallax system

## Rules

- All art is PENUSBMIC exclusively. Do not import art from other sources.
- Never hand-edit `*.generated.json` files in `config/` — those are produced by the import pipeline.
- Warrior art is managed by the unit-catalog system (`tools/build_sprite_catalog.py`). Do not manually add files to `warriors/runtime/`.
- Parallax sets are registered in `parallax-manifest.json`. Adding a new set requires updating the manifest.
