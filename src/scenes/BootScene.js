import { Scene } from 'phaser';
import { PixelFont } from '../ui/PixelFont.js';
import { Theme } from '../ui/Theme.js';
import { initAuth } from '../supabase.js';
import { AchievementManager } from '../systems/AchievementManager.js';
import { getCommanders } from '../config/commanders.js';
import { getMerchants } from '../config/merchants.js';
import { resetCaptureReady, resolveCaptureRoute } from '../systems/CaptureSupport.js';
import { PixelSounds } from '../systems/PixelSounds.js';

export class BootScene extends Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // PixelFont is pure canvas, so keep it available before any scene renders.
    PixelFont.init(this);

    this.load.on('loaderror', (file) => {
      if (typeof file.key === 'string' && file.key.startsWith('unit-portrait-')) {
        console.warn(`[Boot] Failed to load unit portrait ${file.key} from ${file.src}`);
      }
    });

    // Commander sprites are shared by Shop, Battle, and CommanderSelect.
    const commanders = getCommanders();
    for (const cmd of commanders) {
      this.load.image(`commander-sprite-${cmd.spriteIndex}`, `assets/commanders/sprites/Sprite${cmd.spriteIndex}.png`);
    }
    console.log(`[Boot] Queued ${commanders.length} commander sprites for preload`);

    // Merchant spritesheets are the only image assets Menu needs.
    const merchants = getMerchants();
    for (const m of merchants) {
      this.load.spritesheet(m.spriteKey, m.asset, {
        frameWidth: m.frameWidth,
        frameHeight: m.frameHeight,
      });
    }
    console.log(`[Boot] Queued ${merchants.length} merchant spritesheets`);

    // Generic achievement icon (Icon1 = first slot — specific icons deferred to polish pass).
    this.load.image('card-icon-Icon1', 'assets/cards/icons/Icon1.png');

    // Generate placeholder textures for warriors.
    const colors = [0x64b4d2, 0x7cceff, 0x66cc66, 0xffcc78, 0xcc66ff];
    colors.forEach((color, i) => {
      const gfx = this.add.graphics();
      gfx.fillStyle(color, 1);
      gfx.fillRect(0, 0, 32, 32);
      gfx.fillStyle(0x000000, 0.3);
      gfx.fillRect(8, 8, 6, 6);
      gfx.fillRect(18, 8, 6, 6);
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(9, 9, 4, 4);
      gfx.fillRect(19, 9, 4, 4);
      gfx.fillStyle(0x000000, 1);
      gfx.fillRect(10, 10, 2, 2);
      gfx.fillRect(20, 10, 2, 2);
      gfx.fillRect(10, 22, 12, 2);
      gfx.generateTexture(`warrior_placeholder_${i}`, 32, 32);
      gfx.destroy();
    });

    // Generated merchant stand-in. Real merchant sheets in public/assets/merchants
    // are multi-frame strips, so keep menu/shop on a safe single-frame texture.
    const mgfx = this.add.graphics();
    mgfx.fillStyle(Theme.fantasyPurpleDark, 1);
    mgfx.fillRect(0, 0, 48, 64);
    mgfx.fillStyle(Theme.fantasyGold, 1);
    mgfx.fillTriangle(24, 0, 4, 24, 44, 24);
    mgfx.fillStyle(0xffffff, 1);
    mgfx.fillRect(14, 32, 6, 6);
    mgfx.fillRect(28, 32, 6, 6);
    mgfx.generateTexture('merchant', 48, 64);
    mgfx.generateTexture('merchant_placeholder', 48, 64);
    mgfx.destroy();
  }

  async create() {
    resetCaptureReady();

    await initAuth();
    await AchievementManager.init();

    PixelSounds.warmup();
    console.log('[Boot] PixelSounds warmed up');
    PixelSounds.installAutoUnlock(window);
    const sfxVol = this.game.registry.get('sfxVolume') ?? 1.0;
    PixelSounds.setVolume(sfxVol);

    // Register one global looping idle animation per merchant.
    for (const merchant of getMerchants()) {
      if (!this.textures.exists(merchant.spriteKey)) {
        console.warn(`[Boot] Merchant texture missing: ${merchant.spriteKey}`);
        continue;
      }
      const key = `${merchant.spriteKey}-idle`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(merchant.spriteKey, { start: 0, end: merchant.frameCount - 1 }),
        frameRate: 8,
        repeat: -1,
      });
      console.log(`[Boot] Registered anim '${key}' (${merchant.frameCount} frames)`);
    }

    let captureRoute = null;
    try {
      captureRoute = resolveCaptureRoute();
    } catch (error) {
      console.error('[Boot] Capture route failed, falling back to Menu:', error);
      captureRoute = { sceneKey: 'Menu', data: {} };
    }

    if (captureRoute) {
      try {
        console.log(`[Boot] Starting capture preset scene: ${captureRoute.sceneKey}`);
        this.scene.start(captureRoute.sceneKey, captureRoute.data);
      } catch (error) {
        console.error(`[Boot] Capture scene start failed for ${captureRoute.sceneKey}, falling back to Menu:`, error);
        this.scene.start('Menu');
      }
      return;
    }

    // Vibe Jam 2026 portal arrival - land on Menu immediately.
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('portal') === 'true') {
        console.log('[Boot] Incoming Vibe Jam portal arrival, params:', Object.fromEntries(params));
        this.registry.set('portalArrival', true);
        console.log('[Portal] Registry flag portalArrival=true set');
        this.scene.start('Menu');
        return;
      }
    }

    this.scene.start('Menu');
  }
}
