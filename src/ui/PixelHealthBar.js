import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';

/**
 * Segmented HP bar ported from TorchWars PixelHealthBar.
 * Teal for friendly, red for enemy. Segments fill/empty to show model count.
 */
export class PixelHealthBar extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {number} maxHp
   * @param {object} [opts]
   * @param {number} [opts.width=50]
   * @param {number} [opts.height=6]
   * @param {boolean} [opts.isEnemy=false]
   * @param {number} [opts.segments] - number of segments (default: 1 continuous bar)
   */
  constructor(scene, x, y, maxHp, opts = {}) {
    super(scene, x, y);
    this.maxHp = maxHp;
    this.currentHp = maxHp;
    this.barW = opts.width ?? 50;
    this.barH = opts.height ?? 6;
    this.isEnemy = opts.isEnemy ?? false;
    this.segments = opts.segments ?? 1;

    const fillColor = this.isEnemy ? Theme.hpEnemy : Theme.hpFriendly;
    const bgColor = this.isEnemy ? Theme.hpEnemyBg : Theme.hpFriendlyBg;

    if (this.segments > 1) {
      this._buildSegmented(scene, fillColor, bgColor);
    } else {
      this._buildContinuous(scene, fillColor, bgColor);
    }

    scene.add.existing(this);
  }

  _buildContinuous(scene, fillColor, bgColor) {
    // Background
    this.bgRect = scene.add.rectangle(0, 0, this.barW, this.barH, bgColor).setOrigin(0.5);
    this.add(this.bgRect);

    // Fill
    this.fillRect = scene.add.rectangle(
      -this.barW / 2, 0,
      this.barW, this.barH,
      fillColor
    ).setOrigin(0, 0.5);
    this.add(this.fillRect);
  }

  _buildSegmented(scene, fillColor, bgColor) {
    const gap = 2;
    const segW = Math.max(4, (this.barW - (this.segments - 1) * gap) / this.segments);
    const totalW = this.segments * segW + (this.segments - 1) * gap;
    const startX = -totalW / 2;

    this.segmentRects = [];
    for (let i = 0; i < this.segments; i++) {
      const sx = startX + i * (segW + gap);
      const bg = scene.add.rectangle(sx, 0, segW, this.barH, bgColor).setOrigin(0, 0.5);
      const fill = scene.add.rectangle(sx, 0, segW, this.barH, fillColor).setOrigin(0, 0.5);
      this.add(bg);
      this.add(fill);
      this.segmentRects.push({ bg, fill, segW });
    }
  }

  setHp(current) {
    this.currentHp = Math.max(0, Math.min(current, this.maxHp));
    const ratio = this.currentHp / this.maxHp;

    if (this.segments > 1) {
      const filledSegs = Math.ceil(ratio * this.segments);
      this.segmentRects.forEach((seg, i) => {
        seg.fill.setVisible(i < filledSegs);
      });
    } else {
      this.fillRect.width = this.barW * ratio;

      // Color shift: green → yellow → red
      if (ratio < 0.3) {
        this.fillRect.setFillStyle(Theme.error);
      } else if (ratio < 0.6) {
        this.fillRect.setFillStyle(Theme.warning);
      } else {
        this.fillRect.setFillStyle(this.isEnemy ? Theme.hpEnemy : Theme.hpFriendly);
      }
    }
  }

  /** Animate HP change with tween */
  animateHp(newHp, duration = 300) {
    const startHp = this.currentHp;
    const endHp = Math.max(0, Math.min(newHp, this.maxHp));

    this.scene.tweens.addCounter({
      from: startHp,
      to: endHp,
      duration,
      ease: 'Power2',
      onUpdate: (tween) => {
        this.setHp(Math.round(tween.getValue()));
      },
    });
  }
}
