/**
 * OutlineController — Phaser 4 filter controller for the FilterOutline render node.
 *
 * Usage:
 *   sprite.enableFilters();                    // sets up sprite.filterCamera
 *   const ctrl = new OutlineController(sprite.filterCamera);
 *   sprite.filters.internal.add(ctrl);
 *
 * Critical: ALWAYS pass sprite.filterCamera (not the sprite) to the constructor,
 * because Filters.Controller takes a Camera. See node_modules/phaser/src/filters/Controller.js.
 *
 * Tuning knobs live in OUTLINE_DEFAULTS at the top of this file. Vite HMR picks
 * up edits to the consts. To kill the experiment without ripping out the wiring,
 * flip OUTLINE_ENABLED to false.
 */

import { Filters } from 'phaser';

const PhaserController = Filters.Controller;

// ─── Tuning ─────────────────────────────────────────────────────────────────

/** Master kill switch. Flip to false to disable outlines globally. */
export const OUTLINE_ENABLED = false;

/**
 * Default outline parameters. Adjust here and let Vite HMR push the change.
 *   color:          RGB triple in 0..1 range. [0,0,0] = pure black.
 *   thickness:      Outline width in framebuffer pixels (NOT source pixels).
 *                   At sprite displayScale 2.5, 0.5 framebuffer px ≈ 0.2 source px.
 *   alphaThreshold: Edge cutoff for anti-aliased sprite borders. 0.5 is safe.
 */
export const OUTLINE_DEFAULTS = {
  color:          [0.0, 0.0, 0.0],
  thickness:      0.6,
  alphaThreshold: 0.5,
};

// ─── Controller ─────────────────────────────────────────────────────────────

/**
 * @param {Phaser.Cameras.Scene2D.Camera} camera — pass sprite.filterCamera
 *        AFTER calling sprite.enableFilters(). Never pass the sprite itself.
 * @param {Partial<typeof OUTLINE_DEFAULTS>} [opts]
 */
function OutlineController(camera, opts) {
  PhaserController.call(this, camera, 'FilterOutline');

  const cfg = Object.assign({}, OUTLINE_DEFAULTS, opts || {});
  this.color          = cfg.color;
  this.thickness      = cfg.thickness;
  this.alphaThreshold = cfg.alphaThreshold;

  // Disable the default zero-rect padding override so getPadding() is consulted
  // dynamically. See node_modules/phaser/src/filters/Controller.js (paddingOverride
  // defaults to a non-null empty Rectangle) and Glow's docstring at
  // node_modules/phaser/src/filters/Glow.js.
  this.setPaddingOverride(null);
}

OutlineController.prototype = Object.create(PhaserController.prototype);
OutlineController.prototype.constructor = OutlineController;

/**
 * Returns the framebuffer padding required so the halo is not clipped at the
 * sprite's bounds. Mirrors Phaser.Filters.Glow#getPadding.
 *
 * @returns {Phaser.Geom.Rectangle}
 */
OutlineController.prototype.getPadding = function () {
  const t = Math.ceil(this.thickness) + 1; // +1 safety for AA bleed
  const p = this.currentPadding;
  p.left   = -t;
  p.top    = -t;
  p.right  =  t;
  p.bottom =  t;
  return p;
};

/**
 * Attach an OutlineController to any Phaser GameObject that supports filters
 * (Sprite, Image, etc.). Handles enableFilters() ordering and Canvas-mode
 * fallback. Safe no-op when OUTLINE_ENABLED is false.
 *
 * @param {Phaser.GameObjects.GameObject} sprite
 * @returns {OutlineController|null} the controller, or null if not attached
 */
export function attachOutlineToSprite(sprite) {
  if (!OUTLINE_ENABLED) return null;
  if (!sprite || typeof sprite.enableFilters !== 'function') return null;
  sprite.enableFilters();
  if (!sprite.filters) {
    console.warn('[Outline] sprite.filters null after enableFilters() — hookup failed');
    return null;
  }
  const ctrl = new OutlineController(sprite.filterCamera);
  sprite.filters.internal.add(ctrl);
  sprite._outlineCtrl = ctrl;   // cache for VFX lookup
  return ctrl;
}

/**
 * 500ms outline pulse: black→gold→white→black, thickness 0.5→1.5→0.5.
 * Tween proxies a plain object to avoid mutating the array reference.
 * Non-blocking — does not freeze input.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} sprite - must have sprite._outlineCtrl set
 */
export function pulseLevelUp(scene, sprite) {
  const ctrl = sprite?._outlineCtrl;
  if (!ctrl) {
    console.warn('[Outline] pulseLevelUp — no controller cached on sprite');
    return;
  }
  const origColor = [...ctrl.color];   // snapshot, not a live reference
  const origThick = ctrl.thickness;
  const GOLD  = [1.0, 0.84, 0.0];
  const WHITE = [1.0, 1.0, 1.0];

  const proxy = { r: origColor[0], g: origColor[1], b: origColor[2], t: origThick };

  scene.tweens.chain({
    targets: proxy,
    tweens: [
      {
        r: GOLD[0], g: GOLD[1], b: GOLD[2], t: 1.5,
        duration: 170, ease: 'Sine.Out',
        onUpdate: () => { ctrl.color = [proxy.r, proxy.g, proxy.b]; ctrl.thickness = proxy.t; },
      },
      {
        r: WHITE[0], g: WHITE[1], b: WHITE[2], t: 1.0,
        duration: 165, ease: 'Sine.InOut',
        onUpdate: () => { ctrl.color = [proxy.r, proxy.g, proxy.b]; ctrl.thickness = proxy.t; },
      },
      {
        r: origColor[0], g: origColor[1], b: origColor[2], t: origThick,
        duration: 165, ease: 'Sine.In',
        onUpdate: () => { ctrl.color = [proxy.r, proxy.g, proxy.b]; ctrl.thickness = proxy.t; },
        onComplete: () => { ctrl.color = origColor; ctrl.thickness = origThick; },
      },
    ],
  });
}

/**
 * Brief cyan outline pulse on a combatant during a clash. Mirrors
 * pulseLevelUp's structure but uses the DarkTech accent colour and a
 * shorter envelope so it can fire every clash without feeling heavy.
 *
 * Color: cyan-white pulse (matches Theme.accent / Theme.hover).
 * Thickness: original → 4.0 → original over ~440ms.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} sprite - must have sprite._outlineCtrl set
 */
export function pulseFocus(scene, sprite) {
  const ctrl = sprite?._outlineCtrl;
  if (!ctrl) return;
  const origColor = [...ctrl.color];
  const origThick = ctrl.thickness;
  const CYAN  = [0.49, 0.81, 1.0];   // ≈ Theme.accent #7cceff
  const WHITE = [0.80, 0.92, 1.0];   // ≈ Theme.hover  #ccebff

  const proxy = { r: origColor[0], g: origColor[1], b: origColor[2], t: origThick };

  scene.tweens.chain({
    targets: proxy,
    tweens: [
      {
        r: CYAN[0], g: CYAN[1], b: CYAN[2], t: 4.0,
        duration: 140, ease: 'Sine.Out',
        onUpdate: () => { ctrl.color = [proxy.r, proxy.g, proxy.b]; ctrl.thickness = proxy.t; },
      },
      {
        r: WHITE[0], g: WHITE[1], b: WHITE[2], t: 3.2,
        duration: 140, ease: 'Sine.InOut',
        onUpdate: () => { ctrl.color = [proxy.r, proxy.g, proxy.b]; ctrl.thickness = proxy.t; },
      },
      {
        r: origColor[0], g: origColor[1], b: origColor[2], t: origThick,
        duration: 160, ease: 'Sine.In',
        onUpdate: () => { ctrl.color = [proxy.r, proxy.g, proxy.b]; ctrl.thickness = proxy.t; },
        onComplete: () => { ctrl.color = origColor; ctrl.thickness = origThick; },
      },
    ],
  });
}

/**
 * Star-level pop: scale + flash on the newest star in a WarriorCard's
 * persistent star bar. Paired with `pulseLevelUp()` at combine time so the
 * portrait outline and the new star light up together.
 *
 * The card's `_drawStarBar()` rebuilds the star bar fresh each time a card
 * is constructed, so the "last" star in the array is always the one that
 * just arrived when a combine fires _drawTeamRow().
 *
 * @param {Phaser.Scene} scene
 * @param {import('../ui/WarriorCard.js').WarriorCard} card
 */
export function pulseStarLevelUp(scene, card) {
  const bar = card?._starBar;
  const stars = bar?.stars;
  if (!stars || stars.length === 0) {
    console.warn('[VFX] pulseStarLevelUp — card has no star bar');
    return;
  }
  const star = stars[stars.length - 1];
  const gold = star._restTint ?? 0xffd700;
  const GOLD_R = (gold >> 16) & 0xff;
  const GOLD_G = (gold >> 8) & 0xff;
  const GOLD_B = gold & 0xff;

  console.log(`[VFX] starLevelUp stars=${stars.length}`);

  // Star pop: scale 0 → 1.5 → 1.0 + alpha 0.3 → 1
  star.setScale(0).setAlpha(0.3).setTint(0xffffff);
  scene.tweens.chain({
    targets: star,
    tweens: [
      { scale: 1.5, alpha: 1, duration: 220, ease: 'Back.Out' },
      { scale: 1.0, duration: 140, ease: 'Sine.InOut' },
    ],
  });

  // Tint lerp: white → gold over 340ms (covers both pop phases).
  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 340,
    onUpdate: (tween) => {
      const t = tween.getValue();
      const r = Math.round(255 * (1 - t) + GOLD_R * t);
      const g = Math.round(255 * (1 - t) + GOLD_G * t);
      const b = Math.round(255 * (1 - t) + GOLD_B * t);
      star.setTint((r << 16) | (g << 8) | b);
    },
    onComplete: () => star.setTint(gold),
  });

  // Ring flash: expanding gold circle behind the star, fades out.
  const ring = scene.add.graphics();
  ring.lineStyle(2, gold, 1);
  ring.strokeCircle(0, 0, 8);
  ring.x = star.x;
  ring.y = 0; // star bar is the parent at (0, STAR_BAR_Y)
  ring.setAlpha(0.85);
  bar.addAt(ring, 0); // behind the stars
  scene.tweens.add({
    targets: ring,
    scale: 2.4,
    alpha: 0,
    duration: 380,
    ease: 'Sine.Out',
    onComplete: () => ring.destroy(),
  });
}

export { OutlineController };
