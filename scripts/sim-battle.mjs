#!/usr/bin/env node
// Alpha battle sim CLI.
//
// Usage:
//   node scripts/sim-battle.mjs --p ghoul,minion_001 --e minion_001,minion_001 --seed 42
//   node scripts/sim-battle.mjs --fixture fixtures/mirror-folk.json --bulk 1000 --report
//   node scripts/sim-battle.mjs --p colossal_boss,ancient_guardian --e minion_001,minion_001,minion_001 --verbose
//
// Flags:
//   --p <id,...>      Player team (comma-separated unit IDs)
//   --e <id,...>      Enemy team
//   --fixture <path>  JSON file with { player: [...ids], enemy: [...ids] }
//   --seed <n>        Starting seed (default 42)
//   --bulk <n>        Run N battles (seeds 0..N-1 unless --seed forces starting)
//   --verbose         Print full log for each battle
//   --report          Write reports/sim-<timestamp>.json after --bulk run

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load dependencies.
const { loadAlphaUnits, getAlphaUnit } = await import('./lib/load-alpha-units.mjs');
const { buildRegistry, CombatCore } = await import('../src/systems/combat/index.js');

// ---------- arg parse ----------
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] ?? null;
}
function hasFlag(name) {
  return args.includes(name);
}

const playerIds = flag('--p')?.split(',') ?? null;
const enemyIds = flag('--e')?.split(',') ?? null;
const fixturePath = flag('--fixture');
const seedArg = parseInt(flag('--seed') ?? '42', 10);
const bulk = parseInt(flag('--bulk') ?? '1', 10);
const verbose = hasFlag('--verbose');
const report = hasFlag('--report');

// ---------- resolve team definitions ----------
function resolveDefs(ids) {
  const defs = [];
  for (const id of ids) {
    const def = getAlphaUnit(id.trim());
    if (!def) {
      console.error(`[sim] ERROR: unknown unit id '${id}'. Run 'npm run alpha:generate' first.`);
      process.exit(1);
    }
    defs.push(def);
  }
  return defs;
}

let playerDefs, enemyDefs;
if (fixturePath) {
  const fix = JSON.parse(readFileSync(fixturePath, 'utf8'));
  playerDefs = resolveDefs(fix.player);
  enemyDefs = resolveDefs(fix.enemy);
} else if (playerIds && enemyIds) {
  playerDefs = resolveDefs(playerIds);
  enemyDefs = resolveDefs(enemyIds);
} else {
  console.error('[sim] ERROR: provide --p and --e, or --fixture');
  process.exit(1);
}

// ---------- run ----------
const registry = buildRegistry();

let wins = 0, losses = 0, draws = 0;
const allResults = [];

const startSeed = seedArg;
for (let i = 0; i < bulk; i++) {
  const seed = startSeed + i;
  const core = new CombatCore({ registry, seed, verbose: verbose || bulk === 1 });
  const result = core.run({ player: [...playerDefs], enemy: [...enemyDefs] });

  if (result.winner === 'player') wins++;
  else if (result.winner === 'enemy') losses++;
  else draws++;

  if (verbose || bulk === 1) {
    console.log(`\n[sim] === Battle seed=${seed} ===`);
    for (const entry of result.log.entries) {
      const { kind, ...rest } = entry;
      const line = `  [${kind}] ${JSON.stringify(rest)}`;
      if (
        kind === 'battle_init' ||
        kind === 'battle_start' ||
        kind === 'round_start' ||
        kind === 'battle_end'
      ) {
        console.log(line);
      } else if (verbose) {
        console.log(line);
      }
    }
    console.log(`[sim] Result: ${result.winner} wins in ${result.rounds} rounds`);
  }

  if (report) {
    allResults.push({ seed, winner: result.winner, rounds: result.rounds });
  }
}

if (bulk > 1) {
  console.log(`\n[sim] ========================================`);
  console.log(`[sim] ${bulk} battles | Player: ${wins}W ${losses}L ${draws}D`);
  console.log(`[sim] Win rate: ${((wins / bulk) * 100).toFixed(1)}%`);
}

if (report && allResults.length > 0) {
  const reportsDir = join(ROOT, 'reports');
  mkdirSync(reportsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(reportsDir, `sim-${ts}.json`);
  const payload = {
    timestamp: new Date().toISOString(),
    playerTeam: playerDefs.map((d) => d.id),
    enemyTeam: enemyDefs.map((d) => d.id),
    startSeed,
    bulk,
    wins,
    losses,
    draws,
    winRate: wins / bulk,
    results: allResults,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`[sim] Report written to ${outPath}`);
}
