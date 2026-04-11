import { GameObjects } from 'phaser';
import { Theme, brighten } from './Theme.js';
import { FONT_KEY, PixelFont } from './PixelFont.js';

/**
 * Two button styles ported from TorchWars PixelButton:
 *
 * TEXT style (9Kings): floating pixel text, no background.
 *   Hover: text slides right 6px, glow aura + focus band fade in.
 *
 * FILLED style (Balatro): rounded-rect colored background.
 *   Hover: bg brightens. Click: white flash.
 */
export class PixelButton extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} label
   * @param {Function} onClick
   * @param {object} [opts]
   * @param {'text'|'filled'} [opts.style='text']
   * @param {number} [opts.scale=3] - font scale
   * @param {number} [opts.bg] - filled bg color
   * @param {number} [opts.width] - filled button width (auto if omitted)
   * @param {number} [opts.height] - filled button height (auto if omitted)
   */
  constructor(scene, x, y, label, onClick, opts = {}) {
    super(scene, x, y);
    this.scene = scene;
    this.label = label;
    this.onClick = onClick;
    this.isFilled = (opts.style === 'filled');
    this.fontScale = opts.scale ?? 3;
    this.enabled = true;

    const fontSize = 7 * this.fontScale;
    const measured = PixelFont.measure(label, this.fontScale);

    if (this.isFilled) {
      this._buildFilled(scene, label, fontSize, measured, opts);
    } else {
      this._buildText(scene, label, fontSize, measured);
    }

    scene.add.existing(this);
  }

  _buildText(scene, label, fontSize, measured) {
    // Focus band (fades in on hover)
    const bandPadX = 10;
    const bandPadY = 6;
    this.focusBand = scene.add.rectangle(
      -bandPadX, -bandPadY,
      measured.width + bandPadX * 2,
      measured.height + bandPadY * 2,
      Theme.focusBand
    ).setOrigin(0).setAlpha(0);
    this.add(this.focusBand);

    // Text
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, label, fontSize)
      .setTint(Theme.primaryText);
    this.add(this.text);

    // Hit area (covers the band area)
    const hitW = measured.width + bandPadX * 2;
    const hitH = measured.height + bandPadY * 2;
    this.hitZone = scene.add.rectangle(
      measured.width / 2, measured.height / 2,
      hitW, hitH, 0x000000, 0
    ).setInteractive({ useHandCursor: true });
    this.add(this.hitZone);

    this._setupTextInteraction();
  }

  _buildFilled(scene, label, fontSize, measured, opts) {
    const padX = 16;
    const padY = 8;
    const w = opts.width ?? (measured.width + padX * 2);
    const h = opts.height ?? (measured.height + padY * 2);
    this.btnBg = opts.bg ?? Theme.accent;
    this.btnW = w;
    this.btnH = h;

    // Background rect
    this.bgRect = scene.add.rectangle(0, 0, w, h, this.btnBg).setOrigin(0.5);
    this.add(this.bgRect);

    // Border
    this.borderGfx = scene.add.graphics();
    this.borderGfx.lineStyle(1, Theme.panelBorder, 1);
    this.borderGfx.strokeRect(-w / 2, -h / 2, w, h);
    this.add(this.borderGfx);

    // Text (centered)
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, label, fontSize)
      .setOrigin(0.5)
      .setTint(Theme.criticalText);
    this.add(this.text);

    // Hit area
    this.bgRect.setInteractive({ useHandCursor: true });

    this._setupFilledInteraction();
  }

  _setupTextInteraction() {
    const zone = this.hitZone;

    zone.on('pointerover', () => {
      if (!this.enabled) return;
      // Slide text right + focus band fade in
      this.scene.tweens.add({
        targets: this.text,
        x: 6,
        duration: 120,
        ease: 'Power2',
      });
      this.scene.tweens.add({
        targets: this.focusBand,
        alpha: 0.35,
        duration: 120,
      });
      this.text.setTint(Theme.hover);
    });

    zone.on('pointerout', () => {
      this.scene.tweens.add({
        targets: this.text,
        x: 0,
        duration: 120,
        ease: 'Power2',
      });
      this.scene.tweens.add({
        targets: this.focusBand,
        alpha: 0,
        duration: 120,
      });
      this.text.setTint(this.enabled ? Theme.primaryText : Theme.disabled);
    });

    zone.on('pointerdown', () => {
      if (!this.enabled) return;
      this.text.setTint(0xffffff);
      this.scene.time.delayedCall(80, () => {
        this.text.setTint(Theme.hover);
      });
      this.onClick?.();
    });
  }

  _setupFilledInteraction() {
    const bg = this.bgRect;

    bg.on('pointerover', () => {
      if (!this.enabled) return;
      bg.setFillStyle(brighten(this.btnBg));
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(this.enabled ? this.btnBg : Theme.disabled);
    });

    bg.on('pointerdown', () => {
      if (!this.enabled) return;
      // White flash
      bg.setFillStyle(0xffffff);
      this.scene.time.delayedCall(80, () => {
        bg.setFillStyle(brighten(this.btnBg));
      });
      this.onClick?.();
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.isFilled) {
      this.bgRect.setFillStyle(enabled ? this.btnBg : Theme.disabled);
      this.text.setTint(enabled ? Theme.criticalText : Theme.mutedText);
    } else {
      this.text.setTint(enabled ? Theme.primaryText : Theme.disabled);
    }
  }

  setLabel(newLabel) {
    this.label = newLabel;
    this.text.setText(newLabel);
  }
}
