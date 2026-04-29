import { GameObjects } from 'phaser';
import { Theme } from '../ui/Theme.js';
import { FONT_KEY } from '../ui/PixelFont.js';
import { getSynergyIconEntry } from '../config/synergy-icons.js';

const W_MIN = 240;
const W_MAX = 320;
const PAD = 8;
const ROW_H = 12;
const SECTION_GAP = 6;
const ICON_SIZE = 24;
const ICON_GAP = 4;
const GAP_FROM_CARD = 8;
const SCREEN_MARGIN = 4;
const DEPTH = 50;
const WRAP_SAFETY_PX = 6;

const HEADER_FONT_PX = 14;
const BODY_FONT_PX = 7;
const HEADER_H = 20;
const BODY_TARGET_LINES = 2;
const PROBE_LEN = 16;

function tierToRoman(n) {
  const table = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return table[n] ?? String(n);
}

export default class CardTooltip extends GameObjects.Container {
  constructor(scene) {
    super(scene, 0, 0);
    this.setDepth(DEPTH);
    this.setVisible(false);

    this._bg = scene.add.rectangle(0, 0, W_MIN, 100, Theme.panelBg, 0.96).setOrigin(0, 0);
    this._border = scene.add.graphics();
    this.add(this._bg);
    this.add(this._border);

    // Phaser RetroFont sets data.size = CELL_W (6), so the rendered char
    // advance equals fontSize, not CELL_W * scale. PixelFont.measure() under-
    // reports widths by ~17%, so we measure with a real BitmapText probe.
    this._probe = scene.add.bitmapText(-9999, -9999, FONT_KEY, '', BODY_FONT_PX)
      .setVisible(false);
    this.add(this._probe);
    this._headerCharW = this._probeCharW(HEADER_FONT_PX);
    this._bodyCharW = this._probeCharW(BODY_FONT_PX);
    console.log(
      `[Tooltip] charW header=${this._headerCharW.toFixed(2)} `
      + `body=${this._bodyCharW.toFixed(2)}`,
    );

    this._headerName = scene.add.bitmapText(PAD, PAD, FONT_KEY, '', HEADER_FONT_PX)
      .setOrigin(0, 0).setTint(Theme.criticalText);
    this._headerMeta = scene.add.bitmapText(0, PAD + 4, FONT_KEY, '', BODY_FONT_PX)
      .setOrigin(1, 0).setTint(Theme.fantasyGoldBright);
    this.add(this._headerName);
    this.add(this._headerMeta);

    this._rowPool = [];
    this._iconPool = [];

    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy', () => this.destroy());

    scene.add.existing(this);
  }

  _probeCharW(fontPx) {
    try {
      this._probe.setFontSize(fontPx);
      this._probe.setText('M'.repeat(PROBE_LEN));
      const w = this._probe.getTextBounds(false).local.width;
      this._probe.setText('');
      if (w > 0) return w / PROBE_LEN;
    } catch (e) {
      console.error('[Tooltip] probe charW failed:', e);
    }
    return fontPx; // RetroFont fallback: char advance == fontSize
  }

  show(card, warrior) {
    this._hideAll();

    const classEntry = getSynergyIconEntry(warrior.class);
    const factionEntry = getSynergyIconEntry(warrior.faction);
    const showClass = classEntry.kind !== 'unknown'
      && (classEntry.description || classEntry.tiers?.length > 0);
    const showFaction = factionEntry.kind !== 'unknown'
      && (factionEntry.description || factionEntry.tiers?.length > 0);

    const name = (warrior.name ?? 'Unknown').toUpperCase();
    const metaText = tierToRoman(warrior.tier ?? 1);
    const starsText = (warrior.stars ?? 1) > 1 ? '★'.repeat(warrior.stars) : null;
    const statsText = `ATK: ${warrior.atk ?? 0}   HP: ${warrior.hp ?? 0}`;
    const rulesText = warrior.rules_text || null;

    const classDesc = classEntry.description || (classEntry.tiers?.[0]?.label ?? '');
    const factionDesc = factionEntry.description || (factionEntry.tiers?.[0]?.label ?? '');

    // Measure panel width from widest content. Short single-line bands set the
    // floor; long body strings (rules + trait desc) ask for the smallest panel
    // that wraps them onto BODY_TARGET_LINES, capped at W_MAX.
    const bands = [
      this._headerW(name) + PAD + this._bodyW(metaText) + 2 * PAD,
      this._bodyW(statsText) + 2 * PAD,
    ];
    if (showClass) {
      bands.push(ICON_SIZE + ICON_GAP + this._bodyW(classEntry.displayName) + 2 * PAD);
    }
    if (showFaction) {
      bands.push(ICON_SIZE + ICON_GAP + this._bodyW(factionEntry.displayName) + 2 * PAD);
    }
    if (rulesText) {
      bands.push(this._widthForBody(rulesText, 0, BODY_TARGET_LINES));
    }
    if (showClass && classDesc) {
      bands.push(this._widthForBody(classDesc, ICON_SIZE + ICON_GAP, BODY_TARGET_LINES));
    }
    if (showFaction && factionDesc) {
      bands.push(this._widthForBody(factionDesc, ICON_SIZE + ICON_GAP, BODY_TARGET_LINES));
    }

    const panelW = Math.max(W_MIN, Math.min(W_MAX, Math.max(...bands)));
    const innerW = panelW - 2 * PAD;

    // Header
    this._headerName.setText(name);
    this._headerMeta.setText(metaText).setX(panelW - PAD);

    let cursor = PAD + HEADER_H;
    let rowIdx = 0;
    let iconIdx = 0;

    // Stars (skip when <= 1)
    if (starsText) {
      this._getRow(rowIdx++).setText(starsText)
        .setTint(Theme.fantasyGoldBright).setPosition(PAD, cursor).setVisible(true);
      cursor += ROW_H;
    }

    // Stats
    this._getRow(rowIdx++).setText(statsText)
      .setTint(Theme.primaryText).setPosition(PAD, cursor).setVisible(true);
    cursor += ROW_H + SECTION_GAP;

    // Rules text
    if (rulesText) {
      const wrapped = this._wrap(rulesText, innerW);
      this._getRow(rowIdx++).setText(wrapped)
        .setTint(Theme.criticalText).setPosition(PAD, cursor).setVisible(true);
      cursor += wrapped.split('\n').length * ROW_H + SECTION_GAP;
    }

    // Class trait
    if (showClass) {
      cursor = this._renderTrait(classEntry, classDesc, cursor, innerW, rowIdx, iconIdx);
      rowIdx += classDesc ? 2 : 1;
      iconIdx++;
    }

    // Faction trait
    if (showFaction) {
      cursor = this._renderTrait(factionEntry, factionDesc, cursor, innerW, rowIdx, iconIdx);
      rowIdx += factionDesc ? 2 : 1;
      iconIdx++;
    }

    const contentH = cursor + PAD;

    // Chrome
    this._bg.setSize(panelW, contentH);
    this._border.clear();
    this._border.lineStyle(1, Theme.panelBorder, 1);
    this._border.strokeRect(0, 0, panelW, contentH);
    this._border.lineStyle(1, Theme.panelBorder, 0.6);
    this._border.lineBetween(PAD, PAD + HEADER_H - 2, panelW - PAD, PAD + HEADER_H - 2);

    // Position using world transform (handles drag-layer reparenting)
    const m = card.getWorldTransformMatrix();
    const cx = m.tx;
    const cy = m.ty;
    const cam = this.scene.cameras.main;

    let x = Math.round(cx + card.cardW / 2 + GAP_FROM_CARD);
    if (x + panelW + SCREEN_MARGIN > cam.width) {
      x = Math.round(cx - card.cardW / 2 - GAP_FROM_CARD - panelW);
    }
    x = Math.max(SCREEN_MARGIN, Math.min(cam.width - panelW - SCREEN_MARGIN, x));

    let y = Math.round(cy - contentH / 2);
    y = Math.max(SCREEN_MARGIN, Math.min(cam.height - contentH - SCREEN_MARGIN, y));

    this.setPosition(x, y);
    console.log(
      `[Tooltip] show ${warrior.name} panelW=${panelW} contentH=${contentH}`,
    );
    this.setVisible(true);
  }

  _renderTrait(entry, desc, cursor, innerW, rowIdx, iconIdx) {
    const traitStartY = cursor;
    const hasIcon = entry.textureKey && this.scene.textures.exists(entry.textureKey);
    const icon = this._getIcon(iconIdx);

    if (hasIcon) {
      icon.setTexture(entry.textureKey).setPosition(PAD, cursor).setVisible(true);
    } else {
      icon.setVisible(false);
    }

    const textX = PAD + (hasIcon ? ICON_SIZE + ICON_GAP : 0);
    const textW = hasIcon ? (innerW - ICON_SIZE - ICON_GAP) : innerW;
    let textCursor = cursor;

    this._getRow(rowIdx).setText((entry.displayName ?? '').toUpperCase())
      .setTint(Theme.criticalText).setPosition(textX, textCursor).setVisible(true);
    textCursor += ROW_H;

    if (desc) {
      const wrapped = this._wrap(desc, textW);
      this._getRow(rowIdx + 1).setText(wrapped)
        .setTint(Theme.mutedText).setPosition(textX, textCursor).setVisible(true);
      textCursor += wrapped.split('\n').length * ROW_H;
    }

    return Math.max(traitStartY + ICON_SIZE, textCursor) + SECTION_GAP;
  }

  hide() {
    if (!this.visible) return;
    console.log('[Tooltip] hide');
    this.setVisible(false);
  }

  destroy(fromScene) {
    if (this.scene?.cardTooltip === this) this.scene.cardTooltip = null;
    super.destroy(fromScene);
  }

  _getRow(i) {
    if (!this._rowPool[i]) {
      const txt = this.scene.add.bitmapText(0, 0, FONT_KEY, '', BODY_FONT_PX).setOrigin(0, 0);
      this.add(txt);
      this._rowPool[i] = txt;
    }
    return this._rowPool[i];
  }

  _getIcon(i) {
    if (!this._iconPool[i]) {
      const img = this.scene.add.image(0, 0, '').setOrigin(0, 0);
      this.add(img);
      this._iconPool[i] = img;
    }
    return this._iconPool[i];
  }

  _hideAll() {
    this._rowPool.forEach((r) => r.setVisible(false));
    this._iconPool.forEach((img) => img.setVisible(false));
  }

  _bodyW(text) {
    return (text?.length ?? 0) * this._bodyCharW;
  }

  _headerW(text) {
    return (text?.length ?? 0) * this._headerCharW;
  }

  _wrap(text, maxPx) {
    const charW = this._bodyCharW;
    const usable = Math.max(charW, maxPx - WRAP_SAFETY_PX);
    const maxChars = Math.max(1, Math.floor(usable / charW));
    return this._wrapToLines(text, maxChars).join('\n');
  }

  _wrapToLines(text, maxChars) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // Smallest panel width that wraps `text` onto <= targetLines.
  // Returns a panel width (incl. padding/leftOffset/safety), capped at W_MAX.
  _widthForBody(text, leftOffset, targetLines) {
    if (!text) return 0;
    const charW = this._bodyCharW;
    const fixedW = leftOffset + 2 * PAD + WRAP_SAFETY_PX;
    const words = text.split(' ');
    const longestWord = words.reduce((m, w) => Math.max(m, w.length), 1);
    const minCpl = Math.max(longestWord, Math.ceil(text.length / Math.max(1, targetLines)));
    for (let cpl = minCpl; cpl <= text.length; cpl++) {
      const w = cpl * charW + fixedW;
      if (w > W_MAX) return W_MAX;
      if (this._wrapToLines(text, cpl).length <= targetLines) return w;
    }
    return W_MAX;
  }
}
