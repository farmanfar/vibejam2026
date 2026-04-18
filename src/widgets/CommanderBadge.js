import { GameObjects } from 'phaser';
import { PixelLabel } from '../ui/index.js';
import { Theme } from '../ui/Theme.js';
import { FONT_KEY } from '../ui/PixelFont.js';

const DEFAULT_SPRITE_SCALE = 3.5;
const F2_HIT_W             = 48;  // small F2 drag target — does NOT affect visual size
const F2_HIT_H             = 48;
const TOOLTIP_PAD          = 4;
const TOOLTIP_FONT_PX      = 7;  // 1x native m5x7
const TOOLTIP_LINE_H       = 9;

// Fantasy Cards "Sprite Files" all share a 144×150 canvas, but each commander's
// visible pixels occupy a very different slice of it (top/bottom transparent
// padding ranges from 2 to 55 px). Anchoring shadow/name to canvas bottom leaves
// a yawning gap below stubby sprites. We scan the texture's alpha once per
// spriteIndex to find the real content bbox, cache it, and anchor UI to that.
const BBOX_CACHE = new Map();

function computeContentBBox(scene, texKey) {
  if (BBOX_CACHE.has(texKey)) return BBOX_CACHE.get(texKey);
  const tex = scene.textures.get(texKey);
  const src = tex?.getSourceImage?.();
  if (!src || !src.width || !src.height) {
    console.warn(`[Commander] BBox scan failed — no source image for ${texKey}`);
    return null;
  }
  const w = src.width;
  const h = src.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch (e) {
    console.error(`[Commander] BBox scan blocked (canvas tainted?) for ${texKey}:`, e);
    return null;
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4 + 3;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bbox = maxX < 0
    ? { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1, canvasW: w, canvasH: h }
    : { minX, minY, maxX, maxY, canvasW: w, canvasH: h };
  BBOX_CACHE.set(texKey, bbox);
  console.log(`[Commander] BBox ${texKey} canvas=${w}x${h} content=(${bbox.minX},${bbox.minY})-(${bbox.maxX},${bbox.maxY})`);
  return bbox;
}

export class CommanderBadge extends GameObjects.Container {
  constructor(scene, x, y, commander, opts = {}) {
    super(scene, x, y);
    scene.add.existing(this);

    this.commander   = commander;
    this.spriteScale = opts.scale ?? DEFAULT_SPRITE_SCALE;
    this.showName    = opts.showName ?? true;

    if (!commander) {
      console.warn('[Commander] CommanderBadge constructed with null commander');
      return;
    }

    const texKey = `commander-sprite-${commander.spriteIndex}`;
    if (!scene.textures.exists(texKey)) {
      console.error(`[Commander] Missing texture ${texKey} for ${commander.id}`);
      return;
    }

    const sprite = scene.add.image(0, 0, texKey);
    sprite.setOrigin(0.5, 0.5);
    sprite.setScale(this.spriteScale);
    this.add(sprite);
    this.sprite = sprite;

    const displayW = sprite.displayWidth;
    const displayH = sprite.displayHeight;

    // Anchor shadow/name to visible content, not the padded canvas. If the scan
    // fails (tainted canvas, missing texture), fall back to canvas-bottom math.
    const bbox = computeContentBBox(scene, texKey);
    const scale = this.spriteScale;
    let contentBottomY, contentTopY, contentCenterDX;
    if (bbox) {
      const halfW = bbox.canvasW / 2;
      const halfH = bbox.canvasH / 2;
      contentBottomY  = (bbox.maxY + 1 - halfH) * scale;
      contentTopY     = (bbox.minY - halfH) * scale;
      contentCenterDX = ((bbox.minX + bbox.maxX + 1) / 2 - halfW) * scale;
    } else {
      contentBottomY  = displayH / 2;
      contentTopY     = -displayH / 2;
      contentCenterDX = 0;
    }
    this._contentBottomY = contentBottomY;
    this._contentTopY    = contentTopY;

    console.log(`[Commander] Badge ${commander.id} native=${sprite.width}x${sprite.height} scale=${scale}x display=${displayW.toFixed(0)}x${displayH.toFixed(0)} contentBottomY=${contentBottomY.toFixed(1)}`);

    if (this.showName) {
      const label = new PixelLabel(scene, contentCenterDX, contentBottomY + 10, commander.name.toUpperCase(), {
        scale: 1, color: 'accent', align: 'center',
      });
      this.add(label);
      this.nameLabel = label;
    }

    // Tiny F2 drag target, independent of visual sprite size. The big portrait
    // should not block clicks on cards behind it in edit mode.
    this.cardW = F2_HIT_W;
    this.cardH = F2_HIT_H;

    if (commander.rule?.description) {
      this._buildTooltip(commander);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerover', (pointer) => this._showTooltip(pointer));
      sprite.on('pointermove', (pointer) => this._moveTooltip(pointer));
      sprite.on('pointerout',  () => this._hideTooltip());
    }

    scene.events.once('shutdown', () => {
      if (this._tooltip) {
        this._tooltip.destroy();
        this._tooltip = null;
      }
    });
  }

  _buildTooltip(commander) {
    // Tooltip is a SCENE child (not badge child) so container scale applied
    // via F2 doesn't scale the tooltip text. We reposition on hover.
    const scene = this.scene;
    const title = commander.name.toUpperCase();
    const body  = commander.rule.description;

    const tooltip = scene.add.container(0, 0);
    tooltip.setVisible(false);
    tooltip.setDepth(1000);

    const titleText = scene.add.bitmapText(0, 0, FONT_KEY, title, TOOLTIP_FONT_PX)
      .setTint(Theme.criticalText);
    const bodyText = scene.add.bitmapText(0, 0, FONT_KEY, body, TOOLTIP_FONT_PX)
      .setTint(Theme.fantasyGoldBright);

    const contentW = Math.max(titleText.width, bodyText.width);
    const panelW   = contentW + TOOLTIP_PAD * 2;
    const dividerY = TOOLTIP_PAD + TOOLTIP_LINE_H;
    const panelH   = dividerY + 2 + TOOLTIP_LINE_H + TOOLTIP_PAD;

    const bg = scene.add.rectangle(0, 0, panelW, panelH, Theme.panelBg, 0.96).setOrigin(0, 0);
    const border = scene.add.graphics();
    border.lineStyle(1, Theme.panelBorder, 1);
    border.strokeRect(0, 0, panelW, panelH);
    border.lineStyle(1, Theme.panelBorder, 0.6);
    border.lineBetween(TOOLTIP_PAD, dividerY, panelW - TOOLTIP_PAD, dividerY);

    titleText.setPosition(TOOLTIP_PAD, TOOLTIP_PAD);
    bodyText.setPosition(TOOLTIP_PAD, dividerY + 2);

    tooltip.add([bg, border, titleText, bodyText]);

    this._tooltip     = tooltip;
    this._tooltipW    = panelW;
    this._tooltipH    = panelH;
    console.log(`[Commander] Tooltip built for ${commander.id} — "${body}" panel=${panelW}x${panelH}`);
  }

  _showTooltip(pointer) {
    if (!this._tooltip) return;
    this._positionTooltipAtCursor(pointer);
    this._tooltip.setVisible(true);
    console.log(`[Commander] Tooltip show ${this.commander.id} at cursor (${pointer?.worldX ?? '?'}, ${pointer?.worldY ?? '?'})`);
  }

  _moveTooltip(pointer) {
    if (!this._tooltip || !this._tooltip.visible) return;
    this._positionTooltipAtCursor(pointer);
  }

  _positionTooltipAtCursor(pointer) {
    if (!pointer) return;
    const cam = this.scene.cameras?.main;
    const viewW = cam?.width  ?? this.scene.scale?.width  ?? 960;
    const viewH = cam?.height ?? this.scene.scale?.height ?? 540;
    // Offset so the cursor doesn't overlap the panel; clamp to viewport.
    const OFFSET_X = 10;
    const OFFSET_Y = 12;
    let x = Math.round(pointer.x + OFFSET_X);
    let y = Math.round(pointer.y + OFFSET_Y);
    if (x + this._tooltipW > viewW) x = Math.round(pointer.x - this._tooltipW - OFFSET_X);
    if (y + this._tooltipH > viewH) y = Math.round(pointer.y - this._tooltipH - OFFSET_Y);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    this._tooltip.setPosition(x, y);
  }

  _hideTooltip() {
    if (!this._tooltip) return;
    this._tooltip.setVisible(false);
  }
}
