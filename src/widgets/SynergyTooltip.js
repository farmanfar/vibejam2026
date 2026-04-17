/**
 * SynergyTooltip — single floating panel reused across all chip hovers.
 *
 * Layout:
 *   [icon] DISPLAY NAME              count/maxThreshold
 *   ────────────────────────────────────────
 *   [2] +1 HP                                     (active tier — bright)
 *   [3] +2 HP +1 ATK            (need 1 more)    (next tier — gold hint)
 *   [4] +3 HP +2 ATK                              (locked tier — dim)
 *
 * For tag entries with a `description` field instead of tiers, renders the
 * description as a single line. For unknown tags, shows "No bonus yet."
 *
 * One instance per scene. show()/hide() reposition + toggle visibility.
 */

import { GameObjects } from 'phaser';
import { Theme } from '../ui/Theme.js';
import { FONT_KEY, PixelFont } from '../ui/PixelFont.js';
import {
  getSynergyIconEntry,
  resolveActiveTier,
  SYNERGY_ICONS,
} from '../config/synergy-icons.js';

const TOOLTIP_W_MIN   = 180;
const TOOLTIP_W_MAX   = 320;
const PADDING         = 8;
const HEADER_H        = 28;
const ROW_H           = 14;
const ICON_SIZE       = 24;    // DARK Skill Icons source size
const ICON_SCALE      = 1.5;   // header icon at 1.5x = 36px
const HEADER_FONT_PX  = 14;    // m5x7 at 2x
const ROW_FONT_PX     = 14;
const HINT_FONT_PX    = 7;     // 1x for the (need N more) suffix
const HEADER_GUTTER   = 8;
const HINT_GUTTER     = 8;
const HINT_LINE_OFFSET = 4;
const SCREEN_MARGIN   = 4;
const ANCHOR_OFFSET_Y = -16;   // float above the chip

export class SynergyTooltip extends GameObjects.Container {
  constructor(scene) {
    super(scene, 0, 0);
    this.setDepth(100);
    this.setVisible(false);

    // Panel chrome — sized in show() because content height varies by tag.
    this._bg = scene.add.rectangle(0, 0, TOOLTIP_W_MIN, 100, Theme.panelBg, 0.96).setOrigin(0, 0);
    this._border = scene.add.graphics();
    this.add(this._bg);
    this.add(this._border);

    // Header: icon + name + count
    this._headerIcon = scene.add.image(PADDING, PADDING, '');
    this._headerIcon.setOrigin(0, 0);
    this._headerIcon.setScale(ICON_SCALE);
    this.add(this._headerIcon);

    this._headerName = scene.add.bitmapText(
      PADDING + ICON_SIZE * ICON_SCALE + 6,
      PADDING + 4,
      FONT_KEY,
      '',
      HEADER_FONT_PX,
    );
    this._headerName.setTint(Theme.criticalText);
    this.add(this._headerName);

    this._headerCount = scene.add.bitmapText(
      TOOLTIP_W_MIN - PADDING,
      PADDING + 4,
      FONT_KEY,
      '',
      HEADER_FONT_PX,
    );
    this._headerCount.setOrigin(1, 0);
    this._headerCount.setTint(Theme.fantasyGoldBright);
    this.add(this._headerCount);

    // Divider line under header — drawn into _border each show().
    // Row text objects are pooled; expanded as needed.
    this._rowPool = [];
    this._hintPool = [];

    scene.add.existing(this);
  }

  /**
   * @param {string} tag
   * @param {number} count
   * @param {number} anchorWorldX
   * @param {number} anchorWorldY
   */
  show(tag, count, anchorWorldX, anchorWorldY) {
    const entry = getSynergyIconEntry(tag);
    const customEntry = SYNERGY_ICONS[tag];
    const { tiers, active, next } = resolveActiveTier(tag, count);
    const headerNameText = (entry.displayName || tag || '').toUpperCase();
    const headerIconVisible = this.scene.textures.exists(entry.textureKey);
    const headerIconW = headerIconVisible ? ICON_SIZE * ICON_SCALE + 6 : 0;

    // Header content
    if (headerIconVisible) {
      this._headerIcon.setTexture(entry.textureKey);
      this._headerIcon.setVisible(true);
    } else {
      this._headerIcon.setVisible(false);
    }

    let headerCountText;
    if (tiers.length > 0) {
      const maxThreshold = tiers[tiers.length - 1].threshold;
      headerCountText = `${count}/${maxThreshold}`;
    } else {
      // No-tier tag (e.g. Knight scales linearly) → show raw count
      headerCountText = `x${count}`;
    }
    this._headerCount.setText(headerCountText);
    this._headerCount.setVisible(true);

    const bands = [
      headerIconW
      + this._measureWidth(headerNameText, 2)
      + HEADER_GUTTER
      + this._measureWidth(headerCountText, 2),
    ];
    const rows = [];

    if (tiers.length > 0) {
      tiers.forEach((tier, i) => {
        const isActive = active && tier.threshold === active.threshold;
        const isNext   = next && tier.threshold === next.threshold;
        const rowText = `[${tier.threshold}] ${tier.label}`;
        const hintText = isNext ? `(need ${tier.threshold - count} more)` : '';

        let tint;
        if (isActive)      tint = Theme.fantasyGoldBright;
        else if (isNext)   tint = Theme.warning;
        else               tint = Theme.mutedText;

        rows.push({
          rowText,
          hintText,
          rowTint: tint,
          hintTint: Theme.warning,
        });
        bands.push(
          this._measureWidth(rowText, 2)
          + (hintText
            ? HINT_GUTTER + this._measureWidth(hintText, 1)
            : 0),
        );
      });
    } else if (customEntry?.description) {
      rows.push({
        rowText: customEntry.description,
        hintText: '',
        rowTint: Theme.primaryText,
        hintTint: Theme.warning,
      });
      bands.push(this._measureWidth(customEntry.description, 2));
    } else {
      rows.push({
        rowText: 'No bonus yet.',
        hintText: '',
        rowTint: Theme.mutedText,
        hintTint: Theme.warning,
      });
      bands.push(this._measureWidth('No bonus yet.', 2));
    }

    const widest = Math.max(...bands);
    const panelW = Math.max(TOOLTIP_W_MIN, Math.min(TOOLTIP_W_MAX, widest + 2 * PADDING));
    const innerW = panelW - 2 * PADDING;
    const headerNameMaxW = Math.max(
      0,
      innerW - headerIconW - HEADER_GUTTER - this._measureWidth(headerCountText, 2),
    );
    const truncatedHeaderName = this._truncateTextToWidth(headerNameText, headerNameMaxW, 2);

    this._headerName.setText(truncatedHeaderName);
    this._headerName.setPosition(PADDING + headerIconW, PADDING + 4);
    this._headerCount.setPosition(panelW - PADDING, PADDING + 4);

    // Body rows
    this._hideAllRows();
    const bodyTop = HEADER_H + 6;
    let cursor = bodyTop;
    let lineCount = 0;
    let wrapped = false;
    let hintBelow = false;

    rows.forEach((rowSpec, i) => {
      const row = this._getRow(i);
      const hint = rowSpec.hintText ? this._getHint(i) : null;
      let renderedRowText = rowSpec.rowText;
      let hintOnOwnLine = false;

      if (rowSpec.hintText) {
        const combinedW =
          this._measureWidth(renderedRowText, 2)
          + HINT_GUTTER
          + this._measureWidth(rowSpec.hintText, 1);
        if (combinedW > innerW) {
          renderedRowText = this._wrapText(
            renderedRowText,
            this._maxCharsPerLine(innerW, 2),
          );
          hintOnOwnLine = true;
          hintBelow = true;
        }
      } else if (this._measureWidth(renderedRowText, 2) > innerW) {
        renderedRowText = this._wrapText(
          renderedRowText,
          this._maxCharsPerLine(innerW, 2),
        );
      }

      const rowLines = Math.max(1, renderedRowText.split('\n').length);
      if (rowLines > 1) wrapped = true;

      row.setText(renderedRowText);
      row.setTint(rowSpec.rowTint);
      row.setPosition(PADDING, cursor);
      row.setVisible(true);

      if (hint) {
        hint.setText(rowSpec.hintText);
        hint.setTint(rowSpec.hintTint);
        hint.setVisible(true);

        if (hintOnOwnLine) {
          hint.setPosition(panelW - PADDING, cursor + rowLines * ROW_H + HINT_LINE_OFFSET);
          cursor += (rowLines + 1) * ROW_H;
          lineCount += rowLines + 1;
        } else {
          hint.setPosition(panelW - PADDING, cursor + HINT_LINE_OFFSET);
          cursor += ROW_H;
          lineCount += 1;
        }
      } else {
        cursor += rowLines * ROW_H;
        lineCount += rowLines;
      }
    });

    // Resize the panel to fit content height.
    const contentH = bodyTop + lineCount * ROW_H + PADDING;
    this._bg.setSize(panelW, contentH);
    this._border.clear();
    this._border.lineStyle(1, Theme.panelBorder, 1);
    this._border.strokeRect(0, 0, panelW, contentH);
    this._border.lineStyle(1, Theme.panelBorder, 0.6);
    this._border.lineBetween(PADDING, HEADER_H, panelW - PADDING, HEADER_H);

    // Position above the chip, clamped to camera bounds.
    const cam = this.scene.cameras.main;
    let x = Math.round(anchorWorldX - panelW / 2);
    let y = Math.round(anchorWorldY + ANCHOR_OFFSET_Y - contentH);
    x = Math.max(SCREEN_MARGIN, Math.min(cam.width - panelW - SCREEN_MARGIN, x));
    y = Math.max(SCREEN_MARGIN, Math.min(cam.height - contentH - SCREEN_MARGIN, y));
    this.setPosition(x, y);
    this.setVisible(true);

    console.log(
      `[Shop] Tooltip sized tag=${tag} panelW=${panelW} widest=${widest} `
      + `rows=${rows.length} lines=${lineCount} wrapped=${wrapped} hintBelow=${hintBelow}`,
    );
  }

  hide() {
    if (!this.visible) return;
    this.setVisible(false);
  }

  _getRow(i) {
    if (!this._rowPool[i]) {
      const row = this.scene.add.bitmapText(0, 0, FONT_KEY, '', ROW_FONT_PX);
      row.setOrigin(0, 0);
      this.add(row);
      this._rowPool[i] = row;
    }
    return this._rowPool[i];
  }

  _getHint(i) {
    if (!this._hintPool[i]) {
      const hint = this.scene.add.bitmapText(0, 0, FONT_KEY, '', HINT_FONT_PX);
      hint.setOrigin(1, 0);
      this.add(hint);
      this._hintPool[i] = hint;
    }
    return this._hintPool[i];
  }

  _hideAllRows() {
    this._rowPool.forEach((r) => r.setVisible(false));
    this._hintPool.forEach((h) => h.setVisible(false));
  }

  _measureWidth(text, scale = 2) {
    return PixelFont.measure(text, scale).width;
  }

  _maxCharsPerLine(width, scale = 2) {
    return Math.max(1, Math.floor(width / (PixelFont.CELL_W * scale)));
  }

  _truncateTextToWidth(text, maxWidth, scale = 2) {
    if (!text || maxWidth <= 0) return '';
    if (this._measureWidth(text, scale) <= maxWidth) return text;

    const ellipsis = '...';
    if (this._measureWidth(ellipsis, scale) > maxWidth) return '';

    let truncated = text;
    while (truncated.length > 0 && this._measureWidth(`${truncated}${ellipsis}`, scale) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated ? `${truncated}${ellipsis}` : ellipsis;
  }

  _wrapText(text, maxCharsPerLine) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxCharsPerLine && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.join('\n');
  }
}
