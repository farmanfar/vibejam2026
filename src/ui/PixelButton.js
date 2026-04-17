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
    const bandPadX = 10;
    const bandPadY = 6;
    const rightExt = 20; // breathing room past text right edge (on top of left pad)

    // Create text first so Phaser can give us the real rendered pixel width.
    // PixelFont.measure() is an approximation; bitmapText.width is authoritative.
    this.text = scene.add.bitmapText(0, 0, FONT_KEY, label, fontSize)
      .setTint(Theme.primaryText);
    this.add(this.text);

    const textW = this.text.width;

    // Focus band (fades in on hover) — sized from actual text width
    this.focusBand = scene.add.rectangle(
      -bandPadX, -bandPadY,
      textW + bandPadX + rightExt,
      measured.height + bandPadY * 2,
      Theme.focusBand
    ).setOrigin(0).setAlpha(0);
    this.addAt(this.focusBand, 0); // insert behind text

    // Hit area (covers the band area)
    const hitW = textW + bandPadX + rightExt;
    const hitH = measured.height + bandPadY * 2;
    this.hitZone = scene.add.rectangle(
      textW / 2, measured.height / 2,
      hitW, hitH, 0x000000, 0
    ).setInteractive({ useHandCursor: true });
    this.add(this.hitZone);

    this._setupTextInteraction();
  }

  _buildFilled(scene, label, fontSize, measured, opts) {
    const isPill = !!(opts.pill || opts.cornerRadius);
    const padX = isPill ? 10 : 16;
    const padY = isPill ? 5 : 8;

    this.text = scene.add.bitmapText(0, 0, FONT_KEY, label, fontSize)
      .setTint(Theme.criticalText)
      .setOrigin(0, 0);

    const textMetrics = this._getFilledTextMetrics();
    const minW = Math.ceil(textMetrics.width + padX * 2);
    const minH = Math.ceil(textMetrics.height + padY * 2);
    const w = Math.max(opts.width ?? 0, minW, isPill ? minH : 0);
    const h = Math.max(opts.height ?? 0, minH);
    this.btnBg = opts.bg ?? Theme.accent;
    this.btnW = w;
    this.btnH = h;
    this.cornerRadius = opts.cornerRadius ?? (opts.pill ? Math.floor(h / 2) : 0);

    if (this.cornerRadius > 0) {
      // Pill / rounded mode — Graphics for visual, transparent rect for hit zone
      this.bgGfx = scene.add.graphics();
      this._redrawBg(this.btnBg);
      this.add(this.bgGfx);

      this.bgRect = scene.add.rectangle(0, 0, w, h, 0, 0).setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.add(this.bgRect);
    } else {
      // Sharp mode — existing Rectangle approach
      this.bgRect = scene.add.rectangle(0, 0, w, h, this.btnBg).setOrigin(0.5);
      this.add(this.bgRect);

      this.borderGfx = scene.add.graphics();
      this.borderGfx.lineStyle(1, Theme.panelBorder, 1);
      this.borderGfx.strokeRect(-w / 2, -h / 2, w, h);
      this.add(this.borderGfx);

      this.bgRect.setInteractive({ useHandCursor: true });
    }

    this.add(this.text);
    this._layoutFilledText();

    this._setupFilledInteraction();
  }

  _layoutFilledText() {
    if (!this.isFilled || !this.text) return;

    const metrics = this._getFilledTextMetrics();
    const centeredX = -(metrics.left + metrics.width / 2);
    const centeredY = -(metrics.top + metrics.height / 2) + 1;

    this.text.setPosition(Math.round(centeredX), Math.round(centeredY));
  }

  _getFilledTextMetrics() {
    const bounds = this.text.getTextBounds(false);
    const local = bounds.local;
    const ink = PixelFont.getTextInkBounds(this.text.text, bounds.characters);

    return ink ?? {
      left: local.x,
      top: local.y,
      width: local.width,
      height: local.height,
    };
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

  _redrawBg(color) {
    if (this.bgGfx) {
      this.bgGfx.clear();
      this.bgGfx.fillStyle(color, 1);
      this.bgGfx.fillRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, this.cornerRadius);
      this.bgGfx.lineStyle(1, Theme.panelBorder, 1);
      this.bgGfx.strokeRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, this.cornerRadius);
    } else {
      this.bgRect.setFillStyle(color);
    }
  }

  _setupFilledInteraction() {
    const bg = this.bgRect;

    bg.on('pointerover', () => {
      if (!this.enabled || this._spinning) return;
      this._redrawBg(brighten(this.btnBg));
    });

    bg.on('pointerout', () => {
      if (this._spinning) return;
      this._redrawBg(this.enabled ? this.btnBg : Theme.disabled);
    });

    bg.on('pointerdown', () => {
      if (!this.enabled || this._spinning) return;
      // White flash
      this._redrawBg(0xffffff);
      this.scene.time.delayedCall(80, () => {
        this._redrawBg(brighten(this.btnBg));
      });
      this.onClick?.();
    });
  }

  /**
   * Slot-machine spin: each letter spins around the horizontal axis (scaleY
   * oscillating between tall and edge-on), cycling random characters at the
   * edge-on moment for a mechanical cylinder feel. Letters settle left-to-right
   * with a stagger, each crashing into place with a squash/stretch bounce.
   *
   * Fires `settleCallback` after the last letter finishes its bounce. No-op on
   * text-style buttons. Ignores clicks while spinning.
   *
   * @param {Function} [settleCallback]
   * @param {object}   [opts]
   * @param {number}   [opts.spinBeforeSettle=420]  — ms everyone spins before first letter locks
   * @param {number}   [opts.stagger=95]            — ms between per-letter settles
   * @param {number}   [opts.flipHalfMs=70]         — ms per half-rotation of a spinning letter
   * @param {string}   [opts.filler]                — character pool for random swaps
   */
  spin(settleCallback, opts = {}) {
    if (this._spinning) return;
    if (!this.isFilled) { settleCallback?.(); return; }

    console.log(`[PixelButton] spin start label="${this.label}"`);
    this._spinning = true;

    const original         = this.label;
    const fontSize         = 7 * this.fontScale;
    const filler           = (opts.filler ?? 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789').split('');
    const spinBeforeSettle = opts.spinBeforeSettle ?? 420;
    const stagger          = opts.stagger ?? 95;
    const flipHalfMs       = opts.flipHalfMs ?? 70;

    // Measure per-character cell rects on the current (original) label so the
    // per-char sprites line up exactly where the real label sits.
    this.text.setText(original);
    this._layoutFilledText();
    const bounds = this.text.getTextBounds(false);
    const charInfo = bounds.characters || [];

    this.text.setVisible(false);

    // Build one bitmap-text per character, centered in its cell, origin (0.5, 0.5)
    // so scaleX/scaleY animations pivot around the letter's middle.
    const pool = [];
    for (let i = 0; i < original.length; i++) {
      const ch = original[i];
      const info = charInfo[i];
      if (!info) continue;
      const cx = this.text.x + (info.x + info.r) / 2;
      const cy = this.text.y + (info.t + info.b) / 2;
      const obj = this.scene.add.bitmapText(cx, cy, FONT_KEY, ch, fontSize)
        .setOrigin(0.5, 0.5)
        .setTint(Theme.criticalText);
      this.add(obj);
      pool.push({ obj, finalChar: ch, settled: false });
    }

    // Per-letter spin loop: 1.0 → 0.15 (edge-on, invisible) → swap char → 0.15 → 1.0.
    // Reads as a cylinder rotating around a horizontal axis.
    const spinOne = (p) => {
      if (p.settled) return;
      this.scene.tweens.add({
        targets: p.obj,
        scaleY: 0.15,
        duration: flipHalfMs,
        ease: 'Sine.In',
        onComplete: () => {
          if (p.settled) return;
          p.obj.setText(filler[Math.floor(Math.random() * filler.length)]);
          this.scene.tweens.add({
            targets: p.obj,
            scaleY: 1.0,
            duration: flipHalfMs,
            ease: 'Sine.Out',
            onComplete: () => spinOne(p),
          });
        },
      });
    };
    pool.forEach(spinOne);

    // Crash-settle: stretch tall (falling in), squish wide (impact), spring up (Back.Out).
    const settleOne = (p) => {
      if (p.settled) return;
      p.settled = true;
      this.scene.tweens.killTweensOf(p.obj);
      p.obj.setText(p.finalChar);
      p.obj.setScale(1.0, 1.45);
      this.scene.tweens.add({
        targets: p.obj,
        scaleX: 1.25, scaleY: 0.65,
        duration: 95,
        ease: 'Sine.InOut',
        onComplete: () => {
          this.scene.tweens.add({
            targets: p.obj,
            scaleX: 1.0, scaleY: 1.0,
            duration: 200,
            ease: 'Back.Out',
          });
        },
      });
    };

    // Stagger settles left-to-right so letters crash in like reels locking.
    pool.forEach((p, i) => {
      this.scene.time.delayedCall(spinBeforeSettle + i * stagger, () => settleOne(p));
    });

    // Cleanup after the last letter's bounce finishes.
    const cleanupDelay = spinBeforeSettle + (pool.length - 1) * stagger + 340;
    this.scene.time.delayedCall(cleanupDelay, () => {
      pool.forEach(p => { this.scene.tweens.killTweensOf(p.obj); p.obj.destroy(); });
      this.text.setVisible(true);
      this.text.setText(original);
      this._layoutFilledText();
      this._spinning = false;
      console.log(`[PixelButton] spin settle label="${original}"`);
      settleCallback?.();
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.isFilled) {
      this._redrawBg(enabled ? this.btnBg : Theme.disabled);
      this.text.setTint(enabled ? Theme.criticalText : Theme.mutedText);
    } else {
      this.text.setTint(enabled ? Theme.primaryText : Theme.disabled);
    }
  }

  setLabel(newLabel) {
    this.label = newLabel;
    this.text.setText(newLabel);
    this._layoutFilledText();
  }
}
