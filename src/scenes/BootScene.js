import { Scene } from 'phaser';
import { PixelFont, FONT_KEY } from '../ui/PixelFont.js';
import { Theme } from '../ui/Theme.js';
import { initAuth } from '../supabase.js';
import { getAllParallaxAssets } from '../rendering/FactionPalettes.js';
import { getWarriors } from '../config/warriors.js';
import { resetCaptureReady, resolveCaptureRoute } from '../systems/CaptureSupport.js';

export class BootScene extends Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.on('loaderror', (file) => {
      if (typeof file.key === 'string' && file.key.startsWith('unit-portrait-')) {
        console.warn(`[Boot] Failed to load unit portrait ${file.key} from ${file.src}`);
      }
    });

    // Preload all PENUSBMIC parallax backgrounds (29 sets, ~180 PNGs)
    const parallaxAssets = getAllParallaxAssets();
    for (const { key, path } of parallaxAssets) {
      this.load.image(key, path);
    }
    console.log(`[Boot] Queued ${parallaxAssets.length} parallax textures for preload`);

    const warriors = getWarriors();
    let queuedPortraits = 0;
    for (const warrior of warriors) {
      if (!warrior.art?.portraitPath) continue;
      this.load.image(warrior.spriteKey, warrior.art.portraitPath);
      queuedPortraits++;
    }
    console.log(`[Boot] Queued ${queuedPortraits} unit portraits for preload`);

    // Generate placeholder textures for warriors (before font is ready)
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
    // are multi-frame strips, so keep menu/shop on a safe single-frame texture for now.
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

  create() {
    resetCaptureReady();

    // Initialize the bitmap font from embedded glyph data
    PixelFont.init(this);
    initAuth();

    // Show a quick loading flash then proceed
    const { width, height } = this.cameras.main;
    this.add.bitmapText(
      width / 2,
      height / 2,
      FONT_KEY,
      'THE HIRED SWORDS',
      7 * 6,
    ).setOrigin(0.5).setTint(Theme.accent);

    const captureRoute = resolveCaptureRoute();
    if (captureRoute) {
      console.log(`[Boot] Starting capture preset scene: ${captureRoute.sceneKey}`);
      this.scene.start(captureRoute.sceneKey, captureRoute.data);
      return;
    }

    this.time.delayedCall(600, () => {
      this.scene.start('Menu');
    });
  }
}
