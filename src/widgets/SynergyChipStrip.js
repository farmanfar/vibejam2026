/**
 * SynergyChipStrip — horizontal row of icon chips representing the team's
 * active synergy tags (factions + classes). Replaces the old text label
 * "Robot x1   Grunt x1" in the Shop scene.
 *
 * Each chip is icon + count badge. Hovering a chip fires the configured
 * `onChipHover(tag, count, worldX, worldY)` callback — the scene wires this
 * to a SynergyTooltip instance.
 *
 * Reflow is fully owned here. The scene calls `setCounts(counts)` whenever
 * the team changes; the strip rebuilds its children. The strip itself is
 * registered as a single LayoutEditor element by the scene (anchor pattern
 * per project_shop_architecture).
 */

import { GameObjects } from 'phaser';
import { Theme } from '../ui/Theme.js';
import { FONT_KEY } from '../ui/PixelFont.js';
import { getSynergyIconEntry, getChipBadgeText } from '../config/synergy-icons.js';

const ICON_SIZE       = 24;   // source PNG size (DARK Skill Icons are 24x24)
const ICON_SCALE      = 1.5;  // render at 36px for legibility
const ICON_PX         = ICON_SIZE * ICON_SCALE;       // 36
const BADGE_MAX_W     = 28;   // room for up to "10/10" in m5x7 at 2x
const BADGE_GUTTER    = 6;    // gap between icon right edge and badge left edge
const CHIP_PAD_X      = 4;    // inner horizontal padding
const CHIP_W          = ICON_PX + BADGE_GUTTER + BADGE_MAX_W + CHIP_PAD_X * 2;
const CHIP_H          = ICON_PX + 6;
const CHIP_GAP        = 16;   // clear visual separation between adjacent chips
const HITZONE_PAD     = 4;
const BADGE_FONT_PX   = 14;   // m5x7 at 2x = 14px

export class SynergyChipStrip extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {(tag:string, count:number, worldX:number, worldY:number) => void} [opts.onChipHover]
   * @param {() => void} [opts.onChipOut]
   */
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    this.scene = scene;

    this._onChipHover = opts.onChipHover ?? (() => {});
    this._onChipOut   = opts.onChipOut   ?? (() => {});
    this._chipPool    = [];   // recycled chip containers
    this._activeChips = [];   // chips currently in use, in display order

    scene.add.existing(this);
  }

  /**
   * @param {Record<string, number>} counts  e.g. { Robot: 2, Grunt: 1 }
   */
  setCounts(counts) {
    const entries = Object.entries(counts || {})
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a);

    // Recycle existing chips, expanding pool as needed.
    while (this._chipPool.length < entries.length) {
      this._chipPool.push(this._createChip());
    }

    // Hide all pool chips, then show + populate the leading N.
    this._chipPool.forEach((chip) => chip.setVisible(false));
    this._activeChips = [];

    const totalW = entries.length * CHIP_W + Math.max(0, entries.length - 1) * CHIP_GAP;
    let cursor = -totalW / 2 + CHIP_W / 2;

    entries.forEach(([tag, count], i) => {
      const chip = this._chipPool[i];
      this._populateChip(chip, tag, count);
      chip.setPosition(cursor, 0);
      chip.setVisible(true);
      this._activeChips.push(chip);
      cursor += CHIP_W + CHIP_GAP;
    });

    console.log(`[Shop] SynergyChipStrip rendered ${entries.length} chips: ${entries.map(([t, n]) => `${t}=${n}`).join(', ')}`);
  }

  _createChip() {
    const scene = this.scene;
    const chip = scene.add.container(0, 0);
    chip.setSize(CHIP_W, CHIP_H);

    // Icon sprite — anchored to the left of the chip.
    const iconX = -CHIP_W / 2 + CHIP_PAD_X + ICON_PX / 2;
    const icon = scene.add.image(iconX, 0, '');
    icon.setScale(ICON_SCALE);
    chip.add(icon);
    chip._icon = icon;

    // Count badge — to the right of the icon, separated by BADGE_GUTTER.
    // Origin (0, 0.5) so the text starts exactly at the gutter, never overlaps the icon.
    const badgeX = iconX + ICON_PX / 2 + BADGE_GUTTER;
    const badge = scene.add.bitmapText(badgeX, 0, FONT_KEY, '', BADGE_FONT_PX);
    badge.setOrigin(0, 0.5);
    badge.setTint(Theme.fantasyGoldBright);
    chip.add(badge);
    chip._badge = badge;

    // Hover hitzone — generous padding (per feedback memory: grow hit areas
    // rather than shrink visuals).
    const hit = scene.add.rectangle(0, 0, CHIP_W + HITZONE_PAD * 2, CHIP_H + HITZONE_PAD * 2, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    chip.add(hit);
    chip._hit = hit;

    hit.on('pointerover', () => {
      // Subtle scale tween for hover affordance.
      this.scene.tweens.add({
        targets: chip,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 90,
        ease: 'Sine.easeOut',
      });
      const m = chip.getWorldTransformMatrix();
      this._onChipHover(chip._tag, chip._count, m.tx, m.ty);
    });

    hit.on('pointerout', () => {
      this.scene.tweens.add({
        targets: chip,
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 120,
        ease: 'Sine.easeIn',
      });
      this._onChipOut();
    });

    chip.setVisible(false);
    this.add(chip);
    return chip;
  }

  _populateChip(chip, tag, count) {
    const entry = getSynergyIconEntry(tag);
    chip._tag = tag;
    chip._count = count;

    if (this.scene.textures.exists(entry.textureKey)) {
      chip._icon.setTexture(entry.textureKey);
      chip._icon.setVisible(true);
    } else {
      // Texture missing — fall back to default if loaded, otherwise hide icon
      // so the chip still shows the tag count via the badge.
      const fallbackKey = 'syn-icon-default';
      if (this.scene.textures.exists(fallbackKey)) {
        chip._icon.setTexture(fallbackKey);
        chip._icon.setVisible(true);
      } else {
        chip._icon.setVisible(false);
        console.warn(`[Shop] Synergy icon texture missing for tag "${tag}" (key: ${entry.textureKey}) and no fallback loaded`);
      }
    }

    chip._badge.setText(getChipBadgeText(tag, count));
  }

  destroy(fromScene) {
    this._chipPool.forEach((chip) => chip.destroy());
    this._chipPool = [];
    this._activeChips = [];
    super.destroy(fromScene);
  }
}
