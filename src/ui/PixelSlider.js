import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { PixelLabel } from './PixelLabel.js';

const TRACK_HEIGHT = 6;
const KNOB_W = 8;
const KNOB_H = 16;
const HIT_VPAD = 10;
const LABEL_GAP = 12;
const PERCENT_GAP = 12;

/**
 * Horizontal value slider. Container origin sits at the track center so the
 * scene caller can position by visual midpoint (matches PixelButton filled).
 *
 * Layout (left → right): label · track (with fill + knob) · percent readout.
 */
export class PixelSlider extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {string} [opts.label='']         - text shown left of the track
   * @param {number} [opts.width=200]        - track width in px
   * @param {number} [opts.value=1.0]        - initial value, clamped 0..1
   * @param {number|null} [opts.steps=null]  - integer step count (e.g. 20 → 5%); null = continuous
   * @param {Function} [opts.onChange]       - called with new value (0..1) on user change
   */
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);

    this.labelStr = opts.label ?? '';
    this.trackW   = opts.width ?? 200;
    this.steps    = opts.steps ?? null;
    this.onChange = opts.onChange ?? null;
    this._value   = this._quantize(this._clamp(opts.value ?? 1.0));
    this._dragging = false;

    const halfW = this.trackW / 2;

    // Label — anchored to track's left edge, text grows leftward
    this.labelText = new PixelLabel(scene, -halfW - LABEL_GAP, 0, this.labelStr, {
      scale: 2,
      color: 'primary',
      align: 'right',
    });
    this.labelText.setOrigin(1, 0.5);
    this.add(this.labelText);

    // Track background
    this.trackBg = scene.add.rectangle(0, 0, this.trackW, TRACK_HEIGHT, Theme.panelBg)
      .setOrigin(0.5);
    this.add(this.trackBg);

    // Filled portion — origin (0, 0.5) so width grows rightward from track left
    this.fill = scene.add.rectangle(
      -halfW, 0,
      this.trackW * this._value, TRACK_HEIGHT,
      Theme.accent,
    ).setOrigin(0, 0.5).setAlpha(0.55);
    this.add(this.fill);

    // 1px border on top of fill so the empty/full transition stays sharp
    this.trackBorder = scene.add.graphics();
    this.trackBorder.lineStyle(1, Theme.panelBorder, 1);
    this.trackBorder.strokeRect(-halfW, -TRACK_HEIGHT / 2, this.trackW, TRACK_HEIGHT);
    this.add(this.trackBorder);

    // Knob
    const knobX = -halfW + this.trackW * this._value;
    this.knob = scene.add.rectangle(knobX, 0, KNOB_W, KNOB_H, Theme.accent).setOrigin(0.5);
    this.add(this.knob);

    // Percent readout — anchored to track's right edge, text grows rightward
    this.percentText = new PixelLabel(scene, halfW + PERCENT_GAP, 0, this._formatPercent(this._value), {
      scale: 2,
      color: 'muted',
      align: 'left',
    });
    this.percentText.setOrigin(0, 0.5);
    this.add(this.percentText);

    // Hit zone — wider vertical pad than the track so clicks are forgiving.
    // Sits last (top-most) so it absorbs all pointer events on the track area.
    this.hitZone = scene.add.rectangle(0, 0, this.trackW, TRACK_HEIGHT + HIT_VPAD * 2, 0x000000, 0)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.add(this.hitZone);

    this._setupInteraction();

    scene.add.existing(this);
  }

  _clamp(v) {
    return Math.max(0, Math.min(1, v));
  }

  _quantize(v) {
    if (!this.steps) return v;
    return Math.round(v * this.steps) / this.steps;
  }

  _formatPercent(v) {
    return `${Math.round(v * 100)}%`;
  }

  _refresh() {
    const halfW = this.trackW / 2;
    this.knob.x = -halfW + this.trackW * this._value;
    this.fill.setSize(Math.max(0, this.trackW * this._value), TRACK_HEIGHT);
    this.percentText.setText(this._formatPercent(this._value));
  }

  // Map pointer world coords → fraction along track. Accounts for the slider's
  // own position and uniform scale (LayoutEditor may scale it via setScale).
  _valueAtPointer(pointer) {
    const sx = this.scaleX || 1;
    const localX = (pointer.x - this.x) / sx;
    const halfW = this.trackW / 2;
    const t = (localX + halfW) / this.trackW;
    return this._quantize(this._clamp(t));
  }

  _setValueFromPointer(pointer) {
    const v = this._valueAtPointer(pointer);
    if (v === this._value) return;
    this._value = v;
    this._refresh();
    this.onChange?.(v);
  }

  _setupInteraction() {
    this.hitZone.on('pointerdown', (pointer) => {
      this._dragging = true;
      this._setValueFromPointer(pointer);
    });

    // Drag tracking on the scene input so pointer can leave the track and
    // still drag the knob (mirrors native slider behavior).
    this._onMove = (pointer) => {
      if (!this._dragging) return;
      this._setValueFromPointer(pointer);
    };
    this._onUp = () => { this._dragging = false; };

    this.scene.input.on('pointermove', this._onMove);
    this.scene.input.on('pointerup', this._onUp);
    this.scene.input.on('pointerupoutside', this._onUp);
  }

  setValue(v, { silent = false } = {}) {
    const next = this._quantize(this._clamp(v));
    if (next === this._value) return;
    this._value = next;
    this._refresh();
    if (!silent) this.onChange?.(next);
  }

  getValue() {
    return this._value;
  }

  destroy(fromScene) {
    if (this.scene && this.scene.input) {
      this.scene.input.off('pointermove', this._onMove);
      this.scene.input.off('pointerup', this._onUp);
      this.scene.input.off('pointerupoutside', this._onUp);
    }
    super.destroy(fromScene);
  }
}
