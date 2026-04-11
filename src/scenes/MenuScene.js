import { Scene } from 'phaser';
import { Theme, FONT_KEY, PixelButton, PixelLabel, PixelTypewriter, PixelTextInput } from '../ui/index.js';
import { PlayerConfig } from '../systems/PlayerConfig.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';
import { getUnitValidation } from '../config/warriors.js';

// --- Typewriter message pools ---

function buildNamedMessages(name) {
  return [
    `welcome back, ${name}`,
    `ready for battle, ${name}?`,
    `the swords await, ${name}`,
    `fortune favors you, ${name}`,
    `choose wisely, ${name}`,
    `the merchant greets you, ${name}`,
    `may your blades stay sharp, ${name}`,
    `good to see you, ${name}`,
    `feeling lucky, ${name}?`,
    `the arena calls, ${name}`,
    `steel yourself, ${name}`,
    `let's do this, ${name}`,
    `watch your gold, ${name}`,
    `another run, ${name}?`,
    `back for more, ${name}?`,
    `sup ${name}`,
  ];
}

const UNNAMED_MESSAGES = [
  'enter your name, friend',
  'who goes there?',
  'every hero needs a name',
  'name yourself, warrior',
  'what should I call you?',
  'the nameless wonder arrives',
  'even the skeleton has a name',
  'no name no fame',
  'hello? who is this?',
  'player 1 needs a name',
  'names are free, grab one',
  'be somebody. set a name',
  'psst... set a name already',
  'every legend starts with a name',
  "I'll wait... for your name",
  'heroes have names, just saying',
];

export class MenuScene extends Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.cameras.main;
    const savedName = PlayerConfig.getName();
    const validation = getUnitValidation();
    const readyArtCount = validation.summary.readyArtCount;
    const totalUnits = validation.summary.total;

    console.log(`[Menu] Creating menu scene (${width}x${height}), saved name: "${savedName || '(none)'}"`);

    // --- Full-width header ---

    // Title: centered, scale 4
    const title = new PixelLabel(this, width / 2, 24, 'THE HIRED SWORDS', {
      scale: 4, color: 'accent', align: 'center',
    });
    LayoutEditor.register(this, 'title', title, width / 2, 24);

    // Subtitle: centered, scale 2
    const subtitle = new PixelLabel(this, width / 2, 60, 'An Auto-Battler Roguelike', {
      scale: 2, color: 'muted', align: 'center',
    });
    LayoutEditor.register(this, 'subtitle', subtitle, width / 2, 60);

    // Decorative divider
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, Theme.panelBorder, 0.6);
    divGfx.lineBetween(width * 0.15, 82, width * 0.85, 82);
    this.add.bitmapText(width / 2, 82 - 5, FONT_KEY, '*', 14)
      .setOrigin(0.5).setTint(Theme.accentDim);

    // --- Left column (x: 32) ---
    const leftX = 32;

    // Typewriter text
    const messages = savedName ? buildNamedMessages(savedName) : UNNAMED_MESSAGES;
    this._typewriter = new PixelTypewriter(this, leftX, 100, {
      messages,
      scale: 2,
      tint: 0xB49669,
      maxWidth: 360,
    });
    LayoutEditor.register(this, 'typewriter', this._typewriter, leftX, 100);

    // Name label
    const nameLabel = new PixelLabel(this, leftX, 142, 'YOUR NAME:', {
      scale: 2, color: 'muted',
    });
    LayoutEditor.register(this, 'nameLabel', nameLabel, leftX, 142);

    // Name text input
    this._nameInput = new PixelTextInput(this, leftX, 162, {
      width: 280,
      height: 28,
      scale: 2,
      maxLength: 16,
      hintText: 'type here...',
      text: savedName,
      onSubmit: (text) => {
        PlayerConfig.setName(text);
        const name = PlayerConfig.getName();
        // Switch typewriter messages
        if (name) {
          this._typewriter.setMessages(buildNamedMessages(name));
        } else {
          this._typewriter.setMessages(UNNAMED_MESSAGES);
        }
        this._nameInput.blur();
      },
    });

    // --- Menu buttons (text style) ---
    const menuX = leftX;
    const menuStartY = 210;
    const menuSpacing = 36;

    const startBtn = new PixelButton(this, menuX, menuStartY, 'START GAME', () => {
      const runId = crypto.randomUUID();
      console.log(`[Menu] Starting new run: ${runId}`);
      this.scene.start('Shop', { stage: 1, gold: 10, wins: 0, losses: 0, team: [], runId });
    }, { style: 'text', scale: 3 });
    LayoutEditor.register(this, 'startBtn', startBtn, menuX, menuStartY);

    const hofBtn = new PixelButton(this, menuX, menuStartY + menuSpacing, 'HALL OF FAME', () => {
      console.log('[Menu] Opening Hall of Fame');
      this.scene.start('HallOfFame');
    }, { style: 'text', scale: 3 });
    LayoutEditor.register(this, 'hofBtn', hofBtn, menuX, menuStartY + menuSpacing);

    const settingsBtn = new PixelButton(this, menuX, menuStartY + menuSpacing * 2, 'SETTINGS', () => {
      console.log('[Menu] Opening Settings');
      this.scene.start('Settings');
    }, { style: 'text', scale: 3 });
    LayoutEditor.register(this, 'settingsBtn', settingsBtn, menuX, menuStartY + menuSpacing * 2);

    const unitLabBtn = new PixelButton(this, menuX, menuStartY + menuSpacing * 3, 'UNIT LAB', () => {
      console.log('[Menu] Opening Unit Lab');
      this.scene.start('UnitLab');
    }, { style: 'text', scale: 3 });
    LayoutEditor.register(this, 'unitLabBtn', unitLabBtn, menuX, menuStartY + menuSpacing * 3);

    const rosterStatus = new PixelLabel(this, leftX, menuStartY + menuSpacing * 4 + 12, `ART READY: ${readyArtCount}/${totalUnits}`, {
      scale: 2,
      color: readyArtCount > 0 ? 'accent' : 'warning',
    });
    LayoutEditor.register(this, 'rosterStatus', rosterStatus, leftX, menuStartY + menuSpacing * 4 + 12);

    // --- Credits footer ---
    const vibeJam = new PixelLabel(this, leftX, height - 36, 'VibeJam2026 Entry by Farman.Farout', {
      scale: 2, color: 'muted',
    });
    LayoutEditor.register(this, 'vibeJam', vibeJam, leftX, height - 36);

    const credits = new PixelLabel(this, leftX, height - 18, 'Art: PENUSBMIC  |  Code: 100% AI', {
      scale: 1, color: 'ambient',
    });
    LayoutEditor.register(this, 'credits', credits, leftX, height - 18);

    // --- Right column: Merchant ---
    const merchantKey = this.textures.exists('merchant') ? 'merchant' : 'merchant_placeholder';
    console.log(`[Menu] Using merchant texture: ${merchantKey}`);

    const merchantX = 710;
    const merchantY = 292;
    const merchantScale = 3;

    this._merchant = this.add.image(merchantX, merchantY, merchantKey)
      .setScale(merchantScale);
    LayoutEditor.register(this, 'merchant', this._merchant, merchantX, merchantY);

    // Idle breathing bob
    this.tweens.add({
      targets: this._merchant,
      y: merchantY - 2,
      duration: 2000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Subtle scale pulse (breathing)
    this.tweens.add({
      targets: this._merchant,
      scaleX: merchantScale * 1.015,
      scaleY: merchantScale * 1.015,
      duration: 3000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // Merchant reflection (flipped, low alpha)
    const reflectionY = merchantY + this._merchant.displayHeight * 0.5 + 4;
    this._reflection = this.add.image(merchantX, reflectionY, merchantKey)
      .setScale(merchantScale)
      .setFlipY(true)
      .setAlpha(0.075);

    // Keep reflection synced with merchant bob
    this.tweens.add({
      targets: this._reflection,
      y: reflectionY - 2,
      duration: 2000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    // --- Scanlines (on top of everything) ---
    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.06);
    }

    // --- Cleanup on scene shutdown (once, not on) ---
    this.events.once('shutdown', () => {
      console.log('[Menu] Shutdown — cleaning up listeners');
      LayoutEditor.unregisterScene('Menu');
      if (this._typewriter) this._typewriter.destroy();
      if (this._nameInput) this._nameInput.destroy();
    });

    console.log('[Menu] Scene created successfully');
  }
}
