import { GameObjects } from 'phaser';
import { Theme } from '../ui/Theme.js';
import { SoundManager } from '../systems/SoundManager.js';

// Tiny 3D padlock. Subtle by default — low resting alpha so it doesn't fight
// the cards for attention.
//
// State visual:
//   Locked   — symmetric U shackle, both legs seated in the pad body.
//   Unlocked — asymmetric hook: right leg stays seated, LEFT leg retracts up
//              into the top bar, leaving clear space between the body top and
//              where the leg used to end. Reads as "the bit is pulled up."
// Animation:
//   Locking  — left leg slides DOWN into the pad (Cubic.easeIn), then wiggles
//              the tiniest amount to settle.
//   Unlock   — left leg retracts UP into the top bar (Sine.easeOut).

const BODY_W       = 14;
const BODY_H       = 12;
const SHACKLE_W    = 10;
const SHACKLE_H    = 10;   // top of top bar to full-leg bottom (when locked)
const SHACKLE_THK  = 2;    // metal thickness
const LEG_FULL_LEN = SHACKLE_H - SHACKLE_THK;      // 8 — seated leg length
const SHACKLE_LIFT = 5;    // how far the shackle rises when unlocked — creates
                           // visible air under the arc on the left side.
const WIGGLE_PX    = 0.6;  // "tiniest wiggle" amplitude

const REST_ALPHA_LOCKED   = 0.82;
const REST_ALPHA_UNLOCKED = 0.22;  // deliberately very transparent — subtle
const HOVER_ALPHA         = 1.0;

export class LockToggle extends GameObjects.Container {
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    scene.add.existing(this);

    this._locked    = !!opts.locked;
    this._onToggle  = opts.onToggle || null;
    this._animating = false;
    // Shackle geometry state. Two scalars drive the draw:
    //   _shackleLift — how far the top bar rises above its locked position.
    //                  0 when locked, SHACKLE_LIFT when unlocked. The right
    //                  leg stretches to stay seated in the body as it rises.
    //   _leftLegLen  — length of the LEFT leg below the top bar. 0 retracted
    //                  (unlocked J-hook), LEG_FULL_LEN fully seated (locked U).
    this._shackleLift = this._locked ? 0 : SHACKLE_LIFT;
    this._leftLegLen  = this._locked ? LEG_FULL_LEN : 0;

    // Ground shadow — ellipse under the body, anchors the object in 3D space.
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.45);
    this.shadow.fillEllipse(0, BODY_H / 2 + 2, BODY_W * 0.9, 2);
    this.add(this.shadow);

    // Shackle lives BELOW the body in draw order so the portion of the legs
    // inside the body is hidden when the body is drawn on top.
    this.shackle = scene.add.graphics();
    this._drawShackle();
    this.add(this.shackle);

    // Pad body — 3D rim / under / face / highlight / specular stack.
    this.body = scene.add.graphics();
    this._drawBody();
    this.add(this.body);

    // Keyhole — tiny dark detail on the body face.
    this.keyhole = scene.add.graphics();
    this._drawKeyhole();
    this.add(this.keyhole);

    // Hit area wraps body + shackle's maximum raised extent (+ a little slop).
    this.setSize(BODY_W + 8, BODY_H + SHACKLE_H + SHACKLE_LIFT + 6);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => this.toggle());
    this.on('pointerover', () => this._setAlpha(HOVER_ALPHA));
    this.on('pointerout',  () => this._setAlpha(this._restAlpha()));

    this.setAlpha(this._restAlpha());

    console.log(`[LockToggle] built at (${x}, ${y}) locked=${this._locked}`);
  }

  _restAlpha() {
    return this._locked ? REST_ALPHA_LOCKED : REST_ALPHA_UNLOCKED;
  }

  _setAlpha(target) {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({ targets: this, alpha: target, duration: 120 });
  }

  _drawShackle() {
    const g = this.shackle;
    g.clear();
    const halfW     = SHACKLE_W / 2;
    const lift      = this._shackleLift;
    const topBarTop = -SHACKLE_H - lift;                // rises with lift
    const legTopY   = topBarTop + SHACKLE_THK;
    const rightLen  = LEG_FULL_LEN + lift;              // stretches to stay seated
    const leftLen   = Math.max(0, this._leftLegLen);

    // ── Dark outer silhouette ──────────────────────────────────
    g.fillStyle(0x2f3541, 1);
    // Top bar — always full width, rides with the lift.
    g.fillRect(-halfW, topBarTop, SHACKLE_W, SHACKLE_THK);
    // Right leg — anchored into the body; grows as the top bar rises.
    g.fillRect(halfW - SHACKLE_THK, legTopY, SHACKLE_THK, rightLen);
    // Left leg — variable length, drawn downward from the top bar. When
    // unlocked (leftLen=0) only the top bar shows on the left, leaving clear
    // air between the underside of the bar and the pad body (the J-hook).
    if (leftLen > 0) {
      g.fillRect(-halfW, legTopY, SHACKLE_THK, leftLen);
    }

    // ── Mid metal (inset 1px so outer rim reads) ───────────────
    g.fillStyle(0x8a94a4, 1);
    g.fillRect(-halfW + 1, topBarTop + 1, SHACKLE_W - 2, SHACKLE_THK - 1);
    g.fillRect(halfW - SHACKLE_THK, legTopY, 1, rightLen - 1);
    if (leftLen > 1) {
      g.fillRect(-halfW + 1, legTopY, 1, leftLen - 1);
    }

    // ── Top highlight — sells the chromed-metal read ───────────
    g.fillStyle(0xd6dde8, 1);
    g.fillRect(-halfW + 1, topBarTop + 1, SHACKLE_W - 3, 1);
  }

  _drawBody() {
    const g = this.body;
    g.clear();
    const x = -BODY_W / 2;
    const y = -BODY_H / 2;

    // Outer dark rim.
    g.fillStyle(0x4a3820, 1);
    g.fillRect(x, y, BODY_W, BODY_H);
    // Under-shadow — 1px inset, 1px shorter at bottom to expose rim crescent.
    g.fillStyle(0x78622e, 1);
    g.fillRect(x + 1, y + 1, BODY_W - 2, BODY_H - 2);
    // Face — main body, extra bottom inset to stack the shade.
    g.fillStyle(Theme.fantasyGold, 1);
    g.fillRect(x + 1, y + 1, BODY_W - 2, BODY_H - 4);
    // Top highlight — shallow bright band near the top edge.
    g.fillStyle(Theme.fantasyGoldBright, 1);
    g.fillRect(x + 2, y + 2, BODY_W - 4, 2);
    // 1px specular streak.
    g.fillStyle(0xfff3cf, 1);
    g.fillRect(x + 3, y + 2, BODY_W - 6, 1);
  }

  _drawKeyhole() {
    const g = this.keyhole;
    g.clear();
    // Dot + thin slot — stylized keyhole.
    g.fillStyle(0x1a1208, 1);
    g.fillRect(-1, 0, 2, 2);
    g.fillRect(0,  2, 1, 2);
  }

  toggle() {
    if (this._animating) return;
    const nextLocked = !this._locked;
    this._locked    = nextLocked;
    this._animating = true;
    SoundManager.shopLock();
    console.log(`[LockToggle] toggle → ${nextLocked ? 'LOCKED' : 'UNLOCKED'}`);

    const targetLen  = nextLocked ? LEG_FULL_LEN : 0;
    const targetLift = nextLocked ? 0 : SHACKLE_LIFT;
    // Proxy object so the alpha tween (on `this`) and the shackle tween coexist.
    const proxy = { len: this._leftLegLen, lift: this._shackleLift };
    this.scene.tweens.add({
      targets: proxy,
      len:  targetLen,
      lift: targetLift,
      duration: nextLocked ? 150 : 170,
      ease: nextLocked ? 'Cubic.easeIn' : 'Sine.easeOut',
      onUpdate: () => {
        this._leftLegLen  = proxy.len;
        this._shackleLift = proxy.lift;
        this._drawShackle();
      },
      onComplete: () => {
        this._leftLegLen  = targetLen;
        this._shackleLift = targetLift;
        this._drawShackle();
        if (nextLocked) this._wiggle();
        else this._animating = false;
      },
    });

    // Rest alpha settles to the new state (cursor-out path re-applies this).
    this._setAlpha(this._restAlpha());

    if (this._onToggle) {
      try { this._onToggle(nextLocked); }
      catch (e) { console.error('[LockToggle] onToggle handler failed:', e); }
    }
  }

  _wiggle() {
    // Two tiny oscillations — deliberately sub-pixel so it reads as settle,
    // not jitter. Snap back to 0 on completion to clear sub-pixel drift.
    this.scene.tweens.add({
      targets: this.shackle,
      x: { from: -WIGGLE_PX, to: WIGGLE_PX },
      duration: 45,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.shackle.x = 0;
        this._animating = false;
      },
    });
  }

  setLocked(locked, { animate = false } = {}) {
    const want = !!locked;
    if (want === this._locked) return;
    if (animate) {
      this.toggle();
    } else {
      this._locked = want;
      this._leftLegLen  = want ? LEG_FULL_LEN : 0;
      this._shackleLift = want ? 0 : SHACKLE_LIFT;
      this._drawShackle();
      this.setAlpha(this._restAlpha());
    }
  }

  get locked() { return this._locked; }
}
