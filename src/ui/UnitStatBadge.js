import { GameObjects } from 'phaser';
import { FONT_KEY } from './PixelFont.js';
import { Theme, lerpColor } from './Theme.js';

const BADGE_W = 26;
const BADGE_H = 22;
const BADGE_GAP = 4;
const BADGE_RADIUS = 6;
const BORDER_COLOR = 0x12151d;
const FLASH_DURATION_MS = 220;

export class UnitStatBadge extends GameObjects.Container {
  constructor(scene, x, y, { atk, hp, isEnemy = false } = {}) {
    super(scene, x, y);

    this.atk = atk ?? 0;
    this.hp = hp ?? 0;
    this.isEnemy = isEnemy;
    this.hpBaseColor = this.isEnemy ? Theme.hpEnemy : Theme.hpFriendly;
    this.atkBaseColor = Theme.warning;
    this._atkFlashTween = null;
    this._hpFlashTween = null;

    const centerOffset = (BADGE_W + BADGE_GAP) / 2;
    this.atkBadge = this._createBadgePart(scene, -centerOffset, this.atkBaseColor, this.atk);
    this.hpBadge = this._createBadgePart(scene, centerOffset, this.hpBaseColor, this.hp);

    this.add([this.atkBadge.root, this.hpBadge.root]);
    scene.add.existing(this);
  }

  _createBadgePart(scene, x, fillColor, value) {
    const root = scene.add.container(x, 0);
    const bg = scene.add.graphics();
    const text = scene.add.bitmapText(0, 0, FONT_KEY, `${value ?? 0}`, 14)
      .setOrigin(0.5)
      .setTint(Theme.criticalText);

    root.add([bg, text]);
    this._redrawBadge(bg, fillColor);

    return { root, bg, text };
  }

  _redrawBadge(graphics, fillColor) {
    graphics.clear();
    graphics.fillStyle(fillColor, 1);
    graphics.fillRoundedRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, BADGE_RADIUS);
    graphics.lineStyle(1, BORDER_COLOR, 1);
    graphics.strokeRoundedRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, BADGE_RADIUS);
  }

  _pulseScale(target) {
    this.scene.tweens.killTweensOf(target);
    target.setScale(1);
    this.scene.tweens.add({
      targets: target,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 80,
      yoyo: true,
      ease: 'Back.Out',
    });
  }

  _pulseFill(part, baseColor, flashColor, tweenKey) {
    if (this[tweenKey]) {
      this[tweenKey].remove();
      this[tweenKey] = null;
    }

    this._redrawBadge(part.bg, flashColor);
    this[tweenKey] = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: FLASH_DURATION_MS,
      ease: 'Linear',
      onUpdate: (tween) => {
        const color = lerpColor(flashColor, baseColor, tween.getValue());
        this._redrawBadge(part.bg, color);
      },
      onComplete: () => {
        this._redrawBadge(part.bg, baseColor);
        this[tweenKey] = null;
      },
    });
  }

  setAtk(n) {
    const next = Math.max(0, Math.round(n ?? 0));
    if (next === this.atk) return;
    this.atk = next;
    this.atkBadge.text.setText(`${next}`);
    this.pulse('atk');
  }

  setHp(n) {
    const next = Math.max(0, Math.round(n ?? 0));
    if (next === this.hp) return;
    const prev = this.hp;
    this.hp = next;
    this.hpBadge.text.setText(`${next}`);
    this.pulse(next < prev ? 'hp-loss' : 'hp-gain');
  }

  pulse(kind) {
    if (kind === 'atk') {
      this._pulseScale(this.atkBadge.root);
      this._pulseFill(this.atkBadge, this.atkBaseColor, Theme.fantasyGoldBright, '_atkFlashTween');
      return;
    }

    this._pulseScale(this.hpBadge.root);
    const flashColor = kind === 'hp-loss' ? Theme.error : Theme.success;
    this._pulseFill(this.hpBadge, this.hpBaseColor, flashColor, '_hpFlashTween');
  }

  destroy(fromScene) {
    this.scene?.tweens.killTweensOf(this.atkBadge?.root);
    this.scene?.tweens.killTweensOf(this.hpBadge?.root);
    if (this._atkFlashTween) this._atkFlashTween.remove();
    if (this._hpFlashTween) this._hpFlashTween.remove();
    this._atkFlashTween = null;
    this._hpFlashTween = null;
    return super.destroy(fromScene);
  }
}
