import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';
import { getUnitPortraitRef } from '../rendering/UnitArt.js';

// Faction → blank card frame texture key. Robot/Folk/Monster are the only
// factions in the live alpha roster; the others are mapped for future use.
const FACTION_FRAME = {
  Robot:   'card-blank-2', // teal/slate
  Folk:    'card-blank-1', // forest green
  Monster: 'card-blank-6', // charcoal
  Undead:  'card-blank-7', // deep purple
  Beast:   'card-blank-5', // warm brown
  Fantasy: 'card-blank-4', // purple
  Tribal:  'card-blank-3', // parchment
};

const FACTION_TAG_COLOR = {
  Robot:   Theme.accent,
  Folk:    0x66cc66,
  Monster: Theme.error,
  Undead:  Theme.mutedText,
  Beast:   Theme.warning,
  Fantasy: 0xcc66ff,
  Tribal:  0xffcc78,
};

/**
 * Warrior card for the shop. Native PENUSBMIC blank card frame (106x138)
 * displayed at 124x160 with portrait, name, ATK/HP, cost, class, tier,
 * and a hover-revealed rules text in the bottom half.
 *
 * Rest state: card depth=1, only top half visible (bottom hidden by
 * ShopScene's cardShelf at y=230). Hover: card rises 80px, depth=10.
 */
export class WarriorCard extends GameObjects.Container {
  static WIDTH = 124;
  static HEIGHT = 160;
  static RISE_DISTANCE = 80; // half of HEIGHT — rises clear of the shelf

  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} warrior
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
    this._restX = x;
    this._restY = y;
    this._tweening = false;
    this._isHovered = false;

    // ── Card frame (background) ──────────────────────────────
    const frameKey = FACTION_FRAME[warrior.faction] ?? 'card-blank-1';
    if (scene.textures.exists(frameKey)) {
      this.frame = scene.add.image(0, 0, frameKey).setDisplaySize(this.cardW, this.cardH);
    } else {
      // Fallback: solid panel if the texture failed to load
      this.frame = scene.add.rectangle(0, 0, this.cardW, this.cardH, Theme.fantasyPurpleDark)
        .setStrokeStyle(1, Theme.fantasyBorderGold);
      console.warn(`[WarriorCard] Missing card frame texture ${frameKey} for ${warrior.name}`);
    }
    this.add(this.frame);

    // ── Faction tag (top of card) ────────────────────────────
    const tagColor = FACTION_TAG_COLOR[warrior.faction] ?? Theme.accentDim;
    this.factionTag = scene.add.bitmapText(
      0, -70, FONT_KEY, (warrior.faction ?? '?').toUpperCase(), 7,
    ).setOrigin(0.5, 0.5).setTint(tagColor);
    this.add(this.factionTag);

    // ── Portrait sprite (centered top half) ──────────────────
    const portraitRef = getUnitPortraitRef(scene, warrior, 'warrior card');
    if (scene.textures.exists(portraitRef.key)) {
      this.sprite = scene.add.image(0, -45, portraitRef.key, portraitRef.frame).setScale(1.5);
    } else {
      const tierColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6];
      this.sprite = scene.add.rectangle(0, -45, 28, 28, tierColors[warrior.tier ?? 0]);
    }
    this.add(this.sprite);

    // ── Name (just above shelf line) ─────────────────────────
    // Size 7 (1x native) ensures even long names like "Ancient Guardian" fit.
    this.nameLabel = scene.add.bitmapText(
      0, -16, FONT_KEY, warrior.name ?? 'Unknown', 7,
    ).setOrigin(0.5, 0.5).setTint(Theme.criticalText);
    this.add(this.nameLabel);

    // ── Stats (bottom of visible top half) ───────────────────
    const statsStr = `ATK:${warrior.atk ?? 0}  HP:${warrior.hp ?? 0}`;
    this.statsLabel = scene.add.bitmapText(0, -2, FONT_KEY, statsStr, 14)
      .setOrigin(0.5, 0.5).setTint(Theme.criticalText);
    this.add(this.statsLabel);

    // ── Cost badge (top-right corner, always in top half) ────
    if (opts.showCost !== false && warrior.cost != null) {
      const cx = this.cardW / 2 - 12;
      const cy = -this.cardH / 2 + 12;
      this.costBadge = scene.add.graphics();
      this.costBadge.fillStyle(Theme.warning, 1);
      this.costBadge.fillCircle(cx, cy, 9);
      this.costBadge.lineStyle(1, Theme.fantasyBorderGold, 1);
      this.costBadge.strokeCircle(cx, cy, 9);
      this.add(this.costBadge);

      this.costText = scene.add.bitmapText(cx, cy - 1, FONT_KEY, `${warrior.cost}`, 14)
        .setOrigin(0.5, 0.5).setTint(Theme.screenBg);
      this.add(this.costText);
    }

    // ── BOTTOM HALF (revealed on hover) ──────────────────────
    // Class · Tier line
    const classStr = (warrior.class ?? 'UNIT').toUpperCase();
    const tierStr = `T${warrior.tier ?? 0}`;
    this.classTierLabel = scene.add.bitmapText(
      0, 22, FONT_KEY, `${classStr}  ${tierStr}`, 7,
    ).setOrigin(0.5, 0.5).setTint(Theme.fantasyGoldBright);
    this.add(this.classTierLabel);

    // Separator line
    this.separator = scene.add.graphics();
    this.separator.lineStyle(1, Theme.fantasyBorderGold, 0.6);
    this.separator.lineBetween(-44, 32, 44, 32);
    this.add(this.separator);

    // Rules text panel background (dark strip behind the text for legibility)
    this.rulesBg = scene.add.graphics();
    this.rulesBg.fillStyle(Theme.screenBg, 0.82);
    this.rulesBg.fillRect(-this.cardW / 2 + 4, 38, this.cardW - 8, 38);
    this.add(this.rulesBg);

    // Rules text (word-wrapped, left-aligned within the panel)
    const rules = warrior.rules_text ?? '-';
    this.rulesText = scene.add.bitmapText(-this.cardW / 2 + 7, 41, FONT_KEY, rules, 7)
      .setOrigin(0, 0).setTint(Theme.criticalText);
    this.rulesText.setMaxWidth(this.cardW - 14);
    this.add(this.rulesText);

    // ── Hit zone (toggles between resting / hovered) ─────────
    // Resting: top half only (124x80, local y=-40)
    // Hovered: full card (124x160, local y=0)
    this.hitZone = scene.add.rectangle(0, -40, this.cardW, this.cardH / 2, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    this.add(this.hitZone);

    if (opts.onClick) {
      this._setupInteraction(opts.onClick);
    }

    scene.add.existing(this);
  }

  /**
   * Capture the post-LayoutEditor position as the rest anchor.
   * Must be called by ShopScene AFTER LayoutEditor.register(), since
   * register() rewrites this.x / this.y from saved overrides.
   */
  captureRestPosition() {
    this._restX = this.x;
    this._restY = this.y;
  }

  _setHitZoneState(state) {
    if (state === 'hovered') {
      this.hitZone.y = 0;
      this.hitZone.setSize(this.cardW, this.cardH);
    } else {
      this.hitZone.y = -40;
      this.hitZone.setSize(this.cardW, this.cardH / 2);
    }
  }

  _setupInteraction(onClick) {
    this.hitZone.on('pointerover', () => {
      if (this._isHovered) return;
      this._isHovered = true;
      this._setHitZoneState('hovered');
      this.setDepth(10);
      this.scene.tweens.killTweensOf(this);
      this.scene.tweens.add({
        targets: this,
        y: this._restY - WarriorCard.RISE_DISTANCE,
        duration: 160,
        ease: 'Power2',
      });
    });

    this.hitZone.on('pointerout', () => {
      if (!this._isHovered) return;
      this._isHovered = false;
      this._setHitZoneState('resting');
      this.scene.tweens.killTweensOf(this);
      this.scene.tweens.add({
        targets: this,
        y: this._restY,
        duration: 160,
        ease: 'Power2',
        onComplete: () => {
          if (!this._isHovered) this.setDepth(1);
        },
      });
    });

    this.hitZone.on('pointerdown', () => {
      onClick();
    });
  }

  setDisabled() {
    this.setAlpha(0.4);
    this.hitZone.disableInteractive();
  }
}
