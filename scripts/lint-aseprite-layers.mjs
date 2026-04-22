#!/usr/bin/env node
// lint-aseprite-layers.mjs
//
// Scans every unit in alpha-sprite-mapping.json for suspicious background
// layers (opaque rectangles that bake into the atlas as gray blocks).
// Commanders are static PNGs (see src/rendering/CLAUDE.md) — no pipeline,
// nothing to lint.
//
// Two detection passes per layer:
//   Check A — name heuristic (BACKGROUND_NAME_RE + shadow pattern). Cheap.
//   Check B — pixel sampling (exports a probe PNG, measures density etc.). Slow.
//
// A layer is "suspicious" if either check flags it.
// A suspicious layer is "suppressed" if it matches the name heuristic
// (suppressionSource: "auto-name") or is listed in the mapping's ignoreLayers
// (suppressionSource: "mapping").
//
// Output contract:
//   stdout — exactly one JSON document (machine-readable report)
//   stderr — all progress, warnings, and human-readable summaries
//
// Usage:
//   node scripts/lint-aseprite-layers.mjs [--pretty]
//   npm run alpha:lint-sprites
//
// --pretty: print a formatted summary table to stderr (JSON still goes to stdout)
//
// Environment:
//   ASEPRITE_CLI — path to aseprite.exe (optional; auto-detected on Windows)

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAseprite, listLayerHierarchy } from './lib/aseprite-cli.mjs';
import {
  detectBackgroundByName,
  detectBackgroundByPixels,
  BACKGROUND_NAME_RE,
} from './lib/layer-detectors.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const ALPHA_MAPPING_PATH = join(REPO_ROOT, 'src', 'config', 'alpha-sprite-mapping.json');

const pretty = process.argv.includes('--pretty');

function err(msg) { process.stderr.write(`[LINT] ${msg}\n`); }
function info(msg) { process.stderr.write(`[LINT] ${msg}\n`); }

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    err(`Failed to parse JSON at ${path}: ${e.message}`);
    process.exit(1);
  }
}

/**
 * Determines suppression status for a layer.
 * Only explicit mapping entries count — name-heuristic matches are REPORT-ONLY.
 * A regex mistake must surface as a CI failure, not silent self-suppression.
 * Returns { suppressed: boolean, suppressionSource: "mapping"|null }
 */
function checkSuppression(layerName, fullPath, explicitIgnoreLayers) {
  const explicit = explicitIgnoreLayers ?? [];
  if (explicit.includes(layerName) || explicit.includes(fullPath)) {
    return { suppressed: true, suppressionSource: 'mapping' };
  }
  return { suppressed: false, suppressionSource: null };
}

/**
 * Scans all non-group layers in absSource.
 * Returns an array of finding objects (only for suspicious layers).
 */
async function scanLayers(cli, absSource, explicitIgnoreLayers, baseFields) {
  let layers;
  try {
    layers = listLayerHierarchy(cli, absSource);
  } catch (e) {
    err(`Failed to list layers in ${absSource}: ${e.message}`);
    return [];
  }

  const findings = [];
  const nonGroupLayers = layers.filter((l) => !l.isGroup);

  for (const { name, fullPath } of nonGroupLayers) {
    // Check A — cheap name heuristic
    const nameFlag = detectBackgroundByName(name);

    // Check B — pixel sampling
    let pixelResult = null;
    try {
      pixelResult = await detectBackgroundByPixels(cli, absSource, fullPath);
    } catch (e) {
      err(`Pixel probe error for "${fullPath}" in ${absSource}: ${e.message}`);
      pixelResult = { suspicious: false, metrics: null, error: String(e.message) };
    }

    // Tooling failure: the probe itself errored. This is NOT an art decision
    // and cannot be suppressed via ignoreLayers. Surface as unsuppressed.
    if (pixelResult?.error) {
      findings.push({
        ...baseFields,
        layer: fullPath,
        reason: 'pixel-probe-error',
        error: pixelResult.error,
        metrics: null,
        suppressed: false,
        suppressionSource: null,
      });
      continue;
    }

    const suspicious = nameFlag || (pixelResult?.suspicious ?? false);
    if (!suspicious) continue;

    const reason = [
      nameFlag ? 'name-heuristic' : null,
      pixelResult?.suspicious ? 'pixel-sample' : null,
    ].filter(Boolean).join(' + ');

    const { suppressed, suppressionSource } = checkSuppression(name, fullPath, explicitIgnoreLayers);

    findings.push({
      ...baseFields,
      layer: fullPath,
      reason,
      metrics: pixelResult?.metrics ?? null,
      suppressed,
      suppressionSource,
    });
  }

  return findings;
}

async function main() {
  info('Starting layer lint...');

  const cli = resolveAseprite();
  if (!cli) {
    err('Aseprite CLI not found. Set ASEPRITE_CLI env var or install to the default path.');
    process.exit(1);
  }
  info(`Aseprite CLI: ${cli}`);

  const findings = [];
  let scannedUnits = 0;

  // ── Alpha units ──────────────────────────────────────────────────────────
  if (existsSync(ALPHA_MAPPING_PATH)) {
    const alphaMapping = readJson(ALPHA_MAPPING_PATH);
    const artRoot = alphaMapping.hammertimeArtRoot
      ? resolve(REPO_ROOT, alphaMapping.hammertimeArtRoot)
      : null;
    const units = alphaMapping.units ?? {};

    for (const [unitId, entry] of Object.entries(units)) {
      if (!entry?.source) {
        err(`Unit "${unitId}" has no source — skipped`);
        continue;
      }
      const absSource = artRoot ? resolve(artRoot, entry.source) : resolve(REPO_ROOT, entry.source);
      if (!existsSync(absSource)) {
        err(`Unit "${unitId}" source not found: ${absSource} — skipped`);
        continue;
      }
      info(`Scanning unit: ${unitId}`);
      const unitFindings = await scanLayers(cli, absSource, entry.ignoreLayers ?? [], {
        kind: 'unit',
        unitId,
        asepritePath: absSource,
      });
      findings.push(...unitFindings);
      scannedUnits++;
    }
  } else {
    err(`alpha-sprite-mapping.json not found at ${ALPHA_MAPPING_PATH} — skipping unit scan`);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const unsuppressedCount = findings.filter((f) => !f.suppressed).length;
  const report = { scannedUnits, findings };

  if (pretty) {
    err('');
    err(`Scanned: ${scannedUnits} unit(s)`);
    err(`Findings: ${findings.length} total, ${unsuppressedCount} unsuppressed`);
    if (unsuppressedCount > 0) {
      const unsuppressed = findings.filter((f) => !f.suppressed);
      const artFindings = unsuppressed.filter((f) => f.reason !== 'pixel-probe-error');
      const probeErrors = unsuppressed.filter((f) => f.reason === 'pixel-probe-error');

      if (artFindings.length > 0) {
        err('');
        err('UNSUPPRESSED suspicious layers (add to ignoreLayers in alpha-sprite-mapping.json):');
        for (const f of artFindings) {
          err(`  ${f.kind.padEnd(10)} ${f.unitId.padEnd(25)} layer: "${f.layer}"  reason: ${f.reason}`);
          if (f.metrics) {
            const m = f.metrics;
            err(`             density=${m.density} bbox=${m.bboxCoverage} rect=${m.rectangularity} colors=${m.distinctColors}`);
          }
        }
      }
      if (probeErrors.length > 0) {
        err('');
        err('PIXEL-PROBE ERRORS (tooling failure — investigate Aseprite CLI / pngjs, do NOT add to ignoreLayers):');
        for (const f of probeErrors) {
          err(`  [TOOLING] ${f.unitId.padEnd(25)} layer: "${f.layer}"  error: ${f.error}`);
        }
      }
    } else {
      err('All suspicious layers are suppressed. ✓');
    }
    err('');
  }

  // Exactly one JSON document to stdout — no other writes to stdout.
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  info(`Done. ${unsuppressedCount} unsuppressed finding(s).`);
}

main().catch((e) => {
  process.stderr.write(`[LINT] Unhandled error: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
