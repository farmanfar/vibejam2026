/**
 * DarkTech theme — ported from TorchWars PixelUI.
 * Near-black blue-grey backgrounds, cool blue accents, m5x7 pixel font.
 * Two button styles: text-glow (9Kings) and filled rounded-rect (Balatro).
 */
export const Theme = {
  // Backgrounds
  screenBg:     0x101116,  // rgb(16, 17, 22)
  panelBg:      0x181a22,  // rgb(24, 26, 34)
  panelBorder:  0x3c3c44,  // rgb(60, 60, 68)

  // Text hierarchy (brightest → dimmest)
  criticalText: 0xeef2ff,  // rgb(238, 242, 255) — titles, hover
  primaryText:  0xbec6d6,  // rgb(190, 198, 214) — body
  mutedText:    0x687284,  // rgb(104, 114, 132) — inactive
  ambientText:  0x424a5a,  // rgb(66, 74, 90)   — hints

  // Accents
  accent:       0x7cceff,  // rgb(124, 206, 255) — primary blue
  accentDim:    0x54769c,  // rgb(84, 118, 156)
  hover:        0xccebff,  // rgb(204, 235, 255) — bright ice
  selection:    0x6ed2ff,  // rgb(110, 210, 255)

  // Semantic
  warning:      0xffcc78,  // rgb(255, 204, 120) — gold
  error:        0xff6060,  // rgb(255, 96, 96)
  success:      0x64b4d2,  // rgb(100, 180, 210) — teal

  // Interaction
  controllerFocus: 0xff945c, // rgb(255, 148, 92) — orange
  focusBand:    0x2e4460,  // rgb(46, 68, 96)
  disabled:     0x585c68,  // rgb(88, 92, 104)

  // Health bar
  hpFriendly:   0x64b4d2,  // rgb(100, 180, 210) — teal
  hpFriendlyBg: 0x283c46,  // rgb(40, 60, 70)
  hpEnemy:      0xb43232,  // rgb(180, 50, 50)
  hpEnemyBg:    0x3c1919,  // rgb(60, 25, 25)

  // Card / Fantasy overlay
  fantasyGold:        0xdcbe82,  // rgb(220, 190, 130)
  fantasyGoldBright:  0xffe1a0,  // rgb(255, 225, 160)
  fantasyPurpleDark:  0x32263a,  // rgb(50, 38, 58)
  fantasyBorderGold:  0xc3a04b,  // rgb(195, 160, 75)

  // Spacing (in native pixels, scale as needed)
  spacingSmall:  4,
  spacingMedium: 8,
  spacingLarge:  16,
  spacingXLarge: 24,
  screenMargin:  16,

  // Font scales (multiplied by glyph size 5x7)
  fontScaleSmall:  2,  // 10x14 px glyphs
  fontScaleBody:   3,  // 15x21 px glyphs
  fontScaleHeader: 4,  // 20x28 px glyphs
  fontScaleTitle:  6,  // 30x42 px glyphs
  fontScaleBanner: 8,  // 40x56 px glyphs
};

/** Convert a 0xRRGGBB theme color to a CSS rgb string */
export function colorToCSS(hex) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgb(${r},${g},${b})`;
}

/** Brighten a color by a fixed amount per channel (for hover) */
export function brighten(hex, amount = 30) {
  const r = Math.min(255, ((hex >> 16) & 0xff) + amount);
  const g = Math.min(255, ((hex >> 8) & 0xff) + amount);
  const b = Math.min(255, (hex & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

/** Lerp between two hex colors */
export function lerpColor(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
