// Shared Aseprite CLI helpers used by the baker, commander baker, and linter.
// Importing this module has no side effects — nothing runs on load.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const DEFAULT_ASEPRITE_WIN = 'C:/Program Files/Aseprite/aseprite.exe';

/**
 * Returns the path to the Aseprite CLI binary, or null if not found.
 * Checks ASEPRITE_CLI env var first, then the Windows default.
 */
export function resolveAseprite() {
  const envPath = process.env.ASEPRITE_CLI;
  if (envPath && existsSync(envPath)) return envPath;
  if (existsSync(DEFAULT_ASEPRITE_WIN)) return DEFAULT_ASEPRITE_WIN;
  return null;
}

/**
 * Lists all layers in an .aseprite file.
 * Returns an array of { name, fullPath, isGroup, indent } objects.
 * fullPath includes parent group names joined with '/'.
 */
export function listLayerHierarchy(cli, absSource) {
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

  const layers = [];
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

    layers.push({ name, fullPath, isGroup, indent });
    if (isGroup) groupStack.push({ indent, fullPath });
  }

  return layers;
}

/**
 * Bakes a sprite sheet + JSON sidecar from an .aseprite file.
 * Equivalent to: aseprite -b --sheet <png> --data <json> --format json-array --list-tags --sheet-pack [--ignore-layer ...] [--trim] <source>
 */
export function runAseprite(cli, absSource, pngOut, jsonOut, { ignoreLayers = [], trim = false } = {}) {
  const args = [
    '--batch',
    '--sheet', pngOut,
    '--data', jsonOut,
    '--format', 'json-array',
    '--list-tags',
    '--sheet-pack',
  ];
  for (const layer of ignoreLayers) args.push('--ignore-layer', layer);
  if (trim) args.push('--trim');
  args.push(absSource);
  try {
    return execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }) ?? '';
  } catch (e) {
    throw new Error(`Aseprite CLI failed (exit ${e.status ?? '?'}): ${e.stderr?.toString?.() ?? e.message}`);
  }
}

/**
 * Exports a single layer from frame 0 to a probe PNG.
 * Used by the pixel-sampler in layer-detectors.mjs.
 *
 * Aseprite CLI argument order is strict: the source .aseprite MUST come
 * before --save-as, or the CLI emits "A document is needed before --save-as".
 */
export function exportLayerProbe(cli, absSource, layerName, outPng) {
  const args = ['--batch', absSource, '--layer', layerName, '--frame-range', '0,0', '--save-as', outPng];
  try {
    execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    throw new Error(
      `Layer probe failed for "${layerName}" in ${absSource} (exit ${e.status ?? '?'}): ${e.stderr?.toString?.() ?? e.message}`,
    );
  }
}
