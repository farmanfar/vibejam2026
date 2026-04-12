/**
 * NormalMapGenerator — JS port of HammerTime/NormalMapGenerator.cs
 *
 * Converts pixel-art sprites to normal maps using brightness-as-height and
 * edge-bevel direction for 2-D lighting in Phaser 4.
 *
 * Public API
 * ──────────
 *   NormalMapGenerator.generate(imageOrCanvas, options?)
 *     → ImageData | null
 *
 *   attachGeneratedNormalMap(scene, textureKey, options?)
 *     → boolean  (true on success)
 */

// ─── Generator ────────────────────────────────────────────────────────────────

export const NormalMapGenerator = {

  /**
   * Generate a normal-map ImageData from an HTMLImageElement or HTMLCanvasElement.
   *
   * Algorithm (matches NormalMapGenerator.cs):
   *   • Luminance is treated as surface height.
   *   • Edge pixels (any 4-connected transparent neighbour, or at the border)
   *     bevel outward from the sprite's centre of mass.
   *   • Interior pixels use a Sobel-style central-difference gradient.
   *   • Transparent pixels get the canonical flat normal (128, 128, 255, 0).
   *
   * @param {HTMLImageElement|HTMLCanvasElement} source
   * @param {{ bumpStrength?: number }} [options]
   * @returns {ImageData|null}
   */
  generate(source, options = {}) {
    const bumpStrength = options.bumpStrength ?? 2.0;

    let w, h;
    if (source instanceof HTMLCanvasElement) {
      w = source.width;
      h = source.height;
    } else if (source instanceof HTMLImageElement) {
      w = source.naturalWidth || source.width;
      h = source.naturalHeight || source.height;
    } else {
      console.error('[NormalMap] Unsupported source type:', source);
      return null;
    }

    if (w === 0 || h === 0) {
      console.warn('[NormalMap] Zero-size source image');
      return null;
    }

    // Rasterise into a 2-D canvas for getImageData
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0);
    const { data: pixels } = ctx.getImageData(0, 0, w, h);

    // Build per-pixel alpha and height grids
    const alpha  = new Float32Array(w * h);
    const height = new Float32Array(w * h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = pixels[i + 3] / 255;
        const r = pixels[i]     / 255;
        const g = pixels[i + 1] / 255;
        const bv= pixels[i + 2] / 255;
        alpha[y * w + x]  = a;
        height[y * w + x] = a * (r * 0.299 + g * 0.587 + bv * 0.114);
      }
    }

    // Centre of mass (opaque pixels only)
    let comX = 0, comY = 0, opaqueCount = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha[y * w + x] > 0.5) { comX += x; comY += y; opaqueCount++; }
      }
    }
    comX = opaqueCount > 0 ? comX / opaqueCount : w * 0.5;
    comY = opaqueCount > 0 ? comY / opaqueCount : h * 0.5;

    // Generate normal map
    const output = new Uint8ClampedArray(w * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const a   = alpha[y * w + x];

        if (a < 0.1) {
          // Transparent — canonical flat-upward normal, zero alpha
          output[idx]     = 128;
          output[idx + 1] = 128;
          output[idx + 2] = 255;
          output[idx + 3] = 0;
          continue;
        }

        let nx, ny, nz;

        if (_isEdge(alpha, x, y, w, h)) {
          // Edge bevel: tilt outward from sprite centre of mass
          let dx = x - comX;
          let dy = y - comY;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0.001) { dx /= len; dy /= len; }
          nx = dx * 0.6;
          ny = dy * 0.6;
          nz = 0.8;
        } else {
          // Interior: Sobel central-difference gradient from heightmap
          const hL = _sampleH(height, alpha, x - 1, y, w, h);
          const hR = _sampleH(height, alpha, x + 1, y, w, h);
          const hU = _sampleH(height, alpha, x, y - 1, w, h);
          const hD = _sampleH(height, alpha, x, y + 1, w, h);
          nx = -(hR - hL) * bumpStrength;
          ny = -(hD - hU) * bumpStrength;
          nz = 1.0;
        }

        // Normalise
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= inv; ny *= inv; nz *= inv;

        // Encode [-1,1] → [0,255]
        output[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
        output[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        output[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        output[idx + 3] = Math.round(a * 255);
      }
    }

    return new ImageData(output, w, h);
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _isEdge(alpha, x, y, w, h) {
  if (x === 0 || x === w - 1 || y === 0 || y === h - 1) return true;
  if (alpha[y * w + (x - 1)] < 0.1) return true;
  if (alpha[y * w + (x + 1)] < 0.1) return true;
  if (alpha[(y - 1) * w + x] < 0.1) return true;
  if (alpha[(y + 1) * w + x] < 0.1) return true;
  return false;
}

function _sampleH(height, alpha, x, y, w, h) {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  if (alpha[y * w + x] < 0.1) return 0;
  return height[y * w + x];
}

// ─── Scene helper ─────────────────────────────────────────────────────────────

/**
 * Generate a normal map for a Phaser texture and attach it as the texture's
 * data source (normal map slot).  Only runs in WebGL mode.
 *
 * @param {Phaser.Scene} scene
 * @param {string}       textureKey
 * @param {object}       [options]  — forwarded to NormalMapGenerator.generate()
 * @returns {boolean}
 */
export function attachGeneratedNormalMap(scene, textureKey, options = {}) {
  const texture = scene.textures.get(textureKey);
  if (!texture || texture.key === '__MISSING' || texture.key === '__DEFAULT') {
    console.warn(`[NormalMap] Texture not found or missing: ${textureKey}`);
    return false;
  }

  const src = texture.source && texture.source[0];
  if (!src) {
    console.warn(`[NormalMap] No source for texture: ${textureKey}`);
    return false;
  }

  const img = src.image;
  if (!(img instanceof HTMLImageElement) && !(img instanceof HTMLCanvasElement)) {
    console.warn(`[NormalMap] Unsupported source image type for: ${textureKey}`);
    return false;
  }

  const normalData = NormalMapGenerator.generate(img, options);
  if (!normalData) {
    console.warn(`[NormalMap] Generation failed for: ${textureKey}`);
    return false;
  }

  // Write the normal map onto a canvas then attach as the data source
  const nmCanvas = document.createElement('canvas');
  nmCanvas.width  = normalData.width;
  nmCanvas.height = normalData.height;
  nmCanvas.getContext('2d').putImageData(normalData, 0, 0);

  texture.setDataSource(nmCanvas);

  console.log(`[NormalMap] Attached ${textureKey} (${normalData.width}×${normalData.height})`);
  return true;
}
