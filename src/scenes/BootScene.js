import { Scene } from 'phaser';
import { PixelFont, FONT_KEY } from '../ui/PixelFont.js';
import { Theme } from '../ui/Theme.js';
import { initAuth } from '../supabase.js';
import { getAllParallaxAssets } from '../rendering/FactionPalettes.js';
import { getWarriors } from '../config/warriors.js';
import { getCommanders } from '../config/commanders.js';
import { resetCaptureReady, resolveCaptureRoute } from '../systems/CaptureSupport.js';
import { attachGeneratedNormalMap } from '../rendering/NormalMapGenerator.js';

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

    // Preload commander card and trophy-room sprite images (Fantasy Cards pack)
    const commanders = getCommanders();
    for (const cmd of commanders) {
      this.load.image(`commander-card-${cmd.spriteIndex}`, `assets/commanders/cards/card${cmd.spriteIndex}.png`);
      this.load.image(`commander-sprite-${cmd.spriteIndex}`, `assets/commanders/sprites/Sprite${cmd.spriteIndex}.png`);
    }
    console.log(`[Boot] Queued ${commanders.length} commander card textures and ${commanders.length} commander sprites for preload`);

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

    // Generate normal maps for battle unit sprites (WebGL only).
    // Runs synchronously; 32×32 placeholders are ~1 ms total.
    if (this.sys.renderer.gl) {
      _generateBattleNormalMaps(this);
    }

    // Show a quick loading flash then proceed
    const { width, height } = this.cameras.main;
    this.add.bitmapText(
      width / 2,
      height / 2,
      FONT_KEY,
      'THE HIRED SWORDS',
      7 * 6,
    ).setOrigin(0.5).setTint(Theme.accent);

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

    this.time.delayedCall(600, () => {
      this.scene.start('Menu');
    });
  }
}

// ─── Normal-map generation at boot ───────────────────────────────────────────

/**
 * Generate and attach Phaser normal-map data sources for every battle unit
 * texture loaded during preload.  This covers:
 *   • unit-portrait-<spriteKey>  — real art from PENUSBMIC packs
 *   • warrior_placeholder_0..4   — generated coloured squares
 *
 * attachGeneratedNormalMap() is a no-op for textures that failed to load,
 * so missing portraits are silently skipped.
 */
function _generateBattleNormalMaps(scene) {
  const warriors = getWarriors();
  let generated = 0;
  let skipped   = 0;

  for (const warrior of warriors) {
    const key = warrior.spriteKey;
    if (!key) continue;
    if (attachGeneratedNormalMap(scene, key)) {
      generated++;
    } else {
      skipped++;
    }
  }

  // Placeholder textures (always present)
  for (let i = 0; i < 5; i++) {
    const key = `warrior_placeholder_${i}`;
    if (attachGeneratedNormalMap(scene, key)) generated++;
  }

  console.log(`[Boot] Normal maps: ${generated} generated, ${skipped} skipped (missing art)`);
}
