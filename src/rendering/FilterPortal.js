/**
 * FilterPortal — WebGL render node for the Vibe Jam 2026 exit portal.
 *
 * Procedural swirl + chromatic ring + soft circular alpha mask. Ignores the
 * carrier sprite's pixels entirely; the carrier just supplies the quad/UVs
 * that the filter draws into.
 *
 * Registered in main.js as render.renderNodes.FilterPortal so Phaser
 * constructs it lazily the first time a PortalController is attached.
 *
 * Mirrors the structure of FilterCRT.js. See that file for the BaseFilterShader
 * pattern and uniform-upload contract.
 */

import { Renderer } from 'phaser';

const BaseFilterShader = Renderer.WebGL.RenderNodes.BaseFilterShader;

// ─── GLSL Fragment Shader ───────────────────────────────────────────────────

const FRAG_SRC = [
  '#pragma phaserTemplate(shaderName)',
  'precision mediump float;',

  'uniform sampler2D uMainSampler;',
  'uniform float     uTime;',
  'uniform float     uIntensity;',

  'varying vec2 outTexCoord;',

  '#pragma phaserTemplate(fragmentHeader)',

  'void main()',
  '{',
  '    // Polar coords from quad center',
  '    vec2  uv     = outTexCoord - vec2(0.5);',
  '    float radius = length(uv);',
  '    float angle  = atan(uv.y, uv.x);',

  '    // Circular alpha mask — soft outer falloff at r ≈ 0.50',
  '    float mask = smoothstep(0.50, 0.42, radius);',
  '    if (mask <= 0.001) {',
  '        gl_FragColor = vec4(0.0);',
  '        return;',
  '    }',

  '    // Spiral arms — 6 arms, radius-warped, time-rotated',
  '    float swirl  = sin(angle * 6.0 + uTime * 2.0 - radius * 14.0);',
  '    float swirl2 = sin(angle * 3.0 - uTime * 1.3 + radius * 6.0);',

  '    // Inner glow: dark void → cyan core (Theme.accent #7cceff)',
  '    vec3 voidCol = vec3(0.04, 0.06, 0.12);',
  '    vec3 coreCol = vec3(0.49, 0.81, 1.00);',
  '    float coreT  = smoothstep(0.50, 0.0, radius);',
  '    vec3 col     = mix(voidCol, coreCol, coreT * 0.85);',

  '    // Spiral arm shimmer — additive cyan-white near the ring',
  '    float ringFade = smoothstep(0.50, 0.18, radius) * (1.0 - smoothstep(0.10, 0.0, radius));',
  '    float armBright = (abs(swirl) * 0.6 + abs(swirl2) * 0.3) * ringFade;',
  '    col += vec3(0.55, 0.85, 1.0) * armBright * 0.9;',

  '    // Chromatic edge — magenta→cyan split right at the rim',
  '    float rimT = smoothstep(0.40, 0.50, radius);',
  '    vec3 chromaR = vec3(1.0, 0.30, 0.85) * smoothstep(0.42, 0.46, radius) * (1.0 - smoothstep(0.50, 0.52, radius));',
  '    vec3 chromaB = vec3(0.30, 0.80, 1.00) * smoothstep(0.44, 0.48, radius) * (1.0 - smoothstep(0.50, 0.52, radius));',
  '    col += (chromaR + chromaB) * (0.6 + 0.4 * sin(uTime * 4.0 + angle * 8.0));',

  '    // Sparkle dots — high-frequency noise on the ring',
  '    float sparkle = step(0.985, sin(angle * 23.0 + uTime * 6.0) * 0.5 + 0.5);',
  '    col += vec3(1.0) * sparkle * rimT * 0.6;',

  '    // Hover punch via uIntensity (1.0 base, ~1.4 on hover)',
  '    col *= uIntensity;',

  '    gl_FragColor = vec4(col * mask, mask);',
  '}',
].join('\n');

// ─── Render Node ─────────────────────────────────────────────────────────────

function FilterPortal(manager) {
  BaseFilterShader.call(this, 'FilterPortal', manager, null, FRAG_SRC);
}

FilterPortal.prototype = Object.create(BaseFilterShader.prototype);
FilterPortal.prototype.constructor = FilterPortal;

/**
 * Uploads portal uniforms from the controller every frame.
 * @param {import('./PortalController.js').PortalController} controller
 */
FilterPortal.prototype.setupUniforms = function (controller /*, drawingContext */) {
  const pm = this.programManager;
  pm.setUniform('uTime',      controller.time);
  pm.setUniform('uIntensity', controller.intensity);
};

export { FilterPortal };
