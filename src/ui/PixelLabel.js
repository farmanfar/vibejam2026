import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';

/**
 * Positioned text label with theme-aware color and scale.
 * Thin wrapper around BitmapText — handles origin, tint, and alignment.
 */
export class PixelLabel extends GameObjects.BitmapText {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {object} [opts]
   * @param {number} [opts.scale=2] - font scale multiplier
   * @param {'critical'|'primary'|'muted'|'ambient'|'accent'|'warning'|'error'} [opts.color='primary']
   * @param {number} [opts.tint] - override with raw hex color
   * @param {'left'|'center'|'right'} [opts.align='left']
   */
  constructor(scene, x, y, text, opts = {}) {
    const scale = opts.scale ?? 2;
    const fontSize = 7 * scale;

    super(scene, x, y, FONT_KEY, text, fontSize);

    // Color
    const colorMap = {
      critical: Theme.criticalText,
      primary: Theme.primaryText,
      muted: Theme.mutedText,
      ambient: Theme.ambientText,
      accent: Theme.accent,
      warning: Theme.warning,
      error: Theme.error,
    };
    const tint = opts.tint ?? colorMap[opts.color ?? 'primary'] ?? Theme.primaryText;
    this.setTint(tint);

    // Alignment / origin
    const align = opts.align ?? 'left';
    if (align === 'center') this.setOrigin(0.5, 0);
    else if (align === 'right') this.setOrigin(1, 0);
    else this.setOrigin(0, 0);

    scene.add.existing(this);
  }
}
