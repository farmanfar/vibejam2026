/**
 * VibeJamPortal — animated swirl portal that redirects to the Vibe Jam 2026
 * webring. Drop on end-of-run screens (GameOver, HallOfFame champion).
 *
 * Spec: https://vibejam.cc/portal/2026 — the redirector forwards ?ref so the
 * next jam game can build a return portal back to us.
 *
 * Usage:
 *   const portal = new VibeJamPortal(scene, x, y);
 *   LayoutEditor.register(scene, 'vibejamPortal', portal, x, y);
 *   scene.events.on('update', (_, delta) => portal.advance(delta));
 *   scene.events.once('shutdown', () => portal.destroy());
 *
 * The carrier sprite is a generated 128×128 white square. The FilterPortal
 * fragment shader ignores its pixels and draws the procedural swirl over the
 * quad's UVs (alpha-masked to a circle).
 */

import { GameObjects, Geom } from 'phaser';
import { PixelLabel } from '../ui/PixelLabel.js';
import { Theme } from '../ui/Theme.js';
import { PortalController } from '../rendering/PortalController.js';
import { PlayerConfig } from '../systems/PlayerConfig.js';

const QUAD_TEXTURE_KEY = 'vibejam-portal-quad';
const QUAD_SIZE        = 128;
const PORTAL_URL       = 'https://vibejam.cc/portal/2026';

/**
 * Build the redirector URL with our query params per the Vibe Jam spec.
 * Always includes ref + color; includes username when available.
 * @returns {string}
 */
export function buildVibeJamUrl() {
  const params = new URLSearchParams();
  if (typeof window !== 'undefined' && window.location) {
    params.set('ref', window.location.host + window.location.pathname);
  }
  const name = PlayerConfig.getName();
  if (name) params.set('username', name);
  params.set('color', '7cceff'); // Theme.accent
  return `${PORTAL_URL}?${params.toString()}`;
}

/**
 * Lazily generate the white-square carrier texture once per game.
 * The shader overdraws every pixel; the source texture is just a UV carrier.
 */
function _ensureQuadTexture(scene) {
  if (scene.textures.exists(QUAD_TEXTURE_KEY)) return;
  const gfx = scene.add.graphics();
  gfx.fillStyle(0xffffff, 1);
  gfx.fillRect(0, 0, QUAD_SIZE, QUAD_SIZE);
  gfx.generateTexture(QUAD_TEXTURE_KEY, QUAD_SIZE, QUAD_SIZE);
  gfx.destroy();
  console.log(`[Portal] Generated carrier texture '${QUAD_TEXTURE_KEY}' (${QUAD_SIZE}x${QUAD_SIZE})`);
}

export class VibeJamPortal extends GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {object} [opts]
   * @param {string} [opts.label='GO INTO THE VIBEJAM2026 PORTAL!']
   * @param {string} [opts.url] - override target URL (rare; default uses buildVibeJamUrl())
   */
  constructor(scene, x, y, opts = {}) {
    super(scene, x, y);
    scene.add.existing(this);

    this._labelText = opts.label ?? 'GO INTO THE VIBEJAM2026 PORTAL!';
    this._urlOverride = opts.url ?? null;

    _ensureQuadTexture(scene);

    // Carrier sprite — pure UV quad. Shader writes its own pixels.
    this.sprite = scene.add.sprite(0, 0, QUAD_TEXTURE_KEY);
    this.sprite.setOrigin(0.5);
    this.add(this.sprite);

    this.controller = null;
    if (typeof this.sprite.enableFilters === 'function') {
      this.sprite.enableFilters();
      if (this.sprite.filters && this.sprite.filterCamera) {
        this.controller = new PortalController(this.sprite.filterCamera);
        this.sprite.filters.internal.add(this.controller);
      } else {
        console.warn('[Portal] sprite.filters/filterCamera missing after enableFilters() — shader disabled');
      }
    } else {
      console.warn('[Portal] sprite.enableFilters() unavailable (Canvas mode?) — shader disabled');
    }

    // Hover/click hit area — circular, matches the visible portal radius.
    const HIT_RADIUS = QUAD_SIZE * 0.42;
    this.sprite.setInteractive(
      new Geom.Circle(QUAD_SIZE / 2, QUAD_SIZE / 2, HIT_RADIUS),
      Geom.Circle.Contains,
    );
    this.sprite.input.cursor = 'pointer';

    this.sprite.on('pointerover', () => this._onHover(true));
    this.sprite.on('pointerout',  () => this._onHover(false));
    this.sprite.on('pointerdown', () => this._enterPortal());

    // Label below the portal — DarkTech accent, matches end-screen typography.
    const labelY = QUAD_SIZE * 0.5 + 14;
    this.label = new PixelLabel(scene, 0, labelY, this._labelText, {
      scale: 2,
      color: 'accent',
      align: 'center',
    });
    this.label.setOrigin(0.5, 0);
    this.add(this.label);

    // Container size for LayoutEditor / interactive bounding (informational).
    this.setSize(QUAD_SIZE, QUAD_SIZE + 40);

    this._hoverTween = null;

    this.once('destroy', () => this._cleanup());

    console.log(`[Portal] VibeJamPortal mounted at (${x}, ${y})`);
  }

  _onHover(over) {
    if (!this.controller) return;
    if (this._hoverTween) {
      try { this._hoverTween.stop(); } catch (_) { /* noop */ }
      this._hoverTween = null;
    }
    this._hoverTween = this.scene.tweens.add({
      targets: this.controller,
      intensity: over ? 1.4 : 1.0,
      duration: 220,
      ease: 'Sine.InOut',
    });
  }

  _enterPortal() {
    const url = this._urlOverride || buildVibeJamUrl();
    console.log('[Portal] Entering Vibe Jam portal:', url);
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = url;
    }
  }

  /**
   * Forward delta to the shader controller. Call from a scene update listener.
   * @param {number} deltaMs
   */
  advance(deltaMs) {
    if (this.controller) this.controller.advance(deltaMs);
  }

  _cleanup() {
    if (this._hoverTween) {
      try { this._hoverTween.stop(); } catch (_) { /* noop */ }
      this._hoverTween = null;
    }
    // Filter controller is owned by sprite.filters.internal and disposed when
    // the sprite is destroyed by Container teardown — no manual remove needed.
    this.controller = null;
    console.log('[Portal] VibeJamPortal destroyed');
  }
}
