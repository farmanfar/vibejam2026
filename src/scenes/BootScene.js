import { Scene } from 'phaser';
import { PixelFont, FONT_KEY } from '../ui/PixelFont.js';
import { Theme } from '../ui/Theme.js';
import { initAuth } from '../supabase.js';
import { getWarriors } from '../config/warriors.js';
import { getAlphaWarriors } from '../config/alpha-units.js';
import { getCommanders } from '../config/commanders.js';
import { getMerchants } from '../config/merchants.js';
import { resetCaptureReady, resolveCaptureRoute } from '../systems/CaptureSupport.js';
import { attachGeneratedNormalMap } from '../rendering/NormalMapGenerator.js';
import { getAllPreloadEntries as getAllSynergyIconPreloadEntries } from '../config/synergy-icons.js';

export class BootScene extends Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // PixelFont is pure canvas — init here so the bitmap font is available
    // immediately for the loading splash, before any file loads complete.
    PixelFont.init(this);

    const { width, height } = this.cameras.main;
    this.add.bitmapText(width / 2, height / 2 - 15, FONT_KEY, 'THE HIRED SWORDS', 7 * 4)
      .setOrigin(0.5)
      .setTint(Theme.accent);
    this.add.bitmapText(width / 2, height / 2 + 20, FONT_KEY, 'An Auto-Battler Roguelike', 7 * 2)
      .setOrigin(0.5)
      .setTint(Theme.mutedText);

    this.load.on('loaderror', (file) => {
      if (typeof file.key === 'string' && file.key.startsWith('unit-portrait-')) {
        console.warn(`[Boot] Failed to load unit portrait ${file.key} from ${file.src}`);
      }
    });

    const warriors = getWarriors();
    let queuedPortraits = 0;
    for (const warrior of warriors) {
      if (!warrior.art?.portraitPath) continue;
      this.load.image(warrior.spriteKey, warrior.art.portraitPath);
      queuedPortraits++;
    }
    console.log(`[Boot] Queued ${queuedPortraits} unit portraits for preload`);

    // Alpha units — Aseprite-baked multi-tag atlases. Animation creation
    // happens per-sprite in BattleScene via createFromAseprite(key, null, sprite),
    // so we only queue the atlas load here. Global createFromAseprite would
    // collide on raw tag names (idle/attack/death) across units.
    const alphas = getAlphaWarriors();
    let queuedAlphas = 0;
    for (const w of alphas) {
      if (!w.hasPortrait) continue;
      const pngPath = w.art?.pngPath;
      const dataPath = w.art?.dataPath;
      if (!pngPath || !dataPath) {
        console.warn(`[Boot] Alpha ${w.id} has art entry but missing pngPath/dataPath — skipped`);
        continue;
      }
      this.load.aseprite(w.spriteKey, pngPath, dataPath);
      queuedAlphas++;
    }
    console.log(`[Boot] Queued ${queuedAlphas} alpha aseprite atlases`);

    // Preload commander sprite images (Fantasy Cards pack).
    // commander-card-* (unused) intentionally omitted — no reader exists.
    // commander-sprite-* stays here because CommanderBadge in BattleScene and
    // ShopScene both need it; normal-map generation is deferred to CommanderSelectScene.
    const commanders = getCommanders();
    for (const cmd of commanders) {
      this.load.image(`commander-sprite-${cmd.spriteIndex}`, `assets/commanders/sprites/Sprite${cmd.spriteIndex}.png`);
    }
    console.log(`[Boot] Queued ${commanders.length} commander sprites for preload`);

    // Merchant spritesheets — pre-exported horizontal (and one vertical) PNG
    // strips from public/assets/merchants/npcs/. Merchants have a single
    // looping idle each, so no atlas JSON, tag data, or createFromAseprite is
    // needed. One global `<spriteKey>-idle` anim per merchant is registered
    // below in `create()` after loads complete.
    const merchants = getMerchants();
    for (const m of merchants) {
      this.load.spritesheet(m.spriteKey, m.asset, {
        frameWidth:  m.frameWidth,
        frameHeight: m.frameHeight,
      });
    }
    console.log(`[Boot] Queued ${merchants.length} merchant spritesheets`);

    // Preload blank fantasy card frames (PENUSBMIC Fantasy Cards pack) used by
    // WarriorCard. NOTE: file #11 has an extra space in its filename.
    const blankCardFiles = [
      'blank cards1.png', 'blank cards2.png', 'blank cards3.png',
      'blank cards4.png', 'blank cards5.png', 'blank cards6.png',
      'blank cards7.png', 'blank cards8.png', 'blank cards9.png',
      'blank cards10.png', 'blank cards 11.png',
    ];
    blankCardFiles.forEach((file, i) => {
      this.load.image(`card-blank-${i + 1}`, `assets/cards/blanks/${file}`);
    });
    console.log(`[Boot] Queued ${blankCardFiles.length} blank fantasy card frames for preload`);

    // Card stat icons (9x9 PENUSBMIC, drawn over blank card frames next to
    // ATK/HP numbers). To swap the sword pick, change ICON_ATK_FILE to another
    // number in public/assets/cards/icons/Icon#.png.
    const ICON_HP_FILE  = 'Icon5';  // confirmed red heart
    const ICON_ATK_FILE = 'Icon3';  // tentative sword — verify in-game
    this.load.image('card-icon-hp',  `assets/cards/icons/${ICON_HP_FILE}.png`);
    this.load.image('card-icon-atk', `assets/cards/icons/${ICON_ATK_FILE}.png`);
    console.log(`[Boot] Card stat icons: hp=${ICON_HP_FILE}, atk=${ICON_ATK_FILE}`);

    // Synergy chip icons (shop scene faction/class chips). See
    // src/config/synergy-icons.js for the texture-key → file mapping. Swap any
    // PNG in public/assets/ui/synergies/ to change the visual; no code change
    // needed unless adding a new tag.
    const synergyIconEntries = getAllSynergyIconPreloadEntries();
    synergyIconEntries.forEach(({ textureKey, file }) => {
      this.load.image(textureKey, `assets/ui/synergies/${file}`);
    });
    console.log(`[Boot] Queued ${synergyIconEntries.length} synergy chip icons for preload`);

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

    initAuth();

    // Register one global looping idle animation per merchant. Keys are
    // unique (`merchant-<id>-idle`) so every consumer (MenuScene, ShopScene,
    // MerchantSelectScene) can just call sprite.play(getMerchantIdleAnimKey(m))
    // without per-sprite createFromAseprite setup.
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

    // Generate normal maps for battle unit sprites (WebGL only).
    // Commander normal maps are generated in CommanderSelectScene.create() instead.
    if (this.sys.renderer.gl) {
      _generateBattleNormalMaps(this);
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

    this.time.delayedCall(150, () => {
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
 * Only warriors with art.portraitPath are attempted — matching the same guard
 * used in preload() so we never call attachGeneratedNormalMap() for a texture
 * that was never queued (it would warn for every missing unit).
 */
function _generateBattleNormalMaps(scene) {
  const warriors = getWarriors();
  let generated = 0;
  let skipped   = 0;

  for (const warrior of warriors) {
    const key = warrior.spriteKey;
    if (!key) continue;
    if (!warrior.art?.portraitPath) continue;
    if (attachGeneratedNormalMap(scene, key)) {
      generated++;
    } else {
      skipped++;
    }
  }

  // Alpha unit atlases — mapped alpha warriors with baked Aseprite art.
  const alphas = getAlphaWarriors();
  for (const w of alphas) {
    if (!w.hasPortrait || !w.spriteKey) continue;
    if (attachGeneratedNormalMap(scene, w.spriteKey)) {
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

