import { GameObjects } from 'phaser';
import { Theme } from './Theme.js';
import { FONT_KEY, PixelFont } from './PixelFont.js';

/**
 * Text input field ported from TorchWars PixelTextInput.
 * Full keyboard input with caret, selection, confirm flash.
 */
export class PixelTextInput extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {number} [opts.width=280] - Field width
   * @param {number} [opts.height=28] - Field height
   * @param {number} [opts.scale=2] - Font scale
   * @param {number} [opts.maxLength=16] - Max characters
   * @param {Function} [opts.charFilter] - (char) => boolean
   * @param {string} [opts.hintText=''] - Placeholder text
   * @param {string} [opts.text=''] - Initial value
   * @param {Function} [opts.onSubmit] - Called on Enter
   * @param {Function} [opts.onChange] - Called on text change
   */
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);

    this._width = opts.width ?? 280;
    this._height = opts.height ?? 28;
    this._fontScale = opts.scale ?? 2;
    this._maxLength = opts.maxLength ?? 16;
    this._charFilter = opts.charFilter ?? PixelTextInput.defaultCharFilter;
    this._hintText = opts.hintText ?? '';
    this._onSubmit = opts.onSubmit ?? null;
    this._onChange = opts.onChange ?? null;

    // State
    this._text = opts.text ?? '';
    this._caretIndex = this._text.length;
    this._selStart = -1; // -1 = no selection
    this._selEnd = -1;
    this._focused = false;
    this._cursorTimer = 0;
    this._cursorVisible = true;
    this._confirmTimer = 0;

    // Computed sizes
    this._fontSize = 7 * this._fontScale;
    this._charW = PixelFont.CELL_W * (PixelFont.GLYPH_H * this._fontScale) / PixelFont.CELL_H;
    this._charH = PixelFont.GLYPH_H * this._fontScale;
    this._padX = 6;
    this._padY = Math.floor((this._height - this._charH) / 2);

    // Visual elements
    this._bgRect = scene.add.rectangle(0, 0, this._width, this._height, 0x1e2330)
      .setOrigin(0, 0);
    this.add(this._bgRect);

    this._borderGfx = scene.add.graphics();
    this._drawBorder(Theme.panelBorder);
    this.add(this._borderGfx);

    // Selection highlight
    this._selRect = scene.add.rectangle(this._padX, this._padY, 0, this._charH, Theme.focusBand, 0.5)
      .setOrigin(0, 0).setVisible(false);
    this.add(this._selRect);

    // Text display
    this._textObj = scene.add.bitmapText(this._padX, this._padY, FONT_KEY, '', this._fontSize)
      .setTint(Theme.criticalText);
    this.add(this._textObj);

    // Hint text
    this._hintObj = scene.add.bitmapText(this._padX, this._padY, FONT_KEY, this._hintText, this._fontSize)
      .setTint(Theme.ambientText);
    this.add(this._hintObj);

    // Cursor bar
    this._cursorBar = scene.add.rectangle(
      this._padX, this._padY, this._fontScale, this._charH, Theme.criticalText
    ).setOrigin(0, 0).setVisible(false);
    this.add(this._cursorBar);

    // Hit zone for click-to-focus
    this._hitZone = scene.add.rectangle(0, 0, this._width, this._height, 0x000000, 0)
      .setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.add(this._hitZone);

    this._hitZone.on('pointerdown', (pointer) => {
      this.focus();
      // Place caret at click position
      const localX = pointer.x - this.x - this._padX;
      this._caretIndex = Math.min(
        this._text.length,
        Math.max(0, Math.round(localX / this._charW))
      );
      this._clearSelection();
      this._resetCursorBlink();
    });

    // Click-outside to blur
    this._scenePointerHandler = (pointer) => {
      if (!this._focused) return;
      const localX = pointer.x - this.x;
      const localY = pointer.y - this.y;
      if (localX < 0 || localX > this._width || localY < 0 || localY > this._height) {
        this.blur();
      }
    };
    scene.input.on('pointerdown', this._scenePointerHandler);

    // Keyboard handler (added/removed on focus/blur)
    this._keyHandler = (e) => this._onKeyDown(e);

    // Update loop for cursor blink + confirm flash
    this._updateHandler = (_time, delta) => this._update(delta / 1000);
    scene.events.on('update', this._updateHandler);

    scene.add.existing(this);
    this._refresh();
  }

  /** Default filter: letters, digits, space, hyphen, underscore. */
  static defaultCharFilter(ch) {
    return /^[a-zA-Z0-9 \-_]$/.test(ch);
  }

  getText() { return this._text; }

  setText(value) {
    this._text = (value || '').substring(0, this._maxLength);
    this._caretIndex = this._text.length;
    this._clearSelection();
    this._refresh();
  }

  focus() {
    if (this._focused) return;
    this._focused = true;
    this._resetCursorBlink();
    window.addEventListener('keydown', this._keyHandler);
    this._drawBorder(Theme.accent);
    console.log('[TextInput] Focused');
  }

  blur() {
    if (!this._focused) return;
    this._focused = false;
    this._cursorVisible = false;
    window.removeEventListener('keydown', this._keyHandler);
    this._drawBorder(this._confirmTimer > 0 ? 0x50C878 : Theme.panelBorder);
    this._clearSelection();
    this._refresh();
    console.log('[TextInput] Blurred');
  }

  flashConfirm() {
    this._confirmTimer = 0.6;
    this._drawBorder(0x50C878);
  }

  _drawBorder(color) {
    this._borderGfx.clear();
    this._borderGfx.lineStyle(2, color, 1);
    this._borderGfx.strokeRect(0, 0, this._width, this._height);
  }

  _clearSelection() {
    this._selStart = -1;
    this._selEnd = -1;
    this._selRect.setVisible(false);
  }

  _hasSelection() {
    return this._selStart >= 0 && this._selStart !== this._selEnd;
  }

  _getSelectionRange() {
    const lo = Math.min(this._selStart, this._selEnd);
    const hi = Math.max(this._selStart, this._selEnd);
    return { lo, hi };
  }

  _deleteSelection() {
    if (!this._hasSelection()) return false;
    const { lo, hi } = this._getSelectionRange();
    this._text = this._text.substring(0, lo) + this._text.substring(hi);
    this._caretIndex = lo;
    this._clearSelection();
    return true;
  }

  _resetCursorBlink() {
    this._cursorTimer = 0;
    this._cursorVisible = true;
  }

  _onKeyDown(e) {
    if (!this._focused) return;

    // Prevent browser defaults for keys we handle
    const handled = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight',
      'Home', 'End', 'Enter', 'Escape', 'Tab'].includes(e.key)
      || (e.ctrlKey && e.key === 'a');
    if (handled) e.preventDefault();

    const shift = e.shiftKey;

    if (e.key === 'Escape') {
      this.blur();
      return;
    }

    if (e.key === 'Enter') {
      if (this._onSubmit) {
        this._onSubmit(this._text);
        this.flashConfirm();
      }
      return;
    }

    if (e.ctrlKey && e.key === 'a') {
      this._selStart = 0;
      this._selEnd = this._text.length;
      this._caretIndex = this._text.length;
      this._refresh();
      return;
    }

    if (e.key === 'Backspace') {
      if (this._deleteSelection()) {
        this._onChange?.(this._text);
        this._refresh();
        return;
      }
      if (this._caretIndex > 0) {
        this._text = this._text.substring(0, this._caretIndex - 1) + this._text.substring(this._caretIndex);
        this._caretIndex--;
        this._onChange?.(this._text);
      }
      this._refresh();
      return;
    }

    if (e.key === 'Delete') {
      if (this._deleteSelection()) {
        this._onChange?.(this._text);
        this._refresh();
        return;
      }
      if (this._caretIndex < this._text.length) {
        this._text = this._text.substring(0, this._caretIndex) + this._text.substring(this._caretIndex + 1);
        this._onChange?.(this._text);
      }
      this._refresh();
      return;
    }

    if (e.key === 'ArrowLeft') {
      if (shift) {
        if (this._selStart < 0) this._selStart = this._caretIndex;
        this._caretIndex = Math.max(0, this._caretIndex - 1);
        this._selEnd = this._caretIndex;
      } else {
        if (this._hasSelection()) {
          this._caretIndex = this._getSelectionRange().lo;
        } else {
          this._caretIndex = Math.max(0, this._caretIndex - 1);
        }
        this._clearSelection();
      }
      this._resetCursorBlink();
      this._refresh();
      return;
    }

    if (e.key === 'ArrowRight') {
      if (shift) {
        if (this._selStart < 0) this._selStart = this._caretIndex;
        this._caretIndex = Math.min(this._text.length, this._caretIndex + 1);
        this._selEnd = this._caretIndex;
      } else {
        if (this._hasSelection()) {
          this._caretIndex = this._getSelectionRange().hi;
        } else {
          this._caretIndex = Math.min(this._text.length, this._caretIndex + 1);
        }
        this._clearSelection();
      }
      this._resetCursorBlink();
      this._refresh();
      return;
    }

    if (e.key === 'Home') {
      if (shift) {
        if (this._selStart < 0) this._selStart = this._caretIndex;
        this._selEnd = 0;
      } else {
        this._clearSelection();
      }
      this._caretIndex = 0;
      this._resetCursorBlink();
      this._refresh();
      return;
    }

    if (e.key === 'End') {
      if (shift) {
        if (this._selStart < 0) this._selStart = this._caretIndex;
        this._selEnd = this._text.length;
      } else {
        this._clearSelection();
      }
      this._caretIndex = this._text.length;
      this._resetCursorBlink();
      this._refresh();
      return;
    }

    // Printable character insertion
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const ch = e.key;
      if (!this._charFilter(ch)) return;

      this._deleteSelection(); // Remove selection before inserting
      if (this._text.length >= this._maxLength) return;

      this._text = this._text.substring(0, this._caretIndex) + ch + this._text.substring(this._caretIndex);
      this._caretIndex++;
      this._resetCursorBlink();
      this._onChange?.(this._text);
      this._refresh();
    }
  }

  _update(dt) {
    // Confirm flash countdown
    if (this._confirmTimer > 0) {
      this._confirmTimer -= dt;
      if (this._confirmTimer <= 0) {
        this._confirmTimer = 0;
        this._drawBorder(this._focused ? Theme.accent : Theme.panelBorder);
      }
    }

    // Cursor blink
    if (this._focused) {
      this._cursorTimer += dt;
      if (this._cursorTimer >= 0.35) {
        this._cursorTimer = 0;
        this._cursorVisible = !this._cursorVisible;
      }
      this._cursorBar.setVisible(this._cursorVisible);
    } else {
      this._cursorBar.setVisible(false);
    }
  }

  _refresh() {
    // Show text or hint
    if (this._text.length > 0) {
      this._textObj.setText(this._text).setVisible(true);
      this._hintObj.setVisible(false);
    } else {
      this._textObj.setText('').setVisible(false);
      this._hintObj.setVisible(!this._focused || this._hintText.length === 0 ? true : true);
    }

    // Cursor position
    const cursorX = this._padX + this._caretIndex * this._charW;
    this._cursorBar.setPosition(cursorX, this._padY);

    // Selection highlight
    if (this._hasSelection()) {
      const { lo, hi } = this._getSelectionRange();
      const selX = this._padX + lo * this._charW;
      const selW = (hi - lo) * this._charW;
      this._selRect.setPosition(selX, this._padY);
      this._selRect.setSize(selW, this._charH);
      this._selRect.setVisible(true);
    } else {
      this._selRect.setVisible(false);
    }
  }

  destroy() {
    window.removeEventListener('keydown', this._keyHandler);
    if (this.scene) {
      this.scene.input.off('pointerdown', this._scenePointerHandler);
      this.scene.events.off('update', this._updateHandler);
    }
    super.destroy();
  }
}
