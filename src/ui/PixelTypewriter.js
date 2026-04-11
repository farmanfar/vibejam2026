import { GameObjects } from 'phaser';
import { FONT_KEY, PixelFont } from './PixelFont.js';

/**
 * Typing terminal effect ported from TorchWars MainMenuScreen.
 * Cycles through messages with per-character delays, blinking cursor, and CRT flicker.
 */
export class PixelTypewriter extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} opts
   * @param {string[]} opts.messages - Pool of messages to cycle through
   * @param {number} [opts.scale=2] - Font scale
   * @param {number} [opts.tint=0xB49669] - Text color (warm tan)
   * @param {number} [opts.maxWidth=360] - Max pixel width for text
   * @param {number} [opts.idleTime=10] - Seconds idle before deleting
   * @param {number} [opts.cursorBlinkRate=0.45] - Cursor blink interval
   */
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);

    this._scale = opts.scale ?? 2;
    this._tint = opts.tint ?? 0xB49669;
    this._maxWidth = opts.maxWidth ?? 360;
    this._idleTime = opts.idleTime ?? 10;
    this._cursorBlinkRate = opts.cursorBlinkRate ?? 0.45;

    this._messages = opts.messages || ['...'];
    this._messageIndex = 0;

    // Typing state
    this._fullText = '';
    this._charsShown = 0;
    this._charDelays = [];
    this._charTimer = 0;
    this._typingDone = false;
    this._deleting = false;
    this._deleteTimer = 0;
    this._idleTimer = 0;

    // Cursor blink
    this._cursorTimer = 0;
    this._cursorVisible = true;

    // CRT flicker
    this._flicker = 1.0;
    this._flickerTimer = 0;

    // Build display objects
    const fontSize = 7 * this._scale;
    this._textObj = scene.add.bitmapText(0, 0, FONT_KEY, '', fontSize)
      .setTint(this._tint);
    this.add(this._textObj);

    // Cursor block (width = one glyph cell, height = glyph height)
    const cursorW = PixelFont.CELL_W * this._scale;
    const cursorH = PixelFont.GLYPH_H * this._scale;
    this._cursor = scene.add.rectangle(0, 0, cursorW, cursorH, this._tint)
      .setOrigin(0, 0);
    this.add(this._cursor);

    scene.add.existing(this);

    // Start first message
    this._startMessage(this._messages[0]);

    // Bind update
    this._updateHandler = (_time, delta) => this._update(delta / 1000);
    scene.events.on('update', this._updateHandler);
  }

  /** Replace the message pool and restart typing. */
  setMessages(messages) {
    this._messages = messages || ['...'];
    this._messageIndex = 0;
    this._startMessage(this._messages[0]);
  }

  /** Start typing a new message. */
  _startMessage(text) {
    // Truncate to max width
    const maxChars = Math.floor(this._maxWidth / (PixelFont.CELL_W * this._scale));
    this._fullText = text.length > maxChars ? text.substring(0, maxChars) : text;
    this._charsShown = 0;
    this._typingDone = false;
    this._deleting = false;
    this._idleTimer = 0;
    this._charTimer = 0.3; // initial delay before first char

    // Generate per-character delays
    this._charDelays = [];
    for (let i = 0; i < this._fullText.length; i++) {
      this._charDelays.push(this._computeCharDelay(this._fullText[i]));
    }

    this._textObj.setText('');
    console.log(`[Typewriter] Typing: "${this._fullText}"`);
  }

  /** Per-character delay (from TorchWars StartTypingMessage). */
  _computeCharDelay(ch) {
    let delay;
    if (ch === ' ') {
      delay = 0.04 + Math.random() * 0.06;
    } else if (',?!.'.includes(ch)) {
      delay = 0.12 + Math.random() * 0.10;
    } else {
      delay = 0.05 + Math.random() * 0.07;
    }
    // 8% stutter chance
    if (Math.random() < 0.08) {
      delay += 0.08 + Math.random() * 0.12;
    }
    return delay;
  }

  _update(dt) {
    // CRT flicker
    this._flickerTimer += dt;
    if (this._flickerTimer >= 0.05) {
      this._flickerTimer = 0;
      if (Math.random() < 0.06) {
        this._flicker = 0.4 + Math.random() * 0.3;
      } else {
        this._flicker = 1.0;
      }
    }
    this._textObj.setAlpha(this._flicker);
    this._cursor.setAlpha(this._cursorVisible ? this._flicker : 0);

    // Cursor blink
    this._cursorTimer += dt;
    if (this._cursorTimer >= this._cursorBlinkRate) {
      this._cursorTimer = 0;
      this._cursorVisible = !this._cursorVisible;
    }

    if (this._deleting) {
      // Delete char-by-char
      this._deleteTimer += dt;
      const deleteSpeed = 0.03 + Math.random() * 0.02;
      if (this._deleteTimer >= deleteSpeed) {
        this._deleteTimer = 0;
        this._charsShown--;
        if (this._charsShown <= 0) {
          this._charsShown = 0;
          // Advance to next message
          this._messageIndex = (this._messageIndex + 1) % this._messages.length;
          this._startMessage(this._messages[this._messageIndex]);
        }
      }
    } else if (!this._typingDone) {
      // Type char-by-char
      this._charTimer -= dt;
      if (this._charTimer <= 0 && this._charsShown < this._fullText.length) {
        this._charsShown++;
        if (this._charsShown < this._fullText.length) {
          this._charTimer = this._charDelays[this._charsShown];
        } else {
          this._typingDone = true;
          this._idleTimer = 0;
        }
      }
    } else {
      // Idle — wait then start deleting
      this._idleTimer += dt;
      if (this._idleTimer >= this._idleTime) {
        this._deleting = true;
        this._deleteTimer = 0;
      }
    }

    // Update visible text
    this._textObj.setText(this._fullText.substring(0, this._charsShown));

    // Position cursor at end of visible text
    this._cursor.setPosition(this._textObj.width, 0);
  }

  destroy() {
    if (this.scene) {
      this.scene.events.off('update', this._updateHandler);
    }
    super.destroy();
  }
}
