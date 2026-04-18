import { GameObjects } from 'phaser';
import { FONT_KEY } from './PixelFont.js';
import { Theme, lerpColor } from './Theme.js';

const FLASH_DURATION_MS = 220;
const SIZE_PRESETS = {
  small: { w: 26, h: 22, gap: 4, radius: 6, fontSize: 14 },
  large: { w: 30, h: 26, gap: 5, radius: 7, fontSize: 11 },
};

export class UnitStatBadge extends GameObjects.Container {
  constructor(scene, x, y, {
    atk,
    hp,
    isEnemy = false,
    borderColor = 0x12151d,
    borderWidth = 1,
    showIcons = false,
    size = 'small',
    animateChanges = false,
  } = {}) {
    super(scene, x, y);

    this.atk = atk ?? 0;
    this.hp = hp ?? 0;
    this.isEnemy = isEnemy;
    this._preset = SIZE_PRESETS[size] ?? SIZE_PRESETS.small;
    this._borderColor = borderColor;
    this._borderWidth = borderWidth;
    this._showIcons = showIcons;
    this._animateChanges = animateChanges;
    this.hpBaseColor = this.isEnemy ? Theme.hpEnemy : Theme.hpFriendly;
    this.atkBaseColor = Theme.warning;
    this._atkFlashTween = null;
    this._hpFlashTween = null;
    this._atkCountTween = null;
    this._hpCountTween = null;
    this._atkActiveDelta = null;
    this._hpActiveDelta = null;
    this._deltaNodes = new Set();

    const centerOffset = (this._preset.w + this._preset.gap) / 2;
    this.atkBadge = this._createBadgePart(
      scene,
      -centerOffset,
      this.atkBaseColor,
      this.atk,
      'card-icon-atk',
    );
    this.hpBadge = this._createBadgePart(
      scene,
      centerOffset,
      this.hpBaseColor,
      this.hp,
      'card-icon-hp',
    );

    this.add([this.atkBadge.root, this.hpBadge.root]);
    scene.add.existing(this);
  }

  _createBadgePart(scene, x, fillColor, value, iconKey = null) {
    const root = scene.add.container(x, 0);
    const bg = scene.add.graphics();
    const icon = this._showIcons && iconKey && scene.textures.exists(iconKey)
      ? scene.add.image(0, -this._preset.h / 4, iconKey).setOrigin(0.5, 0.5).setScale(0.6)
      : null;
    const text = scene.add.bitmapText(0, 0, FONT_KEY, `${value ?? 0}`, this._preset.fontSize)
      .setTint(Theme.criticalText);

    if (this._showIcons) {
      text.setOrigin(0.5, 0.3);
      text.setPosition(0, this._preset.h / 6);
    } else {
      text.setOrigin(0.5, 0.5);
      text.setPosition(0, 0);
    }

    root.add(icon ? [bg, icon, text] : [bg, text]);
    this._redrawBadge(bg, fillColor);

    return { root, bg, text, icon };
  }

  _redrawBadge(graphics, fillColor) {
    graphics.clear();
    graphics.fillStyle(fillColor, 1);
    graphics.fillRoundedRect(
      -this._preset.w / 2,
      -this._preset.h / 2,
      this._preset.w,
      this._preset.h,
      this._preset.radius,
    );
    graphics.lineStyle(this._borderWidth, this._borderColor, 1);
    graphics.strokeRoundedRect(
      -this._preset.w / 2,
      -this._preset.h / 2,
      this._preset.w,
      this._preset.h,
      this._preset.radius,
    );
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
    const prev = this.atk;
    this.atk = next;
    if (this._animateChanges) {
      this._spawnDelta(this.atkBadge, next - prev, next > prev, '_atkActiveDelta');
      this._runCountUp(this.atkBadge, next, '_atkCountTween');
    } else {
      this.atkBadge.text.setText(`${next}`);
    }
    this.pulse('atk');
  }

  setHp(n) {
    const next = Math.max(0, Math.round(n ?? 0));
    if (next === this.hp) return;
    const prev = this.hp;
    this.hp = next;
    if (this._animateChanges) {
      this._spawnDelta(this.hpBadge, next - prev, next > prev, '_hpActiveDelta');
      this._runCountUp(this.hpBadge, next, '_hpCountTween');
    } else {
      this.hpBadge.text.setText(`${next}`);
    }
    this.pulse(next < prev ? 'hp-loss' : 'hp-gain');
  }

  _runCountUp(part, to, tweenKey) {
    const from = parseInt(part.text.text, 10) || 0;
    if (this[tweenKey]) {
      this[tweenKey].remove();
      this[tweenKey] = null;
    }
    if (from === to) {
      part.text.setText(`${to}`);
      return;
    }
    const proxy = { v: from };
    this[tweenKey] = this.scene.tweens.add({
      targets: proxy,
      v: to,
      duration: 350,
      ease: 'Sine.Out',
      onUpdate: () => part.text.setText(`${Math.round(proxy.v)}`),
      onComplete: () => {
        part.text.setText(`${to}`);
        this[tweenKey] = null;
      },
    });
  }

  _cancelActiveDelta(activeKey) {
    const active = this[activeKey];
    if (!active) return;
    active.tween?.remove();
    active.label?.destroy();
    this._deltaNodes.delete(active);
    this[activeKey] = null;
  }

  _spawnDelta(part, delta, gain, activeKey) {
    if (!delta) return;
    this._cancelActiveDelta(activeKey);

    const sign = gain ? '+' : '-';
    const magnitude = Math.abs(delta);
    const tint = gain ? Theme.success : Theme.error;
    const label = this.scene.add.bitmapText(
      part.root.x,
      part.root.y - this._preset.h / 2 - 2,
      FONT_KEY,
      `${sign}${magnitude}`,
      10,
    ).setOrigin(0.5, 1).setTint(tint);
    this.add(label);

    const entry = { label, tween: null };
    entry.tween = this.scene.tweens.add({
      targets: label,
      y: label.y - 8,
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Sine.Out',
      onComplete: () => {
        this._deltaNodes.delete(entry);
        if (this[activeKey] === entry) this[activeKey] = null;
        label.destroy();
      },
    });
    this._deltaNodes.add(entry);
    this[activeKey] = entry;
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
    if (this._atkCountTween) this._atkCountTween.remove();
    if (this._hpCountTween) this._hpCountTween.remove();
    this._atkFlashTween = this._hpFlashTween = null;
    this._atkCountTween = this._hpCountTween = null;
    this._atkActiveDelta = null;
    this._hpActiveDelta = null;
    for (const entry of this._deltaNodes) {
      entry.tween?.remove();
      entry.label?.destroy();
    }
    this._deltaNodes.clear();
    return super.destroy(fromScene);
  }
}
