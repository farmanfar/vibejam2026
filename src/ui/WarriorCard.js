import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';
import { getUnitPortraitRef } from '../rendering/UnitArt.js';
import { attachOutlineToSprite } from '../rendering/OutlineController.js';

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

// Bubble positions in card-local space (frame centered at origin, 124x160).
// All blank card variants share the same upper-left bubble cluster, so one
// set works. ATK/DEF use fontSize 7 (1x m5x7) so 2-digit values fit inside
// the small ~14-16px bubbles. TIER stays at 14 (single digit, big circle).
const TIER_BUBBLE  = { x: -44, y: -60, fontSize: 14 }; // big upper-left circle
const ATK_BUBBLE   = { x: -28, y: -56, fontSize: 7  }; // small bubble #1 (upper)
const DEF_BUBBLE   = { x: -32, y: -44, fontSize: 7  }; // small bubble #2 (lower)
const TITLE_BANNER = {
  x: 12,    // anchored right of the bubble cluster (avoids TIER overlap)
  y: -68,   // top strip of the card
  w: 88,    // narrow enough that the left edge clears the big TIER bubble
  h: 14,
  textY: -69,
  fontSize: 7,
};
const TITLE_MAX_CHARS = 14; // m5x7 advances ~6px/char at 1x; 14 chars fits w=84

/**
 * Warrior card for the shop. Native PENUSBMIC blank card frame (106x138)
 * displayed at 124x160. Text is positioned to land inside the bubbles
 * baked into the artwork: TIER in the big upper-left circle, ATK and DEF
 * in the two smaller bubbles next to it. Unit name renders in a drawn
 * title banner across the top. Class/tier/rules live in the hover-reveal
 * bottom half.
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

    // ── Portrait sprite (centered top half) ──────────────────
    const portraitRef = getUnitPortraitRef(scene, warrior, 'warrior card');
    if (scene.textures.exists(portraitRef.key)) {
      this.sprite = scene.add.image(0, -45, portraitRef.key, portraitRef.frame).setScale(1.5);
      attachOutlineToSprite(this.sprite);
    } else {
      const tierColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6];
      this.sprite = scene.add.rectangle(0, -45, 28, 28, tierColors[warrior.tier ?? 0]);
    }
    this.add(this.sprite);

    // ── Title banner (drawn dark strip at top of card) ───────
    this.titleBanner = scene.add.graphics();
    const bx = TITLE_BANNER.x - TITLE_BANNER.w / 2;
    const by = TITLE_BANNER.y - TITLE_BANNER.h / 2;
    this.titleBanner.fillStyle(Theme.screenBg, 0.85);
    this.titleBanner.fillRoundedRect(bx, by, TITLE_BANNER.w, TITLE_BANNER.h, 4);
    this.titleBanner.lineStyle(1, Theme.fantasyBorderGold, 1);
    this.titleBanner.strokeRoundedRect(bx, by, TITLE_BANNER.w, TITLE_BANNER.h, 4);
    this.add(this.titleBanner);

    // Truncate to fit the banner. Wrapping is not viable in a 14px-tall strip.
    const rawName = (warrior.name ?? 'Unknown').toUpperCase();
    const displayName = rawName.length > TITLE_MAX_CHARS
      ? rawName.slice(0, TITLE_MAX_CHARS - 1) + '…'
      : rawName;
    this.nameLabel = scene.add.bitmapText(
      TITLE_BANNER.x, TITLE_BANNER.textY, FONT_KEY, displayName, TITLE_BANNER.fontSize,
    ).setOrigin(0.5, 0.5).setTint(Theme.fantasyGoldBright);
    this.add(this.nameLabel);

    // ── TIER / ATK / DEF text inside the artwork bubbles ─────
    // DEF reads warrior.hp because the alpha combat engine has no separate
    // def stat — hp IS the defense pool. If a real def field is added later,
    // update this single call site.
    this.tierText = this._addBadgeText(TIER_BUBBLE, warrior.tier ?? 1, Theme.fantasyGoldBright);
    this.atkText  = this._addBadgeText(ATK_BUBBLE,  warrior.atk  ?? 0, Theme.criticalText);
    this.defText  = this._addBadgeText(DEF_BUBBLE,  warrior.hp   ?? 0, Theme.criticalText);

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

  _addBadgeText(pos, value, color) {
    const label = this.scene.add.bitmapText(
      pos.x, pos.y, FONT_KEY, String(value), pos.fontSize,
    ).setOrigin(0.5, 0.5).setTint(color);
    this.add(label);
    return label;
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
