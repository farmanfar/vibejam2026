/**
 * FilterCRT — WebGL render node for Phaser 4 camera filters.
 * Ports the MonoGame CRT.fx barrel distortion, chroma split, scanlines,
 * flicker, vignette, and power-off collapse into a single GLSL pass.
 *
 * Registered in main.js as render.renderNodes.FilterCRT so Phaser
 * constructs it lazily the first time a CrtController is added to a camera.
 */

import { Renderer } from 'phaser';

const BaseFilterShader = Renderer.WebGL.RenderNodes.BaseFilterShader;

// ─── GLSL Fragment Shader ───────────────────────────────────────────────────
// Vertex inputs from SimpleTexture-vert:
//   varying vec2 outTexCoord  — normalised UV (0..1, y=0 is framebuffer bottom)
//   varying vec2 outFragCoord — clip-space mapped to 0..1

const FRAG_SRC = [
  '#pragma phaserTemplate(shaderName)',
  'precision mediump float;',

  'uniform sampler2D uMainSampler;',
  'uniform float     uTime;',
  'uniform float     uScanlineIntensity;',
  'uniform float     uChromaOffset;',
  'uniform vec2      uTextureSize;',
  'uniform float     uFlickerAmount;',
  'uniform float     uCurvatureAmount;',
  'uniform float     uVignetteAmount;',
  'uniform float     uPowerOff;',
  'uniform float     uWiggle;',

  'varying vec2 outTexCoord;',

  '#pragma phaserTemplate(fragmentHeader)',

  'vec2 barrelDistort(vec2 uv, float amount)',
  '{',
  '    vec2 cc   = uv - 0.5;',
  '    float d   = dot(cc, cc);',
  '    return uv + cc * d * amount;',
  '}',

  'void main()',
  '{',
  '    // Hard cut to black at end of power-off',
  '    if (uPowerOff > 0.95)',
  '    {',
  '        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);',
  '        return;',
  '    }',

  '    // Barrel / screen curvature',
  '    vec2 curved = barrelDistort(outTexCoord, uCurvatureAmount);',

  '    // CRT wiggle — brief rippled horizontal jitter (scheduled by controller).',
  '    // Masked toward screen edges so the centre stays stable for UI/read-ability.',
  '    // edgeMask: 0 near center, 1 at far sides (starts fading in past ~35% out).',
  '    float edgeMask = smoothstep(0.35, 0.5, abs(outTexCoord.x - 0.5));',
  '    float wEff = uWiggle * edgeMask;',
  '    if (wEff > 0.0) {',
  '        float w1 = sin(curved.y * 42.0 + uTime * 28.0);',
  '        float w2 = sin(curved.y * 7.0  + uTime * 11.0);',
  '        curved.x += wEff * (w1 * 0.0018 + w2 * 0.0006);',
  '        curved.y += wEff * w2 * 0.0004;',
  '    }',

  '    // Vertical squish toward center during power-off',
  '    if (uPowerOff > 0.0)',
  '    {',
  '        curved.y = 0.5 + (curved.y - 0.5) * max(0.001, 1.0 - uPowerOff);',
  '    }',

  '    // Black border outside curved screen',
  '    if (curved.x < 0.0 || curved.x > 1.0 || curved.y < 0.0 || curved.y > 1.0)',
  '    {',
  '        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);',
  '        return;',
  '    }',

  '    // Chromatic aberration — sample symmetrically along the vector from',
  '    // screen centre so centred UI does not read as visually skewed.',
  '    vec2  pixelSize = 1.0 / uTextureSize;',
  '    vec2  centDir   = curved - 0.5;',
  '    float centLen   = length(centDir);',
  '    vec2  chromaDir = (centLen > 0.0001) ? (centDir / centLen) : vec2(0.0, 0.0);',
  '    vec2  chromaOff = chromaDir * (uChromaOffset * pixelSize) * (1.0 + wEff * 1.5);',
  '    float r = texture2D(uMainSampler, curved - chromaOff).r;',
  '    float g = texture2D(uMainSampler, curved).g;',
  '    float b = texture2D(uMainSampler, curved + chromaOff).b;',
  '    float a = texture2D(uMainSampler, curved).a;',
  '    vec4 result = vec4(r, g, b, a);',

  '    // Scanlines — darken every other pixel row',
  '    float scanline = sin(curved.y * uTextureSize.y * 3.14159) * 0.5 + 0.5;',
  '    float effScan  = uScanlineIntensity * (1.0 + uPowerOff * 4.0);',
  '    scanline = 1.0 - effScan * (1.0 - scanline * scanline);',
  '    result.rgb *= scanline;',

  '    // Subtle brightness flicker',
  '    float flicker = 1.0 - uFlickerAmount * 0.5',
  '                    * (sin(uTime * 8.0) * 0.3 + sin(uTime * 13.0) * 0.2);',
  '    result.rgb *= flicker;',

  '    // Vignette — darken edges',
  '    vec2  cent    = curved - 0.5;',
  '    float vignette = 1.0 - dot(cent, cent) * uVignetteAmount;',
  '    result.rgb *= clamp(vignette, 1.0 - uVignetteAmount * 0.5, 1.0);',

  '    // Power-off: bright phosphor line at screen centre',
  '    if (uPowerOff > 0.85)',
  '    {',
  '        float lineW = 0.008 * (1.0 - uPowerOff) / 0.15;',
  '        float dist  = abs(outTexCoord.y - 0.5);',
  '        if (lineW > 0.0 && dist < lineW)',
  '        {',
  '            result.rgb += vec3(1.5, 1.5, 1.8) * (1.0 - dist / lineW);',
  '        }',
  '    }',

  '    gl_FragColor = result;',
  '}',
].join('\n');

// ─── Render Node ─────────────────────────────────────────────────────────────

function FilterCRT(manager) {
  BaseFilterShader.call(this, 'FilterCRT', manager, null, FRAG_SRC);
}

FilterCRT.prototype = Object.create(BaseFilterShader.prototype);
FilterCRT.prototype.constructor = FilterCRT;

/**
 * Uploads CRT uniforms from the controller every frame.
 * @param {import('./CrtController.js').CrtController} controller
 * @param {object} drawingContext
 */
FilterCRT.prototype.setupUniforms = function (controller, drawingContext) {
  const pm = this.programManager;
  pm.setUniform('uTime',              controller.time);
  pm.setUniform('uScanlineIntensity', controller.scanlineIntensity);
  pm.setUniform('uChromaOffset',      controller.chromaOffset);
  pm.setUniform('uTextureSize',       [drawingContext.width, drawingContext.height]);
  pm.setUniform('uFlickerAmount',     controller.flickerAmount);
  pm.setUniform('uCurvatureAmount',   controller.curvatureAmount);
  pm.setUniform('uVignetteAmount',    controller.vignetteAmount);
  pm.setUniform('uPowerOff',          controller.powerOff);
  pm.setUniform('uWiggle',            controller.wiggle);
};

export { FilterCRT };
