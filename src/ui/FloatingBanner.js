// FloatingBanner — no Phaser import needed, uses scene methods directly
import { Theme } from './Theme.js';
import { FONT_KEY } from './PixelFont.js';

/**
 * Fade-in / hold / fade-out announcement banner.
 * Ported from TorchWars FloatingBanner.
 * Centers on screen, big text, optional subtitle.
 */
export class FloatingBanner {
  /**
   * Show a banner and return a promise that resolves when it's done.
   * @param {Phaser.Scene} scene
   * @param {string} text - main text (e.g. "VICTORY!")
   * @param {object} [opts]
   * @param {string} [opts.subtitle] - smaller text below
   * @param {number} [opts.color] - main text tint (default: criticalText)
   * @param {number} [opts.fadeIn=300] - fade in duration ms
   * @param {number} [opts.hold=1200] - hold duration ms
   * @param {number} [opts.fadeOut=400] - fade out duration ms
   * @param {number} [opts.scale=8] - font scale for main text
   * @returns {Promise<void>}
   */
  static show(scene, text, opts = {}) {
    return new Promise((resolve) => {
      const { width, height } = scene.cameras.main;
      const fadeIn = opts.fadeIn ?? 300;
      const hold = opts.hold ?? 1200;
      const fadeOut = opts.fadeOut ?? 400;
      const scale = opts.scale ?? 8;
      const color = opts.color ?? Theme.criticalText;

      const fontSize = 7 * scale;

      // Dimming backdrop
      const dimmer = scene.add.rectangle(
        width / 2, height / 2, width, height, 0x000000
      ).setAlpha(0).setDepth(900);

      // Main text
      const mainText = scene.add.bitmapText(
        width / 2, height / 2 - 20, FONT_KEY, text, fontSize
      ).setOrigin(0.5).setTint(color).setAlpha(0).setDepth(901);

      // Scale punch: start slightly large, settle to 1x
      mainText.setScale(1.3);

      // Subtitle
      let subText = null;
      if (opts.subtitle) {
        subText = scene.add.bitmapText(
          width / 2, height / 2 + fontSize / 2 + 8, FONT_KEY,
          opts.subtitle, 7 * 3
        ).setOrigin(0.5).setTint(Theme.mutedText).setAlpha(0).setDepth(901);
      }

      // Fade in
      scene.tweens.add({
        targets: dimmer,
        alpha: 0.4,
        duration: fadeIn,
      });
      scene.tweens.add({
        targets: mainText,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: fadeIn,
        ease: 'Back.easeOut',
      });
      if (subText) {
        scene.tweens.add({
          targets: subText,
          alpha: 1,
          duration: fadeIn,
          delay: fadeIn * 0.5,
        });
      }

      // Hold, then fade out
      scene.time.delayedCall(fadeIn + hold, () => {
        const targets = [dimmer, mainText];
        if (subText) targets.push(subText);

        scene.tweens.add({
          targets,
          alpha: 0,
          duration: fadeOut,
          onComplete: () => {
            dimmer.destroy();
            mainText.destroy();
            subText?.destroy();
            resolve();
          },
        });
      });
    });
  }
}
