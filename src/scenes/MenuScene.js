import { Scene } from 'phaser';
import { Theme, FONT_KEY, PixelLabel, PixelList, PixelTypewriter, PixelTextInput } from '../ui/index.js';
import { PortalTooltip } from '../widgets/PortalTooltip.js';
import { PlayerConfig } from '../systems/PlayerConfig.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';
import { pickRandomMerchants, getMerchantIdleAnimKey } from '../config/merchants.js';
import { SceneCrt } from '../rendering/SceneCrt.js';
import { SceneDust } from '../rendering/SceneDust.js';
import { AchievementToast } from '../widgets/AchievementToast.js';

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

    console.log(`[Menu] Creating menu scene (${width}x${height}), saved name: "${savedName || '(none)'}"`);

    // One-time migration: the 4 PixelButton rows were replaced by a single
    // PixelList, so the old per-button layout keys are orphaned. Clear them
    // and the typewriter override (its default y moved) once per browser.
    try {
      const RESET_FLAG = 'hired_swords_menu_list_migration_v2';
      if (typeof localStorage !== 'undefined' && !localStorage.getItem(RESET_FLAG)) {
        [
          'layout_Menu.startBtn',
          'layout_Menu.hofBtn',
          'layout_Menu.settingsBtn',
          'layout_Menu.rulesBtn',
          'layout_Menu.typewriter',
        ].forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(RESET_FLAG, '1');
        console.log('[Menu] Cleared stale per-button layout overrides (list migration v2)');
      }
    } catch (e) {
      console.error('[Menu] list migration reset failed:', e);
    }

    // CRT post-process (strongUi preset — stronger curvature/scanlines for menus)
    SceneCrt.attach(this, 'strongUi');
    // Ambient dust — warm amber motes drifting in a sunbeam
    SceneDust.attach(this, 'menu');

    // --- Full-width header ---

    // Title: centered, scale 4
    const title = new PixelLabel(this, width / 2, 8, 'THE HIRED SWORDS', {
      scale: 4, color: 'accent', align: 'center',
    });
    LayoutEditor.register(this, 'title', title, width / 2, 8);

    // Subtitle: centered, scale 2
    const subtitle = new PixelLabel(this, width / 2, 50, 'An Auto-Battler Roguelike', {
      scale: 2, color: 'muted', align: 'center',
    });
    LayoutEditor.register(this, 'subtitle', subtitle, width / 2, 50);

    // Decorative divider — sits below the title+subtitle block
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, Theme.panelBorder, 0.6);
    divGfx.lineBetween(width * 0.15, 92, width * 0.85, 92);
    this.add.bitmapText(width / 2, 92 - 5, FONT_KEY, '*', 14)
      .setOrigin(0.5).setTint(Theme.accentDim);

    // --- Left column (x: 32) ---
    const leftX = 32;

    // Typewriter text
    const messages = savedName ? buildNamedMessages(savedName) : UNNAMED_MESSAGES;
    const typewriterX = 36;
    const typewriterY = 355;
    this._typewriter = new PixelTypewriter(this, typewriterX, typewriterY, {
      messages,
      scale: 2,
      tint: 0xB49669,
      maxWidth: 360,
    });
    LayoutEditor.register(this, 'typewriter', this._typewriter, typewriterX, typewriterY);

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

    // --- Menu list (single PixelList = uniform scale for every row) ---
    const menuX = leftX;
    const menuStartY = 210;

    const menuList = new PixelList(this, menuX, menuStartY, [
      {
        label: 'START GAME',
        scale: 3,
        onClick: () => {
          const runId = crypto.randomUUID();
          console.log(`[Menu] Starting new run mode select: ${runId}`);
          if (this._portalTooltip?.visible) this._portalTooltip.hide();
          if (this._portalDismissTimer) { this._portalDismissTimer.remove(false); this._portalDismissTimer = null; }
          this.scene.start('ModeSelect', { runId });
        },
      },
      {
        label: 'HALL OF FAME',
        scale: 2,
        onClick: () => {
          console.log('[Menu] Opening Hall of Fame');
          this.scene.start('HallOfFame');
        },
      },
      {
        label: 'SETTINGS',
        scale: 2,
        onClick: () => {
          console.log('[Menu] Opening Settings');
          this.scene.start('Settings');
        },
      },
      {
        label: 'FACTION & CLASS RULES',
        scale: 2,
        onClick: () => {
          console.log('[Menu] Opening Rules');
          this.scene.start('Rules');
        },
      },
      {
        label: 'ACHIEVEMENTS',
        scale: 2,
        onClick: () => {
          console.log('[Menu] Opening Achievements');
          this.scene.start('Achievements');
        },
      },
    ], { scale: 2, itemPadding: 6 });
    LayoutEditor.register(this, 'menuList', menuList, menuX, menuStartY);

    // --- Portal arrival welcome banner (fires once per portal session) ---
    const isPortalArrival = this.registry.get('portalArrival') === true;
    const alreadyWelcomed = this.registry.get('portalWelcomeShown') === true;
    const portalText = 'WELCOME PORTAL TRAVELER! CLICK START GAME!';
    this._portalTooltip = new PortalTooltip(
      this,
      PortalTooltip.centeredX(this, width / 2, portalText),
      102,
      portalText,
      'portalWelcome',
    );
    if (isPortalArrival && !alreadyWelcomed) {
      console.log('[Portal] Portal arrival detected — scheduling welcome banner');
      this._portalShowTimer = this.time.delayedCall(800, () => {
        this._portalShowTimer = null;
        this.registry.set('portalWelcomeShown', true);
        this._portalTooltip.show();
        this._portalDismissTimer = this.time.delayedCall(4000, () => {
          this._portalDismissTimer = null;
          this._portalTooltip.hide();
        });
      });
    }

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
    // Pick a random animated merchant from the catalog each menu visit.
    // Composition mirrors TorchWars MainMenuScreen: single idle-looping NPC
    // with a vertical-flip reflection at 7.5% alpha underneath. Motion comes
    // entirely from the Aseprite idle frames — no bob/breathing tweens.
    const merchantX = 692;
    const merchantY = 382;
    const merchantScale = 5.84;

    const merchant = pickRandomMerchants(1)[0];
    const hasAnimatedMerchant = merchant && this.textures.exists(merchant.spriteKey);

    if (hasAnimatedMerchant) {
      this._merchant = this.add.sprite(merchantX, merchantY, merchant.spriteKey).setScale(merchantScale);
      const animKey = getMerchantIdleAnimKey(merchant);
      try {
        this._merchant.play(animKey);
        console.log(`[Menu] Merchant: ${merchant.name} playing '${animKey}'`);
      } catch (e) {
        console.error(`[Menu] sprite.play('${animKey}') failed for ${merchant.id}:`, e);
      }
    } else {
      const fallbackKey = this.textures.exists('merchant') ? 'merchant' : 'merchant_placeholder';
      this._merchant = this.add.image(merchantX, merchantY, fallbackKey).setScale(merchantScale);
      console.log(`[Menu] Merchant: no catalog pick available, using placeholder '${fallbackKey}'`);
    }
    // Render merchant beneath menu text (default depth 0). Text/UI overlays him.
    this._merchant.setDepth(-1);
    LayoutEditor.register(this, 'merchant', this._merchant, merchantX, merchantY);

    // Merchant reflection (flipped, low alpha). A second sprite playing the
    // same animation stays frame-synced automatically — no tween needed.
    const reflectionY = merchantY + this._merchant.displayHeight * 0.5 + 4;
    if (hasAnimatedMerchant) {
      this._reflection = this.add.sprite(merchantX, reflectionY, merchant.spriteKey)
        .setScale(merchantScale)
        .setFlipY(true)
        .setAlpha(0.075);
      try {
        this._reflection.play(getMerchantIdleAnimKey(merchant));
      } catch (e) {
        console.error(`[Menu] reflection play failed for ${merchant.id}:`, e);
      }
    } else {
      this._reflection = this.add.image(merchantX, reflectionY, this._merchant.texture.key)
        .setScale(merchantScale)
        .setFlipY(true)
        .setAlpha(0.075);
    }
    this._reflection.setDepth(-1);

    // --- Cleanup on scene shutdown (once, not on) ---
    this.events.once('shutdown', () => {
      console.log('[Menu] Shutdown — cleaning up listeners');
      LayoutEditor.unregisterScene('Menu');
      if (this._typewriter) this._typewriter.destroy();
      if (this._nameInput) this._nameInput.destroy();
      if (this._portalShowTimer) { this._portalShowTimer.remove(false); this._portalShowTimer = null; }
      if (this._portalDismissTimer) { this._portalDismissTimer.remove(false); this._portalDismissTimer = null; }
      if (this._portalTooltip) { this._portalTooltip.destroy(); this._portalTooltip = null; }
    });

    AchievementToast.flushPending(this);
    console.log('[Menu] Scene created successfully');
    finalizeCaptureScene('Menu');

    // Hide the HTML instant shell after the first rendered Phaser frame.
    this.game.events.once('postrender', () => {
      const shell = document.getElementById('instant-shell');
      if (shell) {
        shell.classList.add('hidden');
        setTimeout(() => shell.remove(), 200);
      }
      window.__menuReady = true;
      console.log('[Menu] First render complete, shell hidden');
    });
  }
}
