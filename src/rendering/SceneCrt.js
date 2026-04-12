/**
 * SceneCrt — scene-level helpers for the CRT camera filter.
 *
 * Public API
 * ──────────
 *   SceneCrt.attach(scene, presetKey)        — attach filter + register teardown
 *   SceneCrt.detach(scene)                   — remove filter + cancel tween
 *   SceneCrt.playPowerOff(scene, onComplete) — animate powerOff 0→1 then callback
 *   startSceneWithCrtPolicy(scene, key, data)— power-off on qualifying routes,
 *                                              immediate otherwise
 */

import { CrtController } from './CrtController.js';

// ─── Power-off transition policy ─────────────────────────────────────────────
// Returns true when this scene→target route should play the power-off animation.

function _needsPowerOff(scene, targetKey, data) {
  const from = scene.scene.key;

  switch (from) {
    case 'CommanderSelect':
      // Run actually begins → softGameplay squish into Shop
      return targetKey === 'Shop';

    case 'Battle':
      if (targetKey === 'GameOver') return true;
      // Champion flow only (wins === 9)
      if (targetKey === 'HallOfFame') return (data && data.wins >= 9);
      return false;

    case 'GameOver':
      return targetKey === 'CommanderSelect' || targetKey === 'Menu';

    case 'HallOfFame': {
      // fromMenu = leaderboard viewer entered from Menu — no power-off
      // !runId means the scene was started without a run context (fromMenu)
      const fromMenu = !scene.runId;
      if (fromMenu) return false;
      return targetKey === 'CommanderSelect' || targetKey === 'Menu';
    }

    default:
      return false;
  }
}

// ─── SceneCrt ─────────────────────────────────────────────────────────────────

export const SceneCrt = {

  /**
   * Attach the CRT filter to scene.cameras.main (external, outermost).
   * Registers teardown on 'shutdown' so callers don't need to call detach().
   *
   * @param {Phaser.Scene} scene
   * @param {'softGameplay'|'strongUi'} presetKey
   * @returns {CrtController|null}  null when WebGL is unavailable
   */
  attach(scene, presetKey) {
    // CRT requires WebGL renderer
    if (!scene.sys.renderer.gl) {
      console.warn(`[CRT] WebGL renderer required; skipping CRT on ${scene.scene.key}`);
      return null;
    }

    const camera = scene.cameras.main;
    if (!camera.filters) {
      console.warn(`[CRT] Camera has no filters API on ${scene.scene.key}`);
      return null;
    }

    const controller = new CrtController(camera, presetKey);
    camera.filters.external.add(controller);

    // Advance time uniform every frame
    const onUpdate = (_t, delta) => controller.advance(delta);
    scene.events.on('update', onUpdate);

    // Store refs on the scene for detach / playPowerOff
    scene._crtController      = controller;
    scene._crtUpdateListener  = onUpdate;
    scene._crtPowerOffTween   = null;

    // Auto-cleanup when scene stops
    scene.events.once('shutdown', () => SceneCrt.detach(scene));

    console.log(`[CRT] Attached to ${scene.scene.key} (preset: ${presetKey})`);
    return controller;
  },

  /**
   * Remove the CRT filter and clean up all listeners/tweens.
   * Safe to call multiple times or after scene shutdown.
   * @param {Phaser.Scene} scene
   */
  detach(scene) {
    if (!scene._crtController) return;

    // Cancel any in-flight power-off tween
    if (scene._crtPowerOffTween) {
      try { scene._crtPowerOffTween.stop(); } catch (_) { /* scene may be gone */ }
      scene._crtPowerOffTween = null;
    }

    // Remove update listener
    if (scene._crtUpdateListener) {
      scene.events.off('update', scene._crtUpdateListener);
      scene._crtUpdateListener = null;
    }

    // Remove from camera filters (destroys the controller)
    try {
      const cam = scene.cameras && scene.cameras.main;
      if (cam && cam.filters && cam.filters.external) {
        cam.filters.external.remove(scene._crtController, true);
      } else {
        scene._crtController.destroy();
      }
    } catch (e) {
      console.error('[CRT] Error during detach:', e);
    }

    scene._crtController = null;
    console.log(`[CRT] Detached from ${scene.scene.key}`);
  },

  /**
   * Animate powerOff from 0 → 1 over ~600 ms, then call onComplete.
   * If no controller is attached, calls onComplete immediately.
   *
   * @param {Phaser.Scene} scene
   * @param {() => void} onComplete
   */
  playPowerOff(scene, onComplete) {
    const controller = scene._crtController;
    if (!controller) {
      console.warn(`[CRT] playPowerOff: no controller on ${scene.scene.key}`);
      if (onComplete) onComplete();
      return;
    }

    controller.powerOff = 0;

    const tween = scene.tweens.add({
      targets:   controller,
      powerOff:  1,
      duration:  600,
      ease:      'Power2',
      onComplete: () => {
        scene._crtPowerOffTween = null;
        console.log(`[CRT] Power-off complete on ${scene.scene.key}`);
        if (onComplete) onComplete();
      },
    });

    scene._crtPowerOffTween = tween;
    console.log(`[CRT] Power-off started on ${scene.scene.key}`);
  },
};

// ─── Shared scene-start helper ────────────────────────────────────────────────

/**
 * Start a scene, playing the CRT power-off animation first when the route
 * requires it (see _needsPowerOff for the full policy table).
 *
 * Replace direct this.scene.start() calls with this helper for any transition
 * that originates from a CRT-enabled scene.
 *
 * @param {Phaser.Scene} scene       — current (outgoing) scene
 * @param {string}       targetKey  — target scene key
 * @param {object}       [data={}]  — data to pass to the target scene
 */
export function startSceneWithCrtPolicy(scene, targetKey, data = {}) {
  if (_needsPowerOff(scene, targetKey, data)) {
    SceneCrt.playPowerOff(scene, () => scene.scene.start(targetKey, data));
  } else {
    scene.scene.start(targetKey, data);
  }
}
