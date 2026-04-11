import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';

/**
 * Container panel with optional title bar and 1px border.
 * Ported from TorchWars PixelPanel.
 */
export class PixelPanel extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {object} [opts]
   * @param {string} [opts.title] - Optional title bar text
   * @param {number} [opts.bg] - Background color (default: panelBg)
   * @param {number} [opts.border] - Border color (default: panelBorder)
   * @param {number} [opts.borderWidth] - Border thickness (default: 1)
   * @param {number} [opts.cornerRadius] - Corner radius (default: 0 for pixel-perfect)
   */
  constructor(scene, x, y, w, h, opts = {}) {
    super(scene, x, y);

    this.panelW = w;
    this.panelH = h;
    const bg = opts.bg ?? Theme.panelBg;
    const border = opts.border ?? Theme.panelBorder;
    const borderW = opts.borderWidth ?? 1;

    // Background fill
    this.bgRect = scene.add.rectangle(0, 0, w, h, bg).setOrigin(0);
    this.add(this.bgRect);

    // Border (four 1px lines for pixel-perfect edges)
    this.borderGfx = scene.add.graphics();
    this.borderGfx.lineStyle(borderW, border, 1);
    this.borderGfx.strokeRect(0, 0, w, h);
    this.add(this.borderGfx);

    // Title bar
    if (opts.title) {
      const titleBarH = 24;
      const titleBar = scene.add.rectangle(0, 0, w, titleBarH, Theme.focusBand).setOrigin(0);
      this.add(titleBar);

      // Title divider line
      const divider = scene.add.rectangle(0, titleBarH, w, 1, border).setOrigin(0);
      this.add(divider);

      // Title text
      const titleText = scene.add.bitmapText(
        Theme.spacingMedium, 4, FONT_KEY, opts.title.toUpperCase(), 14
      ).setTint(Theme.criticalText);
      this.add(titleText);

      this.contentOffsetY = titleBarH + 1;
    } else {
      this.contentOffsetY = 0;
    }

    scene.add.existing(this);
  }

  /** Get usable content area bounds (below title bar if present) */
  getContentBounds() {
    return {
      x: Theme.spacingMedium,
      y: this.contentOffsetY + Theme.spacingMedium,
      width: this.panelW - Theme.spacingMedium * 2,
      height: this.panelH - this.contentOffsetY - Theme.spacingMedium * 2,
    };
  }
}
