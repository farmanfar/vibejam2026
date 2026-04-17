// Shared portrait-fit helper for PENUSBMIC aseprite sprites.
//
// PENUSBMIC atlases pack characters at wildly different sizes and positions
// inside each frame — a naive setOrigin(0.5, 0.5) anchors at the transparent
// canvas center, which may be nowhere near the actual character pixels. Both
// BattleScene._adjustBattleSprite and WarriorCard used to inline the same
// tight-bounds fit algorithm. This module owns it so the two call sites stay
// in sync.
//
// Two modes, selected by options:
//   - Battle mode (configScale set): start with the unit's displayScale and
//     boost up to minHeightPx so tiny atlases aren't dwarfed.
//   - Card mode (window set, configScale undefined): fit tight bounds into
//     a fixed display rectangle, capped by maxScale.

import { getTightFrameBounds } from './spriteBounds.js';

/**
 * Re-anchor and scale a sprite so its tight non-transparent bounds land at
 * the configured window center.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Sprite|Phaser.GameObjects.Image} sprite
 * @param {{ key: string, frame?: string }} ref texture/frame ref
 * @param {object} opts
 * @param {{ cx:number, cy:number, w:number, h:number }} [opts.window]
 *   Card-mode target rectangle (used only when configScale is undefined).
 * @param {number} [opts.maxScale] Card-mode cap on computed scale.
 * @param {number} [opts.minHeightPx] Battle-mode floor on displayed tight height.
 * @param {number} [opts.configScale] Battle-mode preferred scale (e.g. warrior.art.displayScale).
 * @param {boolean} [opts.flipXInvert=false] Invert origin.x when sprite.flipX is true.
 * @param {string} [opts.logTag='[SpriteFit]'] Prefix for console logs.
 * @param {string} [opts.warriorId='unknown']
 * @param {string} [opts.side] Battle-mode side (`'player'` / `'enemy'`).
 * @returns {{applied: boolean, bounds: object|null, scale: number|null, origin: {ox:number, oy:number}|null}}
 *   `applied: false` means bounds were missing and the caller should take its own
 *   fallback path (caller is responsible for any rescale/warn it wants to add).
 */
export function fitSpriteToPortraitBounds(scene, sprite, ref, opts = {}) {
  const {
    window,
    maxScale,
    minHeightPx,
    configScale,
    flipXInvert = false,
    logTag = '[SpriteFit]',
    warriorId = 'unknown',
    side,
  } = opts;

  const bounds = getTightFrameBounds(scene, ref.key, ref.frame);
  if (!bounds || bounds.w <= 0 || bounds.h <= 0 || bounds.fullyTransparent) {
    const who = side ? `${side} ${warriorId}` : warriorId;
    console.warn(`${logTag} ${who}: no tight bounds`);
    return { applied: false, bounds: null, scale: null, origin: null };
  }

  const frameW = sprite.frame?.width ?? sprite.width;
  const frameH = sprite.frame?.height ?? sprite.height;
  const rawOx = (bounds.x + bounds.w / 2) / frameW;
  const oy = (bounds.y + bounds.h / 2) / frameH;
  const ox = (flipXInvert && sprite.flipX) ? 1 - rawOx : rawOx;

  let scale;
  let boosted = false;
  const isBattleMode = configScale != null;
  if (isBattleMode) {
    scale = configScale;
    if (minHeightPx != null && bounds.h * configScale < minHeightPx) {
      scale = minHeightPx / bounds.h;
      boosted = true;
    }
  } else if (window != null) {
    const cap = maxScale ?? Infinity;
    scale = Math.min(window.w / bounds.w, window.h / bounds.h, cap);
  } else {
    scale = 1;
  }

  sprite.setOrigin(ox, oy);
  sprite.setScale(scale);

  const who = side ? `${side} ${warriorId}` : warriorId;
  if (isBattleMode) {
    if (boosted) {
      console.log(
        `${logTag} ${who} tight ${bounds.w}x${bounds.h} @ (${bounds.x},${bounds.y}) `
        + `origin (${ox.toFixed(3)},${oy.toFixed(3)}) scale ${configScale.toFixed(2)} → ${scale.toFixed(2)} `
        + `(boosted to min ${minHeightPx}px)`,
      );
    } else {
      console.log(
        `${logTag} ${who} tight ${bounds.w}x${bounds.h} @ (${bounds.x},${bounds.y}) `
        + `origin (${ox.toFixed(3)},${oy.toFixed(3)}) scale ${configScale.toFixed(2)}`,
      );
    }
  } else {
    console.log(
      `${logTag} ${who} frame ${frameW}x${frameH} `
      + `tight ${bounds.w}x${bounds.h}@(${bounds.x},${bounds.y}) `
      + `→ scale ${scale.toFixed(2)} origin (${ox.toFixed(3)},${oy.toFixed(3)})`,
    );
  }

  return { applied: true, bounds, scale, origin: { ox, oy } };
}
