// Node-safe loader for generated alpha unit data. Uses fs.readFileSync so
// it works in Node ESM, vitest (Node env), and the sim CLI — no Vite, no
// JSON import attributes, no dynamic import needed.
//
// Exports:
//   loadAlphaUnits()     → array of unit definition objects
//   getAlphaUnit(id)     → single unit def by id, or null
//   loadAlphaUnitsMap()  → Map<id, unit>

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATED = join(__dirname, '..', '..', 'src', 'config', 'alpha-units.generated.json');

function load() {
  const raw = readFileSync(GENERATED, 'utf8');
  const { units } = JSON.parse(raw);
  return units;
}

let _cache = null;
function cached() {
  if (!_cache) _cache = load();
  return _cache;
}

export function loadAlphaUnits() {
  return cached();
}

export function getAlphaUnit(id) {
  return cached().find((u) => u.id === id) ?? null;
}

export function loadAlphaUnitsMap() {
  const map = new Map();
  for (const u of cached()) map.set(u.id, u);
  return map;
}
