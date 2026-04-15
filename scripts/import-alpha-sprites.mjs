#!/usr/bin/env node
// import-alpha-sprites.mjs
//
// Shells out to the Aseprite CLI to bake a packed spritesheet + tags JSON for
// every unit in src/config/alpha-sprite-mapping.json, then emits
// src/config/alpha-art.generated.json which the running game imports at build
// time (Vite-bundled — see src/config/alpha-units.js).
//
// Usage:
//   npm run alpha:sprites
//
// Environment:
//   ASEPRITE_CLI   — absolute path to aseprite.exe (optional; defaults to
//                    C:/Program Files/Aseprite/aseprite.exe on Windows).
//
// Zero npm dependencies — plain Node ESM.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const MAPPING_PATH = join(REPO_ROOT, 'src', 'config', 'alpha-sprite-mapping.json');
const MANIFEST_PATH = join(REPO_ROOT, 'src', 'config', 'alpha-art.generated.json');
const OUT_DIR = join(REPO_ROOT, 'public', 'assets', 'warriors', 'alpha');
const REPORTS_DIR = join(REPO_ROOT, 'reports');

const DEFAULT_ASEPRITE_WIN = 'C:/Program Files/Aseprite/aseprite.exe';
const SHADOW_LAYER_RE = /shadow/i;

function log(msg) {
  console.log(`[AlphaSprites] ${msg}`);
}

function die(msg, err) {
  console.error(`[AlphaSprites] FATAL: ${msg}`);
  if (err) console.error(err);
  process.exit(1);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    die(`Failed to parse JSON at ${path}`, e);
  }
}

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function resolveAseprite() {
  const envPath = process.env.ASEPRITE_CLI;
  if (envPath && existsSync(envPath)) return envPath;
  if (existsSync(DEFAULT_ASEPRITE_WIN)) return DEFAULT_ASEPRITE_WIN;
  die(
    'Aseprite CLI not found. Install Aseprite or set ASEPRITE_CLI to the ' +
      'absolute path of aseprite.exe. Default tried: ' +
      DEFAULT_ASEPRITE_WIN,
  );
  return null;
}

function listShadowLayers(cli, absSource) {
  let stdout = '';
  try {
    stdout = execFileSync(
      cli,
      ['--batch', '--list-layer-hierarchy', absSource],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
  } catch (e) {
    throw new Error(
      `Failed to list layers for ${absSource} (exit ${e.status ?? '?'}): ${e.stderr?.toString?.() ?? e.message}`,
    );
  }

  const matched = [];
  const seen = new Set();
  const groupStack = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = rawLine.trim();
    const isGroup = trimmed.endsWith('/');
    const name = isGroup ? trimmed.slice(0, -1).trim() : trimmed;
    if (!name) continue;

    while (groupStack.length && indent <= groupStack[groupStack.length - 1].indent) {
      groupStack.pop();
    }

    const parentPath = groupStack.length ? groupStack[groupStack.length - 1].fullPath : '';
    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    if (SHADOW_LAYER_RE.test(name)) {
      for (const candidate of [fullPath, name]) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        matched.push(candidate);
      }
    }

    if (isGroup) {
      groupStack.push({ indent, fullPath });
    }
  }

  return matched;
}

function runAseprite(cli, absSource, pngOut, jsonOut, { ignoreLayers = [], trim = false } = {}) {
  const args = [
    '--batch',
    '--sheet', pngOut,
    '--data', jsonOut,
    '--format', 'json-array',
    '--list-tags',
    '--sheet-pack',
  ];
  for (const layer of ignoreLayers) {
    args.push('--ignore-layer', layer);
  }
  if (trim) {
    args.push('--trim');
  }
  args.push(absSource);
  try {
    const stdout = execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return stdout ?? '';
  } catch (e) {
    throw new Error(`Aseprite CLI failed (exit ${e.status ?? '?'}): ${e.stderr?.toString?.() ?? e.message}`);
  }
}

function parseSidecar(path) {
  const raw = readJson(path);
  const meta = raw?.meta ?? {};
  const tags = Array.isArray(meta.frameTags) ? meta.frameTags.map((t) => t.name) : [];
  const frameCount = Array.isArray(raw.frames) ? raw.frames.length : 0;
  const atlasWidth = meta.size?.w ?? 0;
  const atlasHeight = meta.size?.h ?? 0;
  return { tags, frameCount, atlasWidth, atlasHeight };
}

function main() {
  if (!existsSync(MAPPING_PATH)) die(`Mapping not found: ${MAPPING_PATH}`);
  const mapping = readJson(MAPPING_PATH);
  const artRoot = mapping.hammertimeArtRoot
    ? resolve(REPO_ROOT, mapping.hammertimeArtRoot)
    : null;
  const units = mapping.units ?? {};
  const unitIds = Object.keys(units);
  log(`Loaded mapping — ${unitIds.length} units`);
  if (unitIds.length === 0) die('Mapping has no unit entries; nothing to bake.');
  if (!artRoot) die('Mapping is missing `hammertimeArtRoot`');
  if (!existsSync(artRoot)) die(`hammertimeArtRoot does not exist: ${artRoot}`);

  const cli = resolveAseprite();
  log(`Aseprite CLI: ${cli}`);

  ensureDir(OUT_DIR);
  ensureDir(REPORTS_DIR);

  const entries = {};
  const summary = [];
  let ok = 0;
  let failed = 0;

  for (const unitId of unitIds) {
    const entry = units[unitId];
    const source = entry?.source;
    if (!source) {
      console.error(`[AlphaSprites] ${unitId}: missing \`source\` field — skipped`);
      failed++;
      continue;
    }
    const absSource = resolve(artRoot, source);
    if (!existsSync(absSource)) {
      console.error(`[AlphaSprites] ${unitId}: source file does not exist: ${absSource}`);
      summary.push({ unitId, status: 'missing_source', source: absSource });
      failed++;
      continue;
    }

    const pngRel = `assets/warriors/alpha/${unitId}.png`;
    const dataRel = `assets/warriors/alpha/${unitId}.json`;
    const pngOut = join(OUT_DIR, `${unitId}.png`);
    const jsonOut = join(OUT_DIR, `${unitId}.json`);

    let mergedIgnore = [];
    try {
      const shadowLayers = listShadowLayers(cli, absSource);
      mergedIgnore = [...new Set([...(entry.ignoreLayers ?? []), ...shadowLayers])];
      log(`${unitId} ignoring layers: ${mergedIgnore.join(', ') || '(none)'}`);
      runAseprite(cli, absSource, pngOut, jsonOut, {
        ignoreLayers: mergedIgnore,
        trim: entry.trim ?? false,
      });
    } catch (e) {
      console.error(`[AlphaSprites] ${unitId}: CLI error`, e);
      summary.push({ unitId, status: 'cli_error', error: String(e.message) });
      failed++;
      continue;
    }
    if (!existsSync(pngOut) || !existsSync(jsonOut)) {
      console.error(`[AlphaSprites] ${unitId}: CLI ran but output missing`);
      summary.push({ unitId, status: 'missing_output' });
      failed++;
      continue;
    }

    const meta = parseSidecar(jsonOut);
    if (meta.tags.length === 0) {
      console.error(`[AlphaSprites] ${unitId}: aseprite source has no frame tags — bake skipped. Add tags in Aseprite.`);
      summary.push({ unitId, status: 'no_tags' });
      failed++;
      continue;
    }

    const manifestEntry = {
      spriteKey: `alpha-${unitId}`,
      pngPath: pngRel,
      dataPath: dataRel,
      displayScale: entry.displayScale ?? 2.5,
      defaultTag: entry.defaultTag ?? 'idle',
      portraitFrame: entry.portraitFrame ?? 0,
      tags: meta.tags,
      frameCount: meta.frameCount,
      atlasWidth: meta.atlasWidth,
      atlasHeight: meta.atlasHeight,
      ...(entry.animTagOverrides ? { animTagOverrides: entry.animTagOverrides } : {}),
      ...(entry.trim ? { trim: true } : {}),
      ...(mergedIgnore.length ? { ignoreLayers: mergedIgnore } : {}),
    };
    entries[unitId] = manifestEntry;

    const sizeBytes = statSync(pngOut).size;
    log(
      `${unitId} -> ${meta.tags.length} tags, ${meta.frameCount} frames, ` +
      `${meta.atlasWidth}x${meta.atlasHeight}px, ${(sizeBytes / 1024).toFixed(1)}KB OK`,
    );
    summary.push({
      unitId,
      status: 'ok',
      tags: meta.tags,
      frameCount: meta.frameCount,
      atlasWidth: meta.atlasWidth,
      atlasHeight: meta.atlasHeight,
    });
    ok++;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    entries,
  };
  const tmp = `${MANIFEST_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf8');
  // Atomic-ish on Windows: write then rename.
  writeFileSync(MANIFEST_PATH, readFileSync(tmp), 'utf8');
  try { execFileSync('node', ['-e', `require('fs').unlinkSync(${JSON.stringify(tmp)})`]); } catch {}
  log(`Manifest written -> ${MANIFEST_PATH} (${Object.keys(entries).length} entries)`);

  const reportPath = join(
    REPORTS_DIR,
    `alpha-sprites-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(
    reportPath,
    JSON.stringify({ ok, failed, summary }, null, 2),
    'utf8',
  );
  log(`Report written -> ${reportPath}`);

  if (failed > 0) {
    console.error(`[AlphaSprites] Completed with ${failed} failure(s) (${ok} OK)`);
    process.exit(2);
  }
  log(`Done — ${ok} unit(s) baked successfully.`);
}

main();
