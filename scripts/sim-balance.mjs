#!/usr/bin/env node
// Balance sim orchestrator for Hired Swords.
//
// Produces per-unit telemetry, matchup matrices, synergy comparisons, and
// merchant-favor impact reports. Results are written to reports/balance/<ts>-<sub>/.
//
// Usage:
//   node scripts/sim-balance.mjs                              # full run
//   node scripts/sim-balance.mjs <subcommand> [flags]
//   node scripts/sim-balance.mjs help
//
// Subcommands: per-unit | matchup-matrix | class-synergy | faction-synergy | merchant-impact | archetype-matrix | full
// Flags: --reps N   --seed N   --tier 0,1   --out <dir>
//
// Seed ranges (non-overlapping, reproducible):
//   per-unit:         [0 .. 200_000)
//   matchup-matrix:   [200_000 .. 500_000)
//   class-synergy:    [500_000 .. 600_000)
//   faction-synergy:  [600_000 .. 700_000)
//   merchant-impact:  [700_000 .. 800_000)
//   archetype-matrix: [800_000 .. 1_000_000)
//
// Future: worker_threads parallelism, economy loop, star levels.

import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Dynamic imports so the registry is built once after arg parsing.
const { buildRegistry, CombatCore } = await import('../src/systems/combat/index.js');
const { loadAlphaUnits }            = await import('./lib/load-alpha-units.mjs');
const { getMerchants, getMerchantFavor } = await import('../src/config/merchants.js');
const { analyzeResult }             = await import('./lib/battle-telemetry.mjs');
const { stampTeam, randomTeam, themedTeam, allPairs, RNG } = await import('./lib/team-generator.mjs');
const { writeMarkdown, writeCsv, appendJsonl, makeReportDir } = await import('./lib/report-writers.mjs');

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { const i = args.indexOf(name); return i === -1 ? null : (args[i + 1] ?? null); }
function hasFlag(name) { return args.includes(name); }

const subArg = args[0] && !args[0].startsWith('--') ? args[0] : 'full';
if (subArg === 'help') {
  console.log('Usage: node scripts/sim-balance.mjs [subcommand] [flags]');
  console.log('Subcommands: per-unit | matchup-matrix | class-synergy | faction-synergy | merchant-impact | archetype-matrix | full');
  console.log('Flags: --reps N  --seed N  --tier 0,1  --out <dir>');
  process.exit(0);
}

const repsArg  = parseInt(flag('--reps')  ?? '0', 10);
const seedBase = parseInt(flag('--seed')  ?? '0', 10);
const tierArg  = flag('--tier');
const outArg   = flag('--out') ?? join(ROOT, 'reports', 'balance');

const tierFilter = tierArg ? tierArg.split(',').map(Number) : null;

// ─── Bootstrap ──────────────────────────────────────────────────────────────

const registry = buildRegistry();
const allUnits = loadAlphaUnits();
const pool = tierFilter ? allUnits.filter((u) => tierFilter.includes(u.tier)) : allUnits;

if (pool.length === 0) {
  console.error('[Balance] ERROR: unit pool is empty after tier filter. Check --tier values and alpha:generate.');
  process.exit(1);
}

// ─── Core runner ────────────────────────────────────────────────────────────

function runBattle(playerDefs, enemyDefs, seed, { playerFavor = null, enemyFavor = null } = {}) {
  const core = new CombatCore({ registry, seed, verbose: false });
  return core.run({ player: playerDefs, enemy: enemyDefs, playerFavor, enemyFavor });
}

/**
 * Run A-vs-B with side-swap for unbiased win-rate from A's perspective.
 * Returns { aWins, draws, total }.
 * Seeds: seedP = base, seedE = base + 1. Caller manages base per rep.
 */
function runPair(aDefs, bDefs, seedBase, { aFavor = null, bFavor = null } = {}) {
  const r1 = runBattle(aDefs, bDefs, seedBase,     { playerFavor: aFavor, enemyFavor: bFavor });
  const r2 = runBattle(bDefs, aDefs, seedBase + 1, { playerFavor: bFavor, enemyFavor: aFavor });
  const aWins = (r1.winner === 'player' ? 1 : 0) + (r2.winner === 'enemy' ? 1 : 0);
  const draws = (r1.winner === 'draw'   ? 1 : 0) + (r2.winner === 'draw'  ? 1 : 0);
  return { aWins, draws, total: 2 };
}

// ─── Progress ───────────────────────────────────────────────────────────────

function makeProgress(label, total) {
  const start = Date.now();
  let done = 0;
  let lastPct = -1;
  console.log(`[Balance] ${label} starting — ${total} battles`);
  return {
    tick(n = 1) {
      done += n;
      const pct = Math.floor((done / total) * 10) * 10;
      if (pct !== lastPct && pct > 0) {
        lastPct = pct;
        console.log(`[Balance] ${label} progress ${pct}% (${done}/${total})`);
      }
    },
    done(outPath) {
      const secs = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[Balance] ${label} done in ${secs}s — wrote ${outPath}`);
    },
  };
}

// ─── Subcommand: per-unit ───────────────────────────────────────────────────

async function cmdPerUnit({ reps = 200, dir }) {
  const actualReps = reps;
  const SEED_BASE  = seedBase + 0;
  const total = pool.length * actualReps;
  const prog = makeProgress('per-unit', total);

  // Per-unitId aggregate: sum across all mirror battles
  const agg = {};
  for (const def of pool) {
    agg[def.id] = { unitId: def.id, tier: def.tier, class: def.class, faction: def.faction,
      battles: 0, wins: 0, draws: 0,
      damageDealt: 0, damageTaken: 0, kills: 0, deaths: 0, reanimates: 0,
      survivalRoundsSum: 0, survivalRoundsCount: 0 };
  }

  let comparison = 0;
  for (const def of pool) {
    for (let r = 0; r < actualReps; r++) {
      const seed = SEED_BASE + comparison * actualReps + r;
      const pDefs = stampTeam([def], 'p');
      const eDefs = stampTeam([def], 'e');
      const result = runBattle(pDefs, eDefs, seed);
      const analysis = analyzeResult(result);
      const a = agg[def.id];
      a.battles++;
      if (result.winner === 'player') a.wins++;
      else if (result.winner === 'draw') a.draws++;
      const inst = Object.values(analysis.perUnit)[0];
      if (inst) {
        a.damageDealt         += inst.damageDealt;
        a.damageTaken         += inst.damageTaken;
        a.kills               += inst.kills;
        a.deaths              += inst.deaths;
        a.reanimates          += inst.reanimates;
        if (inst.survivalRounds != null) {
          a.survivalRoundsSum   += inst.survivalRounds;
          a.survivalRoundsCount += 1;
        }
      }
      prog.tick();
    }
    comparison++;
  }

  const rows = Object.values(agg).map((a) => ({
    unitId:          a.unitId,
    tier:            a.tier,
    class:           a.class,
    faction:         a.faction,
    battles:         a.battles,
    winRate:         (a.wins / a.battles * 100).toFixed(1),
    avgDmgDealt:     (a.damageDealt / a.battles).toFixed(1),
    avgDmgTaken:     (a.damageTaken / a.battles).toFixed(1),
    avgKills:        (a.kills / a.battles).toFixed(2),
    avgDeaths:       (a.deaths / a.battles).toFixed(2),
    avgReanimates:   (a.reanimates / a.battles).toFixed(2),
    avgSurvivalRounds: a.survivalRoundsCount > 0
      ? (a.survivalRoundsSum / a.survivalRoundsCount).toFixed(1) : 'N/A',
  }));

  const csvPath = join(dir, 'unit-stats.csv');
  writeCsv(csvPath, rows, ['unitId','tier','class','faction','battles','winRate',
    'avgDmgDealt','avgDmgTaken','avgKills','avgDeaths','avgReanimates','avgSurvivalRounds']);
  prog.done(csvPath);
  return { rows };
}

// ─── Subcommand: matchup-matrix ─────────────────────────────────────────────

async function cmdMatchupMatrix({ reps = 50, dir }) {
  const SEED_BASE = seedBase + 200_000;
  const pairs = [...allPairs({ pool, teamSize: 1 })];
  const total = pairs.length * reps * 2; // ×2 for side-swap
  const prog = makeProgress('matchup-matrix', total);

  // matrix[playerUnitId][enemyUnitId] = { aWins, total }
  const matrix = {};
  for (const def of pool) matrix[def.id] = {};

  const jsonlPath = join(dir, 'raw-runs.jsonl');
  let comparison = 0;
  for (const [pDefs, eDefs] of pairs) {
    const aId = pDefs[0].id;
    const bId = eDefs[0].id;
    let aWins = 0, draws = 0, total2 = 0;
    for (let r = 0; r < reps; r++) {
      const base = SEED_BASE + comparison * reps * 2 + r * 2;
      const pr = runPair(
        stampTeam([pool.find((u) => u.id === aId)], 'p'),
        stampTeam([pool.find((u) => u.id === bId)], 'e'),
        base,
      );
      aWins  += pr.aWins;
      draws  += pr.draws;
      total2 += pr.total;
      prog.tick(pr.total);
      appendJsonl(jsonlPath, {
        sub: 'matchup-matrix', seedBase: base,
        player: aId, enemy: bId,
        aWins: pr.aWins, draws: pr.draws, battles: pr.total,
      });
    }
    matrix[aId][bId] = { aWins, draws, total: total2 };
    comparison++;
  }

  // Write NxN CSV
  const unitIds = pool.map((u) => u.id);
  const csvRows = unitIds.map((aId) => {
    const row = { 'player\\enemy': aId };
    for (const bId of unitIds) {
      const cell = matrix[aId][bId];
      row[bId] = cell ? (cell.aWins / cell.total * 100).toFixed(1) : '-';
    }
    return row;
  });
  const csvPath = join(dir, 'unit-matchup-matrix.csv');
  writeCsv(csvPath, csvRows, ['player\\enemy', ...unitIds]);
  prog.done(csvPath);
  return { matrix, unitIds };
}

// ─── Subcommand: class-synergy ───────────────────────────────────────────────

async function cmdClassSynergy({ reps = 100, dir }) {
  const SEED_BASE = seedBase + 500_000;
  const classes = [...new Set(pool.map((u) => u.class))].filter(Boolean);
  const total = classes.length * reps * 2;
  const prog = makeProgress('class-synergy', total);

  const results = [];
  let comparison = 0;
  for (const cls of classes) {
    let aWins = 0, draws = 0, totalBattles = 0;
    for (let r = 0; r < reps; r++) {
      const base = SEED_BASE + comparison * reps * 2 + r * 2;
      const rngA = new RNG(base);
      const rngB = new RNG(base + 1);
      const themed = themedTeam({ theme: `class:${cls}`, pool, fillerPool: pool, rng: rngA, teamId: 'p' });
      const mixed  = randomTeam({ pool, rng: rngB, teamId: 'e' });
      const pr = runPair(themed, mixed, base);
      aWins  += pr.aWins;
      draws  += pr.draws;
      totalBattles += pr.total;
      prog.tick(pr.total);
    }
    const wr = aWins / totalBattles * 100;
    results.push({ theme: `class:${cls}`, winRate: wr.toFixed(1), delta: (wr - 50).toFixed(1),
      samples: totalBattles, flagged: Math.abs(wr - 50) > 10 ? '← flagged' : '' });
    comparison++;
  }

  const md = _synergyMd('Class Synergy', results, 'Themed (class) team vs mixed control, side-swapped pairs');
  const mdPath = join(dir, 'class-synergy-report.md');
  writeMarkdown(mdPath, md);
  prog.done(mdPath);
  return { results };
}

// ─── Subcommand: faction-synergy ─────────────────────────────────────────────

async function cmdFactionSynergy({ reps = 100, dir }) {
  const SEED_BASE = seedBase + 600_000;
  const factions = [...new Set(pool.map((u) => u.faction))].filter(Boolean);
  const total = factions.length * reps * 2;
  const prog = makeProgress('faction-synergy', total);

  const results = [];
  let comparison = 0;
  for (const fac of factions) {
    let aWins = 0, draws = 0, totalBattles = 0;
    for (let r = 0; r < reps; r++) {
      const base = SEED_BASE + comparison * reps * 2 + r * 2;
      const rngA = new RNG(base);
      const rngB = new RNG(base + 1);
      const themed = themedTeam({ theme: `faction:${fac}`, pool, fillerPool: pool, rng: rngA, teamId: 'p' });
      const mixed  = randomTeam({ pool, rng: rngB, teamId: 'e' });
      const pr = runPair(themed, mixed, base);
      aWins  += pr.aWins;
      draws  += pr.draws;
      totalBattles += pr.total;
      prog.tick(pr.total);
    }
    const wr = aWins / totalBattles * 100;
    results.push({ theme: `faction:${fac}`, winRate: wr.toFixed(1), delta: (wr - 50).toFixed(1),
      samples: totalBattles, flagged: Math.abs(wr - 50) > 10 ? '← flagged' : '' });
    comparison++;
  }

  const md = _synergyMd('Faction Synergy', results, 'Themed (faction) team vs mixed control, side-swapped pairs');
  const mdPath = join(dir, 'faction-synergy-report.md');
  writeMarkdown(mdPath, md);
  prog.done(mdPath);
  return { results };
}

// ─── Subcommand: merchant-impact ─────────────────────────────────────────────

async function cmdMerchantImpact({ reps = 200, dir }) {
  const SEED_BASE = seedBase + 700_000;
  const merchants = getMerchants().filter((m) => getMerchantFavor(m));
  const total = merchants.length * reps * 4; // 4 runs per rep (with/without × 2 sides)
  const prog = makeProgress('merchant-impact', total);

  const results = [];
  let comparison = 0;
  for (const merchant of merchants) {
    const favor = getMerchantFavor(merchant);
    let withWins = 0, withoutWins = 0, withTotal = 0, withoutTotal = 0;

    for (let r = 0; r < reps; r++) {
      const base = SEED_BASE + comparison * reps * 4 + r * 4;
      const rngA = new RNG(base);
      const rngB = new RNG(base + 1);
      const teamA = randomTeam({ pool, rng: rngA, teamId: 'p' });
      const teamB = randomTeam({ pool, rng: rngB, teamId: 'e' });

      // WITH favor (favor travels with the team on both sides)
      const prWith = runPair(teamA, teamB, base, { aFavor: favor });
      withWins  += prWith.aWins;
      withTotal += prWith.total;
      prog.tick(prWith.total);

      // WITHOUT favor — same composition, same seeds +2
      const rngC = new RNG(base + 2);
      const rngD = new RNG(base + 3);
      const teamC = randomTeam({ pool, rng: rngC, teamId: 'p' });
      const teamD = randomTeam({ pool, rng: rngD, teamId: 'e' });
      const prWithout = runPair(teamC, teamD, base + 2);
      withoutWins  += prWithout.aWins;
      withoutTotal += prWithout.total;
      prog.tick(prWithout.total);
    }

    const wrWith    = withWins    / withTotal    * 100;
    const wrWithout = withoutWins / withoutTotal * 100;
    results.push({
      merchant: merchant.name,
      favor: `${favor.kind}:${favor.name}`,
      wrWith:    wrWith.toFixed(1),
      wrWithout: wrWithout.toFixed(1),
      delta:     (wrWith - wrWithout).toFixed(1),
      samplesEach: withTotal,
    });
    comparison++;
  }

  const header = '| Merchant | Favor | WR with | WR without | Delta | Samples |';
  const sep    = '|---|---|---|---|---|---|';
  const rows   = results.map((r) =>
    `| ${r.merchant} | ${r.favor} | ${r.wrWith}% | ${r.wrWithout}% | ${r.delta} | ${r.samplesEach} |`
  );
  const md = `# Merchant Favor Impact\n\n${[header, sep, ...rows].join('\n')}\n\n*Side-swapped pairs. Delta = WR-with minus WR-without.*\n`;
  const mdPath = join(dir, 'merchant-impact-report.md');
  writeMarkdown(mdPath, md);
  prog.done(mdPath);
  return { results };
}

// ─── Subcommand: archetype-matrix ────────────────────────────────────────────
//
// Round-robin between predefined 5v5 archetypes (mono-class, mono-faction,
// balanced, random baseline). Cheaper and more direct than team-random for
// confirming which archetypes dominate after a tuning pass — random teams
// rarely activate synergies, so they understate the gap between committed
// compositions. Reps re-roll the filler/picks each comparison so a single
// pair averages over many distinct teams.

function _buildArchetypes() {
  const classes  = [...new Set(pool.map((u) => u.class))].filter(Boolean);
  const factions = [...new Set(pool.map((u) => u.faction))].filter(Boolean);
  const archetypes = [];
  for (const cls of classes) archetypes.push({ id: `mono-class:${cls}`,    theme: `class:${cls}` });
  for (const fac of factions) archetypes.push({ id: `mono-faction:${fac}`, theme: `faction:${fac}` });
  archetypes.push({ id: 'balanced-2-2-1', theme: 'balanced-2-2-1' });
  archetypes.push({ id: 'random',         theme: 'mixed' });
  return archetypes;
}

async function cmdArchetypeMatrix({ reps = 60, dir }) {
  const SEED_BASE = seedBase + 800_000;
  const archetypes = _buildArchetypes();
  const pairs = archetypes.length * archetypes.length;
  const total = pairs * reps * 2; // ×2 for side-swap inside runPair
  const prog = makeProgress('archetype-matrix', total);

  // matrix[aId][bId] = { aWins, draws, total }
  const matrix = {};
  for (const a of archetypes) {
    matrix[a.id] = {};
    for (const b of archetypes) matrix[a.id][b.id] = { aWins: 0, draws: 0, total: 0 };
  }

  let comparison = 0;
  for (const a of archetypes) {
    for (const b of archetypes) {
      for (let r = 0; r < reps; r++) {
        const base = SEED_BASE + comparison * reps * 2 + r * 2;
        const rngA = new RNG(base);
        const rngB = new RNG(base + 1);
        const teamA = themedTeam({ theme: a.theme, pool, fillerPool: pool, rng: rngA, teamId: 'p' });
        const teamB = themedTeam({ theme: b.theme, pool, fillerPool: pool, rng: rngB, teamId: 'e' });
        const pr = runPair(teamA, teamB, base);
        matrix[a.id][b.id].aWins  += pr.aWins;
        matrix[a.id][b.id].draws  += pr.draws;
        matrix[a.id][b.id].total  += pr.total;
        prog.tick(pr.total);
      }
      comparison++;
    }
  }

  // Per-archetype average WR vs everyone (excluding self-mirror — symmetric and
  // always near 50% with side-swap, but it dilutes the signal).
  const avgWr = {};
  for (const a of archetypes) {
    let wins = 0, totalBattles = 0;
    for (const b of archetypes) {
      if (a.id === b.id) continue;
      const cell = matrix[a.id][b.id];
      wins += cell.aWins;
      totalBattles += cell.total;
    }
    avgWr[a.id] = totalBattles > 0 ? (wins / totalBattles * 100) : 50;
  }

  // CSV: aId × bId WR%
  const ids = archetypes.map((a) => a.id);
  const csvRows = ids.map((aId) => {
    const row = { 'A\\B': aId };
    for (const bId of ids) {
      const cell = matrix[aId][bId];
      row[bId] = cell.total > 0 ? (cell.aWins / cell.total * 100).toFixed(1) : '-';
    }
    return row;
  });
  const csvPath = join(dir, 'archetype-matrix.csv');
  writeCsv(csvPath, csvRows, ['A\\B', ...ids]);

  // Markdown summary: avg WR table + flagged dominators
  const sorted = [...archetypes].sort((a, b) => avgWr[b.id] - avgWr[a.id]);
  const summaryRows = sorted.map((a) => {
    const wr = avgWr[a.id];
    const flag = wr > 60 ? '← dominant' : wr < 40 ? '← weak' : '';
    return `| ${a.id} | ${wr.toFixed(1)}% | ${(wr - 50).toFixed(1)} | ${flag} |`;
  });
  const md = [
    '# Archetype Matrix (5v5)',
    '',
    `*${archetypes.length} archetypes × round-robin × ${reps} reps × side-swap = ${total.toLocaleString()} battles.*`,
    `*Theme picks re-rolled per rep, so each cell averages over distinct teams sharing the same composition rule.*`,
    '',
    '## Average WR (vs all other archetypes, mirror excluded)',
    '',
    '| Archetype | Avg WR | Delta | |',
    '|---|---|---|---|',
    ...summaryRows,
    '',
    `Full pairwise grid: [archetype-matrix.csv](./archetype-matrix.csv)`,
  ].join('\n');
  const mdPath = join(dir, 'archetype-matrix-report.md');
  writeMarkdown(mdPath, md);
  prog.done(mdPath);
  return { matrix, archetypes, avgWr };
}

// ─── Subcommand: full ────────────────────────────────────────────────────────

async function cmdFull() {
  const dir = hasFlag('--out')
    ? resolve(outArg)
    : makeReportDir(join(ROOT, 'reports', 'balance'), 'full');

  const started = Date.now();
  console.log(`[Balance] full starting — output: ${dir}`);

  const r1 = await cmdPerUnit({         reps: repsArg || 200,  dir });
  const r2 = await cmdMatchupMatrix({   reps: repsArg || 50,   dir });
  const r3 = await cmdClassSynergy({    reps: repsArg || 100,  dir });
  const r4 = await cmdFactionSynergy({  reps: repsArg || 100,  dir });
  const r5 = await cmdMerchantImpact({  reps: repsArg || 200,  dir });
  const r6 = await cmdArchetypeMatrix({ reps: repsArg || 60,   dir });

  // Write summary.md
  const duration = ((Date.now() - started) / 1000 / 60).toFixed(1);
  const totalBattles = (pool.length * (repsArg || 200)) +
    (r2.unitIds.length ** 2 * (repsArg || 50) * 2) +
    (r3.results.reduce((s, x) => s + parseInt(x.samples), 0)) +
    (r4.results.reduce((s, x) => s + parseInt(x.samples), 0)) +
    (r5.results.reduce((s, x) => s + x.samplesEach * 2, 0)) +
    (r6.archetypes.length ** 2 * (repsArg || 60) * 2);

  // Outliers: derive from matchup-matrix average win rate across all opponents,
  // not mirror matches (mirrors always draw for symmetric units).
  const avgWrByUnit = {};
  for (const aId of r2.unitIds) {
    let wins = 0, total = 0;
    for (const bId of r2.unitIds) {
      const cell = r2.matrix[aId]?.[bId];
      if (cell) { wins += cell.aWins; total += cell.total; }
    }
    avgWrByUnit[aId] = total > 0 ? (wins / total * 100) : 50;
  }
  const unitMeta = Object.fromEntries(r1.rows.map((r) => [r.unitId, r]));
  const outliers = r2.unitIds
    .map((id) => ({ id, wr: avgWrByUnit[id], meta: unitMeta[id] }))
    .filter((x) => Math.abs(x.wr - 50) > 10)
    .sort((a, b) => Math.abs(b.wr - 50) - Math.abs(a.wr - 50))
    .slice(0, 10);

  const outTable = outliers.length > 0
    ? ['| Unit | Tier | Class | Faction | Avg WR vs All | |',
       '|---|---|---|---|---|---|',
       ...outliers.map((x) => {
         const m = x.meta ?? {};
         const flag = x.wr > 60 ? '← over' : x.wr < 40 ? '← under' : '';
         return `| ${x.id} | ${m.tier ?? '?'} | ${m.class ?? '?'} | ${m.faction ?? '?'} | ${x.wr.toFixed(1)}% | ${flag} |`;
       })
      ].join('\n')
    : '*No outliers detected (all units within ±10% of 50%).*';

  const synergyRows = [...r3.results, ...r4.results]
    .map((r) => `| ${r.theme} | ${r.winRate}% | ${r.delta} | ${r.samples} | ${r.flagged} |`);
  const synergyTable = [
    '| Theme | Win Rate | Delta | Samples | |',
    '|---|---|---|---|---|',
    ...synergyRows,
  ].join('\n');

  const merchantRows = r5.results.map((r) =>
    `| ${r.merchant} | ${r.favor} | ${r.wrWith}% | ${r.wrWithout}% | ${r.delta} |`
  );
  const merchantTable = [
    '| Merchant | Favor | WR with | WR without | Delta |',
    '|---|---|---|---|---|',
    ...merchantRows,
  ].join('\n');

  const archetypeRows = [...r6.archetypes]
    .sort((a, b) => r6.avgWr[b.id] - r6.avgWr[a.id])
    .map((a) => {
      const wr = r6.avgWr[a.id];
      const flag = wr > 60 ? '← dominant' : wr < 40 ? '← weak' : '';
      return `| ${a.id} | ${wr.toFixed(1)}% | ${(wr - 50).toFixed(1)} | ${flag} |`;
    });
  const archetypeTable = [
    '| Archetype | Avg WR | Delta | |',
    '|---|---|---|---|',
    ...archetypeRows,
  ].join('\n');

  const summary = [
    `# Balance Report`,
    ``,
    `**Total battles:** ~${totalBattles.toLocaleString()}  |  **Duration:** ${duration}min  |  **Seed base:** ${seedBase}  |  **Pool:** ${pool.length} units`,
    ``,
    `## Outlier units (avg win rate across all matchups, ±10% threshold)`,
    ``,
    outTable,
    ``,
    `## Synergy deltas (themed vs mixed control, side-swapped)`,
    ``,
    synergyTable,
    ``,
    `## Archetype matrix (5v5, mirror excluded)`,
    ``,
    archetypeTable,
    ``,
    `## Merchant favor impact`,
    ``,
    merchantTable,
    ``,
    `## Files`,
    ``,
    `- [unit-stats.csv](./unit-stats.csv)`,
    `- [unit-matchup-matrix.csv](./unit-matchup-matrix.csv)`,
    `- [class-synergy-report.md](./class-synergy-report.md)`,
    `- [faction-synergy-report.md](./faction-synergy-report.md)`,
    `- [merchant-impact-report.md](./merchant-impact-report.md)`,
    `- [archetype-matrix-report.md](./archetype-matrix-report.md)`,
    `- [archetype-matrix.csv](./archetype-matrix.csv)`,
    `- [raw-runs.jsonl](./raw-runs.jsonl) — matchup-matrix only`,
  ].join('\n');

  const summaryPath = join(dir, 'summary.md');
  writeMarkdown(summaryPath, summary);
  console.log(`[Balance] full complete — ${duration}min — ${dir}`);
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const reportDir = subArg !== 'full'
  ? makeReportDir(join(ROOT, 'reports', 'balance'), subArg)
  : null; // full creates its own dir

switch (subArg) {
  case 'per-unit':
    await cmdPerUnit({ reps: repsArg || 200, dir: reportDir });
    break;
  case 'matchup-matrix':
    await cmdMatchupMatrix({ reps: repsArg || 50, dir: reportDir });
    break;
  case 'class-synergy':
    await cmdClassSynergy({ reps: repsArg || 100, dir: reportDir });
    break;
  case 'faction-synergy':
    await cmdFactionSynergy({ reps: repsArg || 100, dir: reportDir });
    break;
  case 'merchant-impact':
    await cmdMerchantImpact({ reps: repsArg || 200, dir: reportDir });
    break;
  case 'archetype-matrix':
    await cmdArchetypeMatrix({ reps: repsArg || 60, dir: reportDir });
    break;
  case 'full':
    await cmdFull();
    break;
  default:
    console.error(`[Balance] ERROR: unknown subcommand "${subArg}". Run with "help" for usage.`);
    process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _synergyMd(title, results, subtitle) {
  const header = '| Theme | Win Rate | Delta | Samples | |';
  const sep    = '|---|---|---|---|---|';
  const rows   = results.map((r) =>
    `| ${r.theme} | ${r.winRate}% | ${r.delta} | ${r.samples} | ${r.flagged} |`
  );
  return `# ${title}\n\n*${subtitle}*\n\n${[header, sep, ...rows].join('\n')}\n`;
}
