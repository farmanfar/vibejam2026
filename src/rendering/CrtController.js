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
   * CommanderSelect, Shop, Battle, UnitLab.
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
}

CrtController.prototype = Object.create(PhaserController.prototype);
CrtController.prototype.constructor = CrtController;

/**
 * Advance the internal clock. Call from a scene 'update' listener.
 * @param {number} delta — frame delta in milliseconds
 */
CrtController.prototype.advance = function (delta) {
  this.time += delta * 0.001;
};

export { CrtController };
