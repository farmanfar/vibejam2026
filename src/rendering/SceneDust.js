/**
 * SceneDust — ambient dust/particle atmosphere for every scene.
 *
 * Each preset has its own palette, direction, density, and motion feel so
 * scenes read as distinct "rooms" even before you look at the UI.
 *
 * Public API
 * ──────────
 *   SceneDust.attach(scene, presetKey) — spawn a particle emitter + register teardown
 *   SceneDust.detach(scene)            — destroy emitter (idempotent)
 *
 * Render order: dust sits at a high depth so it drifts over backgrounds and
 * under pointer-driven hover/drag UI. The CRT camera filter still processes
 * it (filters apply to the full camera output), so dust wiggles with the
 * CRT jitter — which is what we want.
 *
 * Texture: one shared 6x6 soft-dot texture ('__dust_mote') is generated
 * lazily on the first attach and reused; presets tint it.
 */

const DUST_TEX_KEY = '__dust_mote';
const DUST_DEPTH   = 900;

// ─── Presets ─────────────────────────────────────────────────────────────────
// Each preset gets:
//   tint        — array of candidate tints (randomized per particle)
//   speedX/Y    — per-particle velocity ranges (screen-space px/sec)
//   gravityY    — vertical acceleration (negative = floats up)
//   lifespan    — ms
//   scale       — particle scale range
//   alpha       — particle alpha range {start, end}
//   frequency   — ms between emissions (lower = denser)
//   quantity    — particles per emission tick
//   spawnBand   — 'full' | 'top' | 'bottom' | 'left' | 'right'
//                 where particles enter from (with small bleed for soft entry)

// Menu preset — warm amber motes drifting lazily rightward. The calm, "dust
// in a sunbeam" feel. Per user preference, every scene uses this exact look;
// other preset keys are kept as aliases so callers don't have to change.
const MENU_PRESET = {
  tint:      [0xffd89b, 0xf4b674, 0xc89364],
  speedX:    { min: 6,  max: 22  },
  speedY:    { min: -4, max:  4  },
  gravityY:  0,
  lifespan:  { min: 6500, max: 11000 },
  scale:     { min: 0.35, max: 1.1 },
  alpha:     { start: 0.45, end: 0 },
  frequency: 140,
  quantity:  2,
  spawnBand: 'full',
};

export const DUST_PRESETS = {
  menu:            MENU_PRESET,
  shop:            MENU_PRESET,
  battle:          MENU_PRESET,
  commanderSelect: MENU_PRESET,
  merchantSelect:  MENU_PRESET,
  gameOver:        MENU_PRESET,
  hallOfFame:      MENU_PRESET,
  settings:        MENU_PRESET,
};

// ─── Shared mote texture ─────────────────────────────────────────────────────

/**
 * Build a 6x6 soft-dot texture once and cache on the scene's texture manager.
 * Soft falloff so scaled motes read as dust, not pixelated squares.
 */
function _ensureDustTexture(scene) {
  if (scene.textures.exists(DUST_TEX_KEY)) return;
  const size = 6;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Three concentric circles → a poor-man's radial gradient.
  g.fillStyle(0xffffff, 0.35); g.fillCircle(size / 2, size / 2, size / 2);
  g.fillStyle(0xffffff, 0.65); g.fillCircle(size / 2, size / 2, size / 2 - 1);
  g.fillStyle(0xffffff, 1.0);  g.fillCircle(size / 2, size / 2, 1);
  g.generateTexture(DUST_TEX_KEY, size, size);
  g.destroy();
  console.log('[Dust] Generated shared mote texture');
}

// ─── Spawn-band zone sources ─────────────────────────────────────────────────

function _zoneSourceForBand(band, width, height) {
  // Small bleed outside visible rect so particles appear to drift in from
  // off-screen, not pop into existence at the edge.
  const bleed = 32;
  switch (band) {
    case 'top':
      return { getRandomPoint(p) {
        p.x = Math.random() * (width + bleed * 2) - bleed;
        p.y = -bleed + Math.random() * (bleed * 1.5);
      } };
    case 'bottom':
      return { getRandomPoint(p) {
        p.x = Math.random() * (width + bleed * 2) - bleed;
        p.y = height - Math.random() * (bleed * 0.5);
      } };
    case 'left':
      return { getRandomPoint(p) {
        p.x = -bleed + Math.random() * (bleed * 1.5);
        p.y = Math.random() * (height + bleed * 2) - bleed;
      } };
    case 'right':
      return { getRandomPoint(p) {
        p.x = width - Math.random() * (bleed * 0.5);
        p.y = Math.random() * (height + bleed * 2) - bleed;
      } };
    case 'full':
    default:
      return { getRandomPoint(p) {
        p.x = Math.random() * (width + bleed * 2) - bleed;
        p.y = Math.random() * (height + bleed * 2) - bleed;
      } };
  }
}

// ─── SceneDust ───────────────────────────────────────────────────────────────

export const SceneDust = {
  /**
   * Attach an ambient dust emitter to `scene`. Auto-detaches on scene shutdown.
   *
   * @param {Phaser.Scene} scene
   * @param {keyof DUST_PRESETS} presetKey
   * @returns {Phaser.GameObjects.Particles.ParticleEmitter | null}
   */
  attach(scene, presetKey) {
    const preset = DUST_PRESETS[presetKey];
    if (!preset) {
      console.warn(`[Dust] Unknown preset '${presetKey}' on ${scene.scene.key} — skipping`);
      return null;
    }

    _ensureDustTexture(scene);

    const { width, height } = scene.cameras.main;
    const source = _zoneSourceForBand(preset.spawnBand, width, height);

    const emitter = scene.add.particles(0, 0, DUST_TEX_KEY, {
      speedX:    preset.speedX,
      speedY:    preset.speedY,
      gravityY:  preset.gravityY,
      lifespan:  preset.lifespan,
      scale:     preset.scale,
      alpha:     preset.alpha,
      frequency: preset.frequency,
      quantity:  preset.quantity,
      tint:      preset.tint,
      rotate:    { min: 0, max: 360 },
      blendMode: 'ADD',
      emitZone:  { type: 'random', source, quantity: preset.quantity },
    });
    emitter.setDepth(DUST_DEPTH);

    // Pre-warm so the scene doesn't look empty for the first few seconds.
    // Size matches the preset's steady-state count (quantity * lifespan/freq)
    // so sparse presets don't spawn a dense pop of motes on entry.
    try {
      const avgLife = ((preset.lifespan.min ?? 0) + (preset.lifespan.max ?? 0)) / 2;
      const steady  = Math.max(1, Math.round(preset.quantity * (avgLife / preset.frequency)));
      const preWarm = Math.min(40, steady);
      for (let i = 0; i < preWarm; i++) emitter.emitParticle();
    } catch (e) {
      console.warn('[Dust] pre-warm emit failed (non-fatal):', e);
    }

    scene._sceneDustEmitter = emitter;
    scene.events.once('shutdown', () => SceneDust.detach(scene));

    console.log(`[Dust] Attached to ${scene.scene.key} (preset: ${presetKey})`);
    return emitter;
  },

  /**
   * Destroy the emitter. Safe to call multiple times.
   * @param {Phaser.Scene} scene
   */
  detach(scene) {
    if (!scene._sceneDustEmitter) return;
    try { scene._sceneDustEmitter.destroy(); }
    catch (e) { console.error('[Dust] Error during detach:', e); }
    scene._sceneDustEmitter = null;
    console.log(`[Dust] Detached from ${scene.scene.key}`);
  },
};
