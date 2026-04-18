/**
 * CrtController — Phaser 4 filter controller for the FilterCRT render node.
 *
 * Usage:
 *   const ctrl = new CrtController(camera, 'softGameplay');
 *   camera.filters.external.add(ctrl);
 *
 * Call ctrl.advance(delta) each frame to animate the flicker/time uniform.
 */

import { Filters } from 'phaser';

const PhaserController = Filters.Controller;

// ─── Presets ──────────────────────────────────────────────────────────────────

export const CRT_PRESETS = {
  /**
   * Subtle CRT for interactive gameplay scenes where pointer accuracy matters.
   * CommanderSelect, Shop, Battle.
   */
  softGameplay: {
    scanlineIntensity: 0.05,
    chromaOffset:      0.35,
    curvatureAmount:   0.04,
    flickerAmount:     0.004,
    vignetteAmount:    0.30,
  },
  /**
   * Stronger CRT for menus and narrative screens.
   * Menu, Settings, GameOver, HallOfFame.
   */
  strongUi: {
    scanlineIntensity: 0.30,
    chromaOffset:      1.1,
    curvatureAmount:   0.08,
    flickerAmount:     0.04,
    vignetteAmount:    0.30,
  },
};

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * @param {Phaser.Cameras.Scene2D.Camera} camera
 * @param {keyof CRT_PRESETS} presetKey
 */
function CrtController(camera, presetKey) {
  PhaserController.call(this, camera, 'FilterCRT');

  const preset = CRT_PRESETS[presetKey] || CRT_PRESETS.softGameplay;

  /** Elapsed time in seconds — drives flicker animation. */
  this.time              = 0;
  this.scanlineIntensity = preset.scanlineIntensity;
  this.chromaOffset      = preset.chromaOffset;
  this.curvatureAmount   = preset.curvatureAmount;
  this.flickerAmount     = preset.flickerAmount;
  this.vignetteAmount    = preset.vignetteAmount;
  /** 0 = normal, 1 = fully off. Tweened by SceneCrt.playPowerOff(). */
  this.powerOff          = 0;

  /**
   * Current CRT wiggle intensity (0..~1). Brief random bursts make the picture
   * shiver like a TV with a bad signal. Managed inside advance().
   */
  this.wiggle            = 0;
  this._wiggleStart      = 0;
  this._wiggleEnd        = 0;
  this._wigglePeak       = 0;
  // First wiggle lands a few seconds in so the scene reads as "calm, then twitch".
  this._nextWiggleAt     = 2.5 + Math.random() * 5.5;
}

CrtController.prototype = Object.create(PhaserController.prototype);
CrtController.prototype.constructor = CrtController;

/**
 * Advance the internal clock. Call from a scene 'update' listener.
 * @param {number} delta — frame delta in milliseconds
 */
CrtController.prototype.advance = function (delta) {
  this.time += delta * 0.001;

  // Schedule the next wiggle when idle and the timer has elapsed.
  if (this.time >= this._wiggleEnd && this.time >= this._nextWiggleAt) {
    const dur = 0.10 + Math.random() * 0.28;   // 100–380 ms burst
    this._wiggleStart = this.time;
    this._wiggleEnd   = this.time + dur;
    this._wigglePeak  = 0.25 + Math.random() * 0.45;
    // Next burst lands 4–16 s later — infrequent, feels like a glitch,
    // not constant noise.
    this._nextWiggleAt = this._wiggleEnd + 4 + Math.random() * 12;
    // Rare jackpot: occasional stronger burst for variety.
    if (Math.random() < 0.1) this._wigglePeak = Math.min(1.0, this._wigglePeak + 0.3);
  }

  // Triangle envelope: fast attack, slower decay.
  if (this.time < this._wiggleEnd) {
    const span = this._wiggleEnd - this._wiggleStart;
    const t = span > 0 ? (this.time - this._wiggleStart) / span : 1;
    const env = t < 0.25 ? (t / 0.25) : (1 - (t - 0.25) / 0.75);
    this.wiggle = this._wigglePeak * Math.max(0, env);
  } else {
    this.wiggle = 0;
  }
};

export { CrtController };
