import { GameObjects } from 'phaser';
import { Theme, brighten } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';
import { getUnitPortraitRef } from '../rendering/UnitArt.js';

/**
 * Warrior card for the shop - shows sprite, name, stats, cost, faction tag.
 * Visual style: Fantasy Cards aesthetic with DarkTech colors.
 */
export class WarriorCard extends GameObjects.Container {
  static WIDTH = 120;
  static HEIGHT = 160;

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} warrior - warrior data { name, atk, hp, cost, faction, tier, spriteKey }
   * @param {object} [opts]
   * @param {Function} [opts.onClick]
   * @param {boolean} [opts.showCost=true]
   */
  constructor(scene, x, y, warrior, opts = {}) {
    super(scene, x, y);
    this.scene = scene;
    this.warrior = warrior;
    this.cardW = WarriorCard.WIDTH;
    this.cardH = WarriorCard.HEIGHT;

    // Card background
    this.cardBg = scene.add.graphics();
    this._drawCardBg(Theme.fantasyPurpleDark);
    this.add(this.cardBg);

    // Faction tag (top)
    if (warrior.faction) {
      const factionColors = {
        Robot: Theme.accent,
        Undead: Theme.mutedText,
        Beast: Theme.warning,
        Fantasy: 0xcc66ff,
        Tribal: 0x66cc66,
      };
      const tagColor = factionColors[warrior.faction] ?? Theme.accentDim;
      const factionTag = scene.add.bitmapText(
        0,
        -this.cardH / 2 + 8,
        FONT_KEY,
        warrior.faction.toUpperCase(),
        14,
      ).setOrigin(0.5).setTint(tagColor);
      this.add(factionTag);
    }

    const portraitRef = getUnitPortraitRef(scene, warrior, 'warrior card');
    if (scene.textures.exists(portraitRef.key)) {
      this.sprite = scene.add.image(0, -10, portraitRef.key, portraitRef.frame).setScale(2);
    } else {
      this.sprite = scene.add.rectangle(
        0,
        -10,
        28,
        28,
        [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6][warrior.tier ?? 0],
      );
    }
    this.add(this.sprite);

    const name = scene.add.bitmapText(
      0,
      30,
      FONT_KEY,
      warrior.name ?? 'Unknown',
      14,
    ).setOrigin(0.5).setTint(Theme.criticalText);
    this.add(name);

    const statsStr = `ATK:${warrior.atk ?? 0}  HP:${warrior.hp ?? 0}`;
    const stats = scene.add.bitmapText(0, 48, FONT_KEY, statsStr, 14)
      .setOrigin(0.5).setTint(Theme.primaryText);
    this.add(stats);

    if (opts.showCost !== false && warrior.cost != null) {
      const costBadge = scene.add.graphics();
      costBadge.fillStyle(Theme.warning, 1);
      costBadge.fillCircle(this.cardW / 2 - 14, -this.cardH / 2 + 14, 12);
      this.add(costBadge);

      const costText = scene.add.bitmapText(
        this.cardW / 2 - 14,
        -this.cardH / 2 + 14,
        FONT_KEY,
        `${warrior.cost}`,
        14,
      ).setOrigin(0.5).setTint(Theme.screenBg);
      this.add(costText);
    }

    this.hitZone = scene.add.rectangle(0, 0, this.cardW, this.cardH, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this.add(this.hitZone);

    if (opts.onClick) {
      this._setupInteraction(opts.onClick);
    }

    scene.add.existing(this);
  }

  _drawCardBg(color) {
    this.cardBg.clear();
    const w = this.cardW;
    const h = this.cardH;
    const r = 4;

    this.cardBg.fillStyle(color, 1);
    this.cardBg.fillRoundedRect(-w / 2, -h / 2, w, h, r);

    this.cardBg.lineStyle(1, Theme.fantasyBorderGold, 1);
    this.cardBg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    this.cardBg.lineStyle(1, Theme.fantasyBorderGold, 0.3);
    this.cardBg.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r - 1);
  }

  _setupInteraction(onClick) {
    this.hitZone.on('pointerover', () => {
      this.scene.tweens.add({
        targets: this,
        y: this.y - 8,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 120,
        ease: 'Power2',
      });
      this._drawCardBg(brighten(Theme.fantasyPurpleDark, 20));
    });

    this.hitZone.on('pointerout', () => {
      this.scene.tweens.add({
        targets: this,
        y: this.y + 8,
        scaleX: 1,
        scaleY: 1,
        duration: 120,
        ease: 'Power2',
      });
      this._drawCardBg(Theme.fantasyPurpleDark);
    });

    this.hitZone.on('pointerdown', () => {
      this._drawCardBg(Theme.fantasyGold);
      this.scene.time.delayedCall(100, () => {
        this._drawCardBg(Theme.fantasyPurpleDark);
      });
      onClick();
    });
  }

  setDisabled() {
    this.setAlpha(0.4);
    this.hitZone.disableInteractive();
  }
}
