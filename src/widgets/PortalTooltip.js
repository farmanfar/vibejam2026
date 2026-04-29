import { GameObjects } from 'phaser';
import { Theme } from '../ui/Theme.js';
import { FONT_KEY } from '../ui/PixelFont.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';

const PAD_X = 10;
const PAD_Y = 7;
const FONT_SIZE = 14; // 7px * scale 2

export class PortalTooltip extends GameObjects.Container {
  static measurePanel(scene, text) {
    const tempText = scene.add.bitmapText(0, 0, FONT_KEY, text, FONT_SIZE);
    const textW = tempText.getTextBounds().local.width;
    tempText.destroy();

    return {
      width: textW + PAD_X * 2,
      height: FONT_SIZE + PAD_Y * 2,
    };
  }

  static centeredX(scene, centerX, text) {
    return Math.round(centerX - this.measurePanel(scene, text).width / 2);
  }

  constructor(scene, x, y, text, layoutKey) {
    super(scene, x, y);
    this._layoutKey = layoutKey;
    this._wiggleTween = null;

    // Inner visual group — tween target. Outer container (`this`) is the LayoutEditor handle.
    // Keeping them separate means F2 drag and wiggle never conflict.
    this._visual = scene.add.container(0, 0);

    const { width: panelW, height: panelH } = PortalTooltip.measurePanel(scene, text);

    const bg = scene.add.rectangle(0, 0, panelW, panelH, Theme.panelBg, 0.95).setOrigin(0);
    const border = scene.add.graphics();
    border.lineStyle(1, Theme.warning, 1);
    border.strokeRect(0, 0, panelW, panelH);
    const label = scene.add.bitmapText(PAD_X, PAD_Y, FONT_KEY, text, FONT_SIZE)
      .setOrigin(0, 0)
      .setTint(Theme.warning);

    this._visual.add([bg, border, label]);
    this.add(this._visual);

    // Expose dimensions for LayoutEditor bounds detection
    this.panelW = panelW;
    this.panelH = panelH;

    this.setDepth(80).setVisible(false);
    scene.add.existing(this);
    LayoutEditor.register(scene, layoutKey, this, x, y);
  }

  show() {
    if (this.visible) return;
    this.setVisible(true);
    this._startWiggle();
    console.log(`[Portal] PortalTooltip '${this._layoutKey}' shown`);
  }

  hide() {
    if (!this.visible) return;
    this._stopWiggle();
    this.setVisible(false);
    console.log(`[Portal] PortalTooltip '${this._layoutKey}' hidden`);
  }

  _startWiggle() {
    if (this._wiggleTween) return;
    this._wiggleTween = this.scene.tweens.add({
      targets: this._visual,
      x: { from: -1.5, to: 1.5 },
      y: { from: -0.6, to: 0.6 },
      duration: 130,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
  }

  _stopWiggle() {
    if (this._wiggleTween) {
      this._wiggleTween.stop();
      this._wiggleTween = null;
      this._visual.setPosition(0, 0); // snap away sub-pixel drift
    }
  }

  destroy(fromScene) {
    this._stopWiggle();
    super.destroy(fromScene);
  }
}
