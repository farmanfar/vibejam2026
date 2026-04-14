/**
 * FilterOutline — WebGL render node for a per-sprite outline filter.
 *
 * Algorithm: 8-tap neighbour sample on the sprite's framebuffer.
 *   • Opaque pixels (alpha > threshold) are passed through unchanged so the
 *     normal-map lighting result from setLighting(true) survives.
 *   • Transparent pixels become the outline colour iff any of the 8 neighbours
 *     is opaque.
 *   • Otherwise emit transparent.
 *
 * Pairs with OutlineController. Registered in main.js as
 * render.renderNodes.FilterOutline so Phaser lazy-instantiates it the first
 * time a controller is added.
 */

import { Renderer } from 'phaser';

const BaseFilterShader = Renderer.WebGL.RenderNodes.BaseFilterShader;

// ─── GLSL Fragment Shader ───────────────────────────────────────────────────

const FRAG_SRC = [
  '#pragma phaserTemplate(shaderName)',
  'precision mediump float;',

  'uniform sampler2D uMainSampler;',
  'uniform vec2      uTextureSize;',       // framebuffer size from drawingContext
  'uniform vec3      uOutlineColor;',
  'uniform float     uOutlineThickness;',  // framebuffer pixels
  'uniform float     uAlphaThreshold;',

  'varying vec2 outTexCoord;',

  '#pragma phaserTemplate(fragmentHeader)',

  'void main()',
  '{',
  '    vec4 c = texture2D(uMainSampler, outTexCoord);',

  '    // Opaque interior — pass through to preserve lighting.',
  '    if (c.a > uAlphaThreshold)',
  '    {',
  '        gl_FragColor = c;',
  '        return;',
  '    }',

  '    // Transparent pixel — sample 8 neighbours for opaque hits.',
  '    vec2 s = uOutlineThickness / uTextureSize;',
  '    float a = 0.0;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2( s.x,  0.0)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2(-s.x,  0.0)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2( 0.0,  s.y)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2( 0.0, -s.y)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2( s.x,  s.y)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2(-s.x,  s.y)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2( s.x, -s.y)).a;',
  '    a += texture2D(uMainSampler, outTexCoord + vec2(-s.x, -s.y)).a;',

  '    if (a > uAlphaThreshold)',
  '    {',
  '        gl_FragColor = vec4(uOutlineColor, 1.0);',
  '    }',
  '    else',
  '    {',
  '        gl_FragColor = vec4(0.0);',
  '    }',
  '}',
].join('\n');

// ─── Render Node ────────────────────────────────────────────────────────────

function FilterOutline(manager) {
  BaseFilterShader.call(this, 'FilterOutline', manager, null, FRAG_SRC);
}

FilterOutline.prototype = Object.create(BaseFilterShader.prototype);
FilterOutline.prototype.constructor = FilterOutline;

/**
 * Pushes outline uniforms from the controller every frame.
 * @param {import('./OutlineController.js').OutlineController} controller
 * @param {object} drawingContext
 */
FilterOutline.prototype.setupUniforms = function (controller, drawingContext) {
  const pm = this.programManager;
  pm.setUniform('uTextureSize',      [drawingContext.width, drawingContext.height]);
  pm.setUniform('uOutlineColor',     controller.color);
  pm.setUniform('uOutlineThickness', controller.thickness);
  pm.setUniform('uAlphaThreshold',   controller.alphaThreshold);
};

export { FilterOutline };
