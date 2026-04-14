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

    this._align = opts.align ?? 'left';

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

    // Use Phaser's origin system for alignment — manual x offset breaks when
    // width is 0 at construction time (Phaser 4 BitmapText deferred sizing).
    const originX = this._align === 'center' ? 0.5 : this._align === 'right' ? 1 : 0;
    this.setOrigin(originX, 0);
    scene.add.existing(this);
  }
}
