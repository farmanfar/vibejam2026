import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';

/**
 * Vertical uniform-scale menu list. Ported (simplified) from
 * TorchWars PixelUI/PixelList.cs. All rows share one font scale —
 * you can't scale a single row, so the list always reads as a list.
 *
 * Row behavior matches PixelButton 'text' style:
 *   Hover → text slides right 6px + focus band fades in + tint→hover
 *   Click → brief white flash then hover tint, then onClick()
 *
 * Intentionally omitted vs TorchWars: scrolling, group headers/arrows,
 * guide lines, sustained-hover accent, keyboard nav. Add if needed.
 */
export class PixelList extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Array<{label:string, onClick?:Function, color?:number, scale?:number}>} items
   *   `scale` on an item overrides the list default for that row only.
   * @param {object} [opts]
   * @param {number} [opts.scale=3]          default font scale for rows without an override
   * @param {number} [opts.itemPadding=7]    vertical padding above/below text per row
   * @param {number} [opts.bandPadX=10]
   * @param {number} [opts.bandRightExt=20]  extra hit/band width past the text
   */
  constructor(scene, x, y, items, opts = {}) {
    super(scene, x, y);
    this.itemScale     = opts.scale ?? 3;
    this.itemPadding   = opts.itemPadding ?? 7;
    this._bandPadX     = opts.bandPadX ?? 10;
    this._bandRightExt = opts.bandRightExt ?? 20;

    // Precompute each row's height from its (possibly-overridden) scale so
    // rows using a smaller font don't waste vertical space.
    this._rowHeights = (items ?? []).map((entry) => {
      const s = entry.scale ?? this.itemScale;
      return 7 * s + this.itemPadding * 2;
    });

    this._rows = [];
    let yCursor = 0;
    (items ?? []).forEach((entry, i) => {
      this._addRow(entry, i, yCursor);
      yCursor += this._rowHeights[i];
    });
    this.listHeight = yCursor;

    scene.add.existing(this);
  }

  _addRow(entry, index, rowTopY) {
    const scale    = entry.scale ?? this.itemScale;
    const fontSize = 7 * scale;
    const rowH     = fontSize + this.itemPadding * 2;
    const textY    = rowTopY + this.itemPadding;
    const baseTint = entry.color ?? Theme.primaryText;

    // Text first so Phaser gives us real rendered width.
    const text = this.scene.add.bitmapText(0, textY, FONT_KEY, entry.label, fontSize)
      .setTint(baseTint);

    const textW = text.width;
    const bandW = textW + this._bandPadX + this._bandRightExt;
    const bandH = rowH;

    // Focus band (hover feedback).
    const band = this.scene.add.rectangle(
      -this._bandPadX,
      rowTopY,
      bandW, bandH,
      Theme.focusBand,
    ).setOrigin(0).setAlpha(0);

    // Invisible hit zone — sized to band so the whole row is clickable.
    const hit = this.scene.add.rectangle(
      -this._bandPadX + bandW / 2,
      rowTopY + bandH / 2,
      bandW, bandH,
      0x000000, 0,
    ).setInteractive({ useHandCursor: true });

    this.add([band, text, hit]);

    hit.on('pointerover', () => {
      if (entry.disabled) return;
      this.scene.tweens.add({ targets: text, x: 6, duration: 120, ease: 'Power2' });
      this.scene.tweens.add({ targets: band, alpha: 0.35, duration: 120 });
      text.setTint(Theme.hover);
    });
    hit.on('pointerout', () => {
      this.scene.tweens.add({ targets: text, x: 0, duration: 120, ease: 'Power2' });
      this.scene.tweens.add({ targets: band, alpha: 0, duration: 120 });
      text.setTint(entry.disabled ? Theme.disabled : baseTint);
    });
    hit.on('pointerdown', () => {
      if (entry.disabled) return;
      text.setTint(0xffffff);
      this.scene.time.delayedCall(80, () => text.setTint(Theme.hover));
      entry.onClick?.();
    });

    this._rows.push({ text, band, hit, entry });
  }
}
