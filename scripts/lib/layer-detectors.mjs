// Layer-detection helpers: cheap name heuristic (Check A) and
// pixel-sampling probe (Check B). Both are used by the linter.
// The baker only uses listAutoIgnoreLayers (name-based, synchronous).
//
// pngjs is loaded lazily inside detectBackgroundByPixels so that importing
// this module does not require pngjs to be installed — only calling the
// pixel-sampler does.

import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { listLayerHierarchy, exportLayerProbe } from './aseprite-cli.mjs';

// Matches semantically unambiguous background-layer names only.
// "Layer N", "frame", "border" are intentionally EXCLUDED — those are Aseprite's
// default layer names and may be character art, not backgrounds (e.g. assassin
// has 6 layers literally named Layer 1..Layer 6 that form the full character).
// Linter hits on these names are report-only; the mapping must list them
// explicitly in ignoreLayers to count as suppressed.
export const BACKGROUND_NAME_RE = /^(bg|background|backdrop|sky|ground|floor|flattened)$/i;

// Kept separate so listAutoIgnoreLayers can union both patterns.
const SHADOW_RE = /shadow/i;

/** Pure name check — true if layerName looks like a background. */
export function detectBackgroundByName(layerName) {
  return BACKGROUND_NAME_RE.test(layerName) || SHADOW_RE.test(layerName);
}

/**
 * Returns all layer name/fullPath candidates that should be auto-ignored
 * based on name alone (shadow + background name heuristic). Synchronous.
 * Used by the baker and as the first pass in the linter.
 */
export function listAutoIgnoreLayers(cli, absSource) {
  const layers = listLayerHierarchy(cli, absSource);
  const matched = [];
  const seen = new Set();
  for (const { name, fullPath } of layers) {
    if (SHADOW_RE.test(name) || BACKGROUND_NAME_RE.test(name)) {
      for (const candidate of [fullPath, name]) {
        if (!seen.has(candidate)) {
          seen.add(candidate);
          matched.push(candidate);
        }
      }
    }
  }
  return matched;
}

// ── Pixel sampler ────────────────────────────────────────────────────────────
// Flag as suspicious background when ALL four conditions hold:
//   density      >= 0.50  (most of the canvas is opaque)
//   bboxCoverage >= 0.80  (opaque pixels span most of the canvas)
//   rectangularity >= 0.95  (they form a solid rectangle, not character art)
//   distinctColors  <= 32  (very few colors — no character detail)

const THRESHOLDS = { density: 0.50, bboxCoverage: 0.80, rectangularity: 0.95, distinctColors: 32 };

// In-memory probe cache keyed by `${asepritePath}::${layerName}`.
// Scope: single Node process. Separate npm commands each get a fresh cache.
const _probeCache = new Map();

// Temp probe PNGs — deleted on process exit.
const _tempFiles = new Set();
process.on('exit', () => {
  for (const f of _tempFiles) {
    try { unlinkSync(f); } catch {}
  }
});

/**
 * Pixel-sample a single layer of an .aseprite file.
 * Returns { suspicious: boolean, metrics: object|null, error?: string }.
 * Results are memoised per (absSource, layerName) pair within the process.
 */
export async function detectBackgroundByPixels(cli, absSource, layerName) {
  const cacheKey = `${absSource}::${layerName}`;
  if (_probeCache.has(cacheKey)) return _probeCache.get(cacheKey);
  const promise = _runProbe(cli, absSource, layerName);
  _probeCache.set(cacheKey, promise);
  return promise;
}

async function _runProbe(cli, absSource, layerName) {
  const hash = createHash('md5').update(`${absSource}::${layerName}`).digest('hex').slice(0, 8);
  const tempPng = join(tmpdir(), `aseprite-probe-${hash}.png`);
  _tempFiles.add(tempPng);

  try {
    exportLayerProbe(cli, absSource, layerName, tempPng);
  } catch (e) {
    console.error(`[LayerDetect] probe export failed for "${layerName}" in ${absSource}: ${e.message}`);
    return { suspicious: false, metrics: null, error: String(e.message) };
  }

  if (!existsSync(tempPng)) {
    return { suspicious: false, metrics: null, error: 'probe PNG was not created by Aseprite' };
  }

  let PNG;
  try {
    ({ PNG } = await import('pngjs'));
  } catch {
    return {
      suspicious: false,
      metrics: null,
      error: 'pngjs not installed — run: npm install --save-dev pngjs',
    };
  }

  let metrics;
  try {
    metrics = _analyzePng(PNG, tempPng);
  } catch (e) {
    return { suspicious: false, metrics: null, error: String(e.message) };
  }

  const suspicious =
    metrics.density >= THRESHOLDS.density &&
    metrics.bboxCoverage >= THRESHOLDS.bboxCoverage &&
    metrics.rectangularity >= THRESHOLDS.rectangularity &&
    metrics.distinctColors <= THRESHOLDS.distinctColors;

  return { suspicious, metrics };
}

function _analyzePng(PNG, pngPath) {
  const buf = readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;
  const total = width * height;

  let opaqueCount = 0;
  let minX = width, maxX = -1, minY = height, maxY = -1;
  const colorSet = new Set();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a > 0) {
        opaqueCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        colorSet.add((data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2]);
      }
    }
  }

  if (opaqueCount === 0) {
    return { density: 0, bboxCoverage: 0, rectangularity: 0, distinctColors: 0 };
  }

  const density = opaqueCount / total;
  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  const bboxCoverage = bboxArea / total;

  let insideBbox = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) insideBbox++;
    }
  }
  const rectangularity = bboxArea > 0 ? insideBbox / bboxArea : 0;

  return {
    density: parseFloat(density.toFixed(4)),
    bboxCoverage: parseFloat(bboxCoverage.toFixed(4)),
    rectangularity: parseFloat(rectangularity.toFixed(4)),
    distinctColors: colorSet.size,
  };
}
