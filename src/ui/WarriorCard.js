import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';
import { SoundManager } from '../systems/SoundManager.js';
import { UnitStatBadge } from './UnitStatBadge.js';
import { getUnitPortraitRef } from '../rendering/UnitArt.js';
import { attachOutlineToSprite } from '../rendering/OutlineController.js';
import { fitSpriteToPortraitBounds } from '../rendering/SpriteFit.js';

// Faction -> blank card frame texture key. Robot/Folk/Monster are the only
// factions in the live alpha roster; the others are mapped for future use.
const FACTION_FRAME = {
  Robot: 'card-blank-2',
  Folk: 'card-blank-1',
  Monster: 'card-blank-6',
  Undead: 'card-blank-7',
  Beast: 'card-blank-5',
  Fantasy: 'card-blank-4',
  Tribal: 'card-blank-3',
};

// Stat bubble layout (card-local space, frame centered at origin, 124x160).
// Tier badge remains upper-left; ATK/HP values render as labels at the bottom.
const TIER_BADGE = { cx: -52, cy: -68, r: 8 };
const TIER_NUMBER = { x: -52, y: -68, fontSize: 7 };

function tierToRoman(n) {
  const table = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return table[n] ?? String(n);
}

const TITLE_BANNER = {
  x: 18,
  y: -68,
  w: 80,
  h: 14,
  textY: -69,
  fontSize: 7,
};
const TITLE_MAX_CHARS = 14;

const ART_WINDOW = {
  cx: 0,
  cy: -30,
  w: 112,
  h: 62,
};
const ART_MAX_SCALE = 5.0;

function fitToArtWindow(natW, natH) {
  if (!natW || !natH) return 1;
  return Math.min(ART_WINDOW.w / natW, ART_WINDOW.h / natH, ART_MAX_SCALE);
}

const STAR_BAR_Y = 92;
const STAR_SPACING = 14;
const STAR_TEX_KEY = 'warrior-card-star-pip';
const STAR_TEX_SIZE = 16;

function ensureStarTexture(scene) {
  if (scene.textures.exists(STAR_TEX_KEY)) return STAR_TEX_KEY;
  const R = 6;
  const r = 2.5;
  const cx = STAR_TEX_SIZE / 2;
  const cy = STAR_TEX_SIZE / 2;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = (i % 2 === 0) ? R : r;
    pts.push({ x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad });
  }
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillPoints(pts, true);
  g.lineStyle(1, 0x000000, 0.8);
  g.strokePoints(pts, true, true);
  g.generateTexture(STAR_TEX_KEY, STAR_TEX_SIZE, STAR_TEX_SIZE);
  g.destroy();
  console.log(`[WarriorCard] generated '${STAR_TEX_KEY}' texture (${STAR_TEX_SIZE}x${STAR_TEX_SIZE})`);
  return STAR_TEX_KEY;
}

const RULES_PANEL = {
  y: 36,
  h: 22,
  inset: 3,
};
const RULES_MAX_TEXT_H = RULES_PANEL.h - RULES_PANEL.inset * 2;

export class WarriorCard extends GameObjects.Container {
  static WIDTH = 124;
  static HEIGHT = 160;

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
    this._isHeld = false;
    this._isCelebrating = false;
    this._haloNode = null;
    this._sceneShutdownHandler = () => this._onSceneShutdown();

    this.backLayer = scene.add.container(0, 0);
    this.midLayer = scene.add.container(0, 0);
    this.frontLayer = scene.add.container(0, 0);
    this.add(this.backLayer);
    this.add(this.midLayer);
    this.add(this.frontLayer);

    const frameKey = FACTION_FRAME[warrior.faction] ?? 'card-blank-1';
    if (scene.textures.exists(frameKey)) {
      this.frame = scene.add.image(0, 0, frameKey).setDisplaySize(this.cardW, this.cardH);
    } else {
      this.frame = scene.add.rectangle(0, 0, this.cardW, this.cardH, Theme.fantasyPurpleDark)
        .setStrokeStyle(1, Theme.fantasyBorderGold);
      console.warn(`[WarriorCard] Missing card frame texture ${frameKey} for ${warrior.name}`);
    }
    this.backLayer.add(this.frame);

    const portraitRef = getUnitPortraitRef(scene, warrior, 'warrior card');
    if (scene.textures.exists(portraitRef.key)) {
      this.sprite = scene.add.image(
        ART_WINDOW.cx, ART_WINDOW.cy, portraitRef.key, portraitRef.frame,
      );
      const result = fitSpriteToPortraitBounds(scene, this.sprite, portraitRef, {
        window: ART_WINDOW,
        maxScale: ART_MAX_SCALE,
        logTag: '[WarriorCard]',
        warriorId: warrior.name,
      });
      if (!result.applied) {
        const frameW = this.sprite.frame?.width ?? this.sprite.width;
        const frameH = this.sprite.frame?.height ?? this.sprite.height;
        const scale = fitToArtWindow(frameW, frameH);
        this.sprite.setScale(scale);
        console.warn(
          `[WarriorCard] ${warrior.name} no tight bounds - `
          + `fallback frame-fit ${frameW}x${frameH} -> scale ${scale.toFixed(2)}`,
        );
      }
      this._outlineCtrl = attachOutlineToSprite(this.sprite);
    } else {
      const tierColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6];
      this.sprite = scene.add.rectangle(
        ART_WINDOW.cx, ART_WINDOW.cy, ART_WINDOW.h, ART_WINDOW.h,
        tierColors[warrior.tier ?? 0],
      );
      console.warn(
        `[WarriorCard] Emergency rectangle fallback for ${warrior.name} - `
        + `texture ${portraitRef.key} not found`,
      );
    }
    this.midLayer.add(this.sprite);

    this.titleBanner = scene.add.graphics();
    const bx = TITLE_BANNER.x - TITLE_BANNER.w / 2;
    const by = TITLE_BANNER.y - TITLE_BANNER.h / 2;
    this.titleBanner.fillStyle(Theme.screenBg, 0.85);
    this.titleBanner.fillRoundedRect(bx, by, TITLE_BANNER.w, TITLE_BANNER.h, 4);
    this.titleBanner.lineStyle(1, Theme.fantasyBorderGold, 1);
    this.titleBanner.strokeRoundedRect(bx, by, TITLE_BANNER.w, TITLE_BANNER.h, 4);
    this.frontLayer.add(this.titleBanner);

    const rawName = (warrior.name ?? 'Unknown').toUpperCase();
    const displayName = rawName.length > TITLE_MAX_CHARS
      ? rawName.slice(0, TITLE_MAX_CHARS - 1) + '...'
      : rawName;
    this.nameLabel = scene.add.bitmapText(
      TITLE_BANNER.x, TITLE_BANNER.textY, FONT_KEY, displayName, TITLE_BANNER.fontSize,
    ).setOrigin(0.5, 0.5).setTint(Theme.fantasyGoldBright);
    this.frontLayer.add(this.nameLabel);

    this._drawStatBadge(TIER_BADGE, this.frontLayer);

    this.tierText = this._addBadgeText(
      TIER_NUMBER, tierToRoman(warrior.tier ?? 1), Theme.fantasyGoldBright, this.frontLayer,
    );

    this.statBadge = new UnitStatBadge(scene, 0, 74, {
      atk: warrior.atk ?? 0,
      hp: warrior.hp ?? 0,
      isEnemy: false,
      borderColor: Theme.fantasyBorderGold,
      borderWidth: 2,
      showIcons: true,
      size: 'large',
      animateChanges: true,
    });
    this.frontLayer.add(this.statBadge);
    console.log(
      `[WarriorCard] ${warrior.name} stats: ATK=${warrior.atk ?? 0} HP=${warrior.hp ?? 0}`,
    );

    const classStr = (warrior.class ?? 'UNIT').toUpperCase();
    const tierStr = `T${warrior.tier ?? 0}`;
    this.classTierLabel = scene.add.bitmapText(
      0, 22, FONT_KEY, `${classStr}  ${tierStr}`, 7,
    ).setOrigin(0.5, 0.5).setTint(Theme.fantasyGoldBright);
    this.frontLayer.add(this.classTierLabel);

    this.separator = scene.add.graphics();
    this.separator.lineStyle(1, Theme.fantasyBorderGold, 0.6);
    this.separator.lineBetween(-44, 32, 44, 32);
    this.frontLayer.add(this.separator);

    this.rulesBg = scene.add.graphics();
    this.rulesBg.fillStyle(Theme.screenBg, 0.82);
    this.rulesBg.fillRect(-this.cardW / 2 + 4, RULES_PANEL.y, this.cardW - 8, RULES_PANEL.h);
    this.frontLayer.add(this.rulesBg);

    const rules = warrior.rules_text ?? '-';
    this.rulesText = scene.add.bitmapText(
      -this.cardW / 2 + 7, RULES_PANEL.y + RULES_PANEL.inset, FONT_KEY, rules, 7,
    ).setOrigin(0, 0).setTint(Theme.criticalText);
    this.rulesText.setMaxWidth(this.cardW - 14);
    this.rulesText.setLineSpacing(-1);
    this.frontLayer.add(this.rulesText);

    const measureRulesH = () => this.rulesText.getTextBounds(false).local.height;
    if (measureRulesH() > RULES_MAX_TEXT_H) {
      const words = rules.split(/\s+/);
      while (words.length > 1 && measureRulesH() > RULES_MAX_TEXT_H) {
        words.pop();
        this.rulesText.setText(words.join(' ').replace(/[.,;:!?-]+$/, '') + '...');
      }
      console.log(
        `[WarriorCard] rules truncated for ${warrior.name}: "${this.rulesText.text}"`,
      );
    }

    if (opts.teamCard) {
      this.teamAccent = scene.add.graphics();
      this.teamAccent.lineStyle(2, Theme.fantasyBorderGold, 1);
      this.teamAccent.strokeRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, 4);
      // Sit above the card frame/sprite but BELOW front-layer UI (stat badge,
      // star bar) so the gold border doesn't clip badges/stars that extend
      // past the card edge on the z-axis.
      this.midLayer.add(this.teamAccent);
      console.log(`[WarriorCard] ${warrior.name} team accent attached to midLayer (behind front UI)`);
    }

    this._drawStarBar(warrior.stars ?? 1, this.frontLayer);

    if (opts.draggable) {
      this.hitZone = scene.add.rectangle(0, 0, this.cardW, this.cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true, draggable: true });
    } else {
      this.hitZone = scene.add.rectangle(0, 0, this.cardW, this.cardH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
    }
    this.add(this.hitZone);

    this._setupHover();

    if (opts.onClick) {
      this.hitZone.on('pointerdown', () => opts.onClick());
    }

    scene.events.once('shutdown', this._sceneShutdownHandler);
    this.once('destroy', () => {
      this.scene?.events?.off('shutdown', this._sceneShutdownHandler);
      this._onSceneShutdown();
    });
    scene.add.existing(this);
  }

  _addBadgeText(pos, value, color, targetLayer) {
    const label = this.scene.add.bitmapText(
      pos.x, pos.y, FONT_KEY, String(value), pos.fontSize,
    ).setOrigin(0.5, 0.5).setTint(color);
    targetLayer.add(label);
    return label;
  }

  _drawStatBadge({ cx, cy, r }, targetLayer) {
    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(cx, cy + 1, r);
    g.fillStyle(Theme.screenBg, 0.85);
    g.fillCircle(cx, cy, r);
    g.lineStyle(2, Theme.fantasyBorderGold, 1);
    g.strokeCircle(cx, cy, r);
    g.lineStyle(1, Theme.fantasyGoldBright, 0.4);
    g.beginPath();
    g.arc(cx - 1, cy - 1, Math.max(2, r - 2), Math.PI * 1.15, Math.PI * 1.78, false);
    g.strokePath();
    targetLayer.add(g);
    return g;
  }

  captureRestPosition() {
    this._restX = this.x;
    this._restY = this.y;
  }

  _setupHover() {
    this.hitZone.on('pointerover', () => {
      if (this._isCelebrating) return;
      if (this._isHeld) return;
      if (this._isHovered) return;
      this._isHovered = true;
      SoundManager.uiHover();
      this.setDepth(10);
      this._playWiggle();
    });

    this.hitZone.on('pointerout', () => {
      if (this._isCelebrating) return;
      if (this._isHeld) return;
      if (!this._isHovered) return;
      this.cancelHoverTween();
      this.setDepth(1);
    });
  }

  _playWiggle() {
    this.scene.tweens.killTweensOf(this);
    this.angle = 0;
    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { angle: -2, duration: 30, ease: 'Sine.Out' },
        { angle: 2, duration: 50, ease: 'Sine.InOut' },
        { angle: -1.5, duration: 40, ease: 'Sine.InOut' },
        { angle: 0, duration: 40, ease: 'Sine.In' },
      ],
    });
  }

  _drawStarBar(starCount, targetLayer) {
    const n = Math.max(0, starCount | 0);
    if (n <= 1) return;
    ensureStarTexture(this.scene);

    const bar = this.scene.add.container(0, STAR_BAR_Y);
    bar.stars = [];
    const totalWidth = (n - 1) * STAR_SPACING;
    const startX = -totalWidth / 2;
    for (let i = 0; i < n; i++) {
      const star = this.scene.add.image(startX + i * STAR_SPACING, 0, STAR_TEX_KEY)
        .setOrigin(0.5, 0.5)
        .setTint(Theme.fantasyGoldBright);
      star._restTint = Theme.fantasyGoldBright;
      bar.add(star);
      bar.stars.push(star);
    }
    targetLayer.add(bar);
    this._starBar = bar;
  }

  stopAllCardTweens() {
    const tweens = this.scene?.tweens;
    if (!tweens) return;
    tweens.killTweensOf(this);
    tweens.killTweensOf(this.backLayer);
    tweens.killTweensOf(this.midLayer);
    tweens.killTweensOf(this.frontLayer);
    if (this._haloNode) tweens.killTweensOf(this._haloNode);
  }

  resetLayerTransforms() {
    this.x = this._restX;
    this.y = this._restY;
    this.angle = 0;
    this.scaleX = 1;
    this.scaleY = 1;

    for (const layer of [this.backLayer, this.midLayer, this.frontLayer]) {
      if (!layer) continue;
      layer.x = 0;
      layer.y = 0;
      layer.angle = 0;
      layer.scaleX = 1;
      layer.scaleY = 1;
    }
  }

  _destroyHaloNode() {
    if (!this._haloNode) return;
    this._haloNode.destroy();
    this._haloNode = null;
  }

  _cancelCelebration() {
    this.stopAllCardTweens();
    this.resetLayerTransforms();
    this._destroyHaloNode();
    this._isCelebrating = false;
  }

  _createCelebrationHalo() {
    const halo = this.scene.add.graphics();
    halo.fillStyle(Theme.fantasyGoldBright, 0.12);
    halo.fillCircle(0, 0, 54);
    halo.fillStyle(Theme.fantasyGold, 0.18);
    halo.fillCircle(0, 0, 40);
    halo.lineStyle(2, Theme.fantasyGoldBright, 0.7);
    halo.strokeCircle(0, 0, 28);
    halo.setScale(0.5);
    halo.setAlpha(0.9);
    this._haloNode = halo;
    this.addAt(halo, 0);
    return halo;
  }

  playLevelUpWiggle() {
    if (this._isCelebrating) return;
    this._isCelebrating = true;
    this.stopAllCardTweens();
    this.resetLayerTransforms();
    const halo = this._createCelebrationHalo();

    console.log(`[VFX] levelUpWiggle card=${this.warrior?.name ?? 'unknown'} stars=${this.warrior?.stars ?? 1}`);

    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { angle: -8, duration: 70, ease: 'Sine.Out' },
        { angle: 8, duration: 120, ease: 'Sine.InOut' },
        { angle: -5, duration: 90, ease: 'Sine.InOut' },
        {
          angle: 0,
          duration: 90,
          ease: 'Sine.In',
          onComplete: () => {
            this.resetLayerTransforms();
            this._destroyHaloNode();
            this._isCelebrating = false;
          },
        },
      ],
    });

    this.scene.tweens.chain({
      targets: this,
      tweens: [
        { scaleX: 1.08, scaleY: 1.08, duration: 90, ease: 'Back.Out' },
        { scaleX: 1, scaleY: 1, duration: 90, ease: 'Sine.InOut' },
      ],
    });

    this.scene.tweens.chain({
      targets: this.backLayer,
      tweens: [
        { x: 1, duration: 70, ease: 'Sine.Out' },
        { x: -1, duration: 120, ease: 'Sine.InOut' },
        { x: 0.6, duration: 90, ease: 'Sine.InOut' },
        { x: 0, duration: 90, ease: 'Sine.In' },
      ],
    });

    this.scene.tweens.chain({
      targets: this.midLayer,
      tweens: [
        { x: 3, duration: 70, ease: 'Sine.Out' },
        { x: -3, duration: 120, ease: 'Sine.InOut' },
        { x: 1.8, duration: 90, ease: 'Sine.InOut' },
        { x: 0, duration: 90, ease: 'Sine.In' },
      ],
    });

    this.scene.tweens.chain({
      targets: this.frontLayer,
      tweens: [
        { x: 7, duration: 70, ease: 'Sine.Out' },
        { x: -7, duration: 120, ease: 'Sine.InOut' },
        { x: 4.2, duration: 90, ease: 'Sine.InOut' },
        { x: 0, duration: 90, ease: 'Sine.In' },
      ],
    });

    this.scene.tweens.chain({
      targets: this.midLayer,
      tweens: [
        { scaleX: 0.99, duration: 90, ease: 'Sine.Out' },
        { scaleX: 1.03, duration: 150, ease: 'Sine.InOut' },
        { scaleX: 1, duration: 130, ease: 'Sine.In' },
      ],
    });

    this.scene.tweens.chain({
      targets: this.frontLayer,
      tweens: [
        { scaleX: 0.97, duration: 90, ease: 'Sine.Out' },
        { scaleX: 1.06, duration: 150, ease: 'Sine.InOut' },
        { scaleX: 1, duration: 130, ease: 'Sine.In' },
      ],
    });

    this.scene.tweens.add({
      targets: halo,
      scaleX: 2,
      scaleY: 2,
      alpha: 0,
      duration: 450,
      ease: 'Sine.Out',
      onComplete: () => {
        if (this._haloNode === halo) this._destroyHaloNode();
      },
    });
  }

  cancelHoverTween() {
    if (this._isCelebrating) {
      this._cancelCelebration();
      return;
    }
    this.scene?.tweens?.killTweensOf(this);
    this._isHovered = false;
    this.angle = 0;
    this.scaleX = 1;
    this.scaleY = 1;
  }

  snapBack(flashColor = null) {
    if (this._isCelebrating) return;
    this._isHeld = false;
    this.cancelHoverTween();
    this.scene?.tweens?.add({
      targets: this,
      x: this._restX,
      y: this._restY,
      duration: 180,
      ease: 'Cubic.Out',
    });
    if (flashColor && this.frame?.setTint) {
      this.frame.setTint(flashColor);
      this.scene?.time?.delayedCall(120, () => this.frame?.clearTint?.());
    }
  }

  shake() {
    const origX = this._restX;
    this.scene?.tweens?.chain({
      targets: this,
      tweens: [
        { x: origX - 6, duration: 40, ease: 'Sine.Out' },
        { x: origX + 6, duration: 40, ease: 'Sine.InOut' },
        { x: origX, duration: 40, ease: 'Sine.In' },
      ],
    });
  }

  _onSceneShutdown() {
    this._cancelCelebration();
    this._isHovered = false;
    this._isHeld = false;
  }

  setDisabled() {
    this.setAlpha(0.4);
    this.hitZone.disableInteractive();
  }
}
