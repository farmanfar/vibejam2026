// Seed the Supabase ghost_snapshots table with synthetic opponent teams so
// that early players match against varied ghosts instead of always falling
// through to the synthetic-AI generator.
//
// Strategy:
//   - One shared bot auth user owns every seeded snapshot (identified by a
//     stable email so re-runs find the same user). Real players always have
//     a different player_id, so they will match these ghosts via the
//     `.neq('player_id', playerId)` filter in GhostManager.fetchOpponent.
//   - Wipes existing rows owned by the bot before re-inserting, so this
//     script is idempotent. Pass --no-clean to keep prior seeds.
//   - Uses the SUPABASE_SERVICE_ROLE_KEY (NOT VITE_*) so we bypass RLS and
//     can write on behalf of the bot. The key must never reach the browser.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=... npm run seed:ghosts
//   SUPABASE_SERVICE_ROLE_KEY=... npm run seed:ghosts -- --count=200 --seed=42

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

import { RNG } from '../src/systems/combat/RNG.js';
import { themedTeam, randomTeam } from './lib/team-generator.mjs';
import { loadAlphaUnits } from './lib/load-alpha-units.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const BOT_EMAIL = 'ghost-bot-seed@hiredswords.local';
const BOT_PASSWORD = randomUUID(); // never used for sign-in; admin API creates the user directly

const NICKNAMES = [
  'jonx4555', 'shopdrunk', 'crit_andy', 'merchant_mike', 'gnatfan',
  'rerollking', 'bigbuyer', 'samuraisam', 'lockedin', 'goldhoarder',
  'cloakerbro', 'snippergg', 'electrofan', 'minionmom', 'hogboi',
  'archerace', 'samuraidad', 'sloppergod', 'tribechad', 'guardianhrt',
  'ancientvibe', 'voidwarden', 'thornlord', 'orbsentinel', 'warrigjr',
  'swordlife', 'daggerlord', 'shopgremlin', 'tier3only', 'tier1diff',
  'noreroll', 'allreroll', 'sellsoul', 'fivestar', 'bench_warmer',
  'comboqueen', 'flexbench', 'metaslave', 'jankenjoyer', 'lategamer',
  'earlyrush', 'midcurve', 'pivotlord', 'samewinrate', 'streakgod',
  'losslord', 'champ4lyf', 'unranked', 'freelo', 'farmboi',
  'twoboi', 'hexagon7', 'pixelpeach', 'darktech', 'm5x7gang',
  'crtfan', 'parallaxguy', 'shaderwiz', 'normalmap', 'vibejam2k26',
  'sap_andy', 'tft_jonx', 'underlord', 'autobattle', 'autochessmom',
];

function parseArgs(argv) {
  const args = { count: 100, seed: 1, clean: true };
  for (const a of argv) {
    if (a === '--no-clean') args.clean = false;
    else if (a.startsWith('--count=')) args.count = parseInt(a.slice(8), 10);
    else if (a.startsWith('--seed=')) args.seed = parseInt(a.slice(7), 10);
  }
  return args;
}

function readEnvFile() {
  // .env is gitignored and stays on this machine. Vite only inlines vars with
  // VITE_ prefix into the client bundle, so SUPABASE_SERVICE_ROLE_KEY is safe
  // to live here alongside the URL.
  const envPath = join(REPO_ROOT, '.env');
  return readFileSync(envPath, 'utf8');
}

function getEnvVar(raw, name) {
  const match = raw.match(new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function getSupabaseUrl(raw) {
  const url = getEnvVar(raw, 'VITE_SUPABASE_URL');
  if (!url) throw new Error('VITE_SUPABASE_URL not found in .env');
  return url;
}

function getServiceKey(raw) {
  // Prefer the env var (one-shot inline runs); fall back to .env so users
  // don't have to re-export the secret on every invocation.
  return process.env.SUPABASE_SERVICE_ROLE_KEY || getEnvVar(raw, 'SUPABASE_SERVICE_ROLE_KEY');
}

async function ensureBotUser(client) {
  // listUsers returns at most 1000 by default. For one well-known bot user
  // that is more than enough.
  const { data: list, error: listErr } = await client.auth.admin.listUsers();
  if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
  const existing = list.users.find((u) => u.email === BOT_EMAIL);
  if (existing) {
    console.log(`[Seed] Bot user already exists: ${existing.id}`);
    return existing.id;
  }
  const { data: created, error: createErr } = await client.auth.admin.createUser({
    email: BOT_EMAIL,
    password: BOT_PASSWORD,
    email_confirm: true,
    user_metadata: { kind: 'ghost-seeder-bot' },
  });
  if (createErr) throw new Error(`createUser failed: ${createErr.message}`);
  console.log(`[Seed] Created bot user: ${created.user.id}`);
  return created.user.id;
}

async function wipeBotSnapshots(client, botId) {
  const { error, count } = await client
    .from('ghost_snapshots')
    .delete({ count: 'exact' })
    .eq('player_id', botId);
  if (error) throw new Error(`wipe failed: ${error.message}`);
  console.log(`[Seed] Wiped ${count ?? 0} prior bot snapshots`);
}

// Distribution of seeded ghosts across W/L buckets. Weighted toward
// early-game records since most match queries come from new runs. Each
// entry is [wins, losses, weight, stage]. Stage is approximate — the
// matchmaking query keys on (wins, losses) only.
const BUCKETS = [
  [0, 0, 8, 1],   [1, 0, 12, 2],  [2, 0, 14, 3],  [3, 0, 14, 4],
  [4, 0, 12, 5],  [5, 0, 10, 6],  [6, 0, 8, 7],   [7, 0, 6, 8],
  [8, 0, 4, 9],   [9, 0, 3, 10],  [10, 0, 2, 11],
  [1, 1, 6, 3],   [2, 1, 6, 4],   [3, 1, 5, 5],   [4, 1, 4, 6],
  [5, 1, 3, 7],   [2, 2, 4, 5],   [3, 2, 3, 6],   [5, 2, 2, 8],
  [7, 2, 1, 10],  [3, 3, 2, 7],   [5, 3, 1, 9],
];

function pickBucket(rng) {
  const total = BUCKETS.reduce((sum, b) => sum + b[2], 0);
  let r = rng.next() * total;
  for (const b of BUCKETS) {
    r -= b[2];
    if (r <= 0) return b;
  }
  return BUCKETS[BUCKETS.length - 1];
}

const THEMES = [
  'mixed', 'mixed', 'mixed', // mixed weighted higher
  'class:Knight', 'class:Assassin', 'class:Ancient', 'class:Berserker',
  'class:Grunt', 'class:Gunner', 'class:Tank',
  'faction:Robot', 'faction:Folk', 'faction:Monster',
  'balanced-2-2-1',
];

function generateRoster(rng, pool, theme, size) {
  // Try the requested theme; if filter empties the pool (e.g. no Berserkers
  // among enabled units), fall back to a random team rather than crashing.
  try {
    return themedTeam({ theme, pool, fillerPool: pool, rng, size, teamId: 'g' });
  } catch (e) {
    return randomTeam({ size, pool, rng, teamId: 'g' });
  }
}

function rosterToSnapshot(stamped, rng, stage) {
  // Snapshot only what GhostManager.filterToAlphaRoster cares about: id, hp,
  // atk. Add minor stage-scaled stat bumps so high-W ghosts feel stronger.
  const bump = Math.max(0, stage - 2);
  return stamped.map((u) => ({
    id: u.id,
    hp: Math.max(1, (u.hp ?? 1) + rng.int(0, bump)),
    atk: Math.max(1, (u.atk ?? 1) + rng.int(0, Math.floor(bump / 2))),
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const envRaw = readEnvFile();
  const SERVICE_KEY = getServiceKey(envRaw);
  if (!SERVICE_KEY) {
    console.error('\n[Seed] ✗ SUPABASE_SERVICE_ROLE_KEY not found.');
    console.error('Find it at: Supabase Dashboard → Project Settings → API → Secret keys (sb_secret_...).');
    console.error('\nAdd it to .env (preferred):');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=sb_secret_...');
    console.error('Or pass inline:');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=sb_secret_... npm run seed:ghosts\n');
    process.exit(1);
  }

  const SUPABASE_URL = getSupabaseUrl(envRaw);
  console.log(`[Seed] Supabase URL: ${SUPABASE_URL}`);
  console.log(`[Seed] Plan: insert ${args.count} ghosts, seed=${args.seed}, clean=${args.clean}`);

  const client = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const botId = await ensureBotUser(client);
  if (args.clean) await wipeBotSnapshots(client, botId);

  const allUnits = loadAlphaUnits();
  const pool = allUnits.filter((u) => u.art_status !== 'blocked');
  console.log(`[Seed] Unit pool: ${pool.length} enabled (of ${allUnits.length})`);

  const rng = new RNG(args.seed);
  const rows = [];
  for (let i = 0; i < args.count; i++) {
    const [wins, losses, _w, stage] = pickBucket(rng);
    const theme = rng.pick(THEMES);
    const stamped = generateRoster(rng, pool, theme, 5);
    const roster = rosterToSnapshot(stamped, rng, stage);
    const nickname = rng.pick(NICKNAMES) + (rng.int(0, 99)).toString().padStart(2, '0');
    rows.push({
      player_id: botId,
      run_id: randomUUID(),
      wins,
      losses,
      stage,
      roster,
      team_size: roster.length,
      nickname,
    });
  }

  // Insert in chunks of 100 to keep request size sane.
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await client.from('ghost_snapshots').insert(slice);
    if (error) throw new Error(`insert chunk ${i / CHUNK} failed: ${error.message}`);
    inserted += slice.length;
    console.log(`[Seed] Inserted ${inserted}/${rows.length}`);
  }

  // Print a small sample so you can sanity-check what got stored.
  console.log('\n[Seed] Sample of inserted ghosts:');
  for (const row of rows.slice(0, 5)) {
    const ids = row.roster.map((r) => r.id).join(', ');
    console.log(`  ${row.wins}W-${row.losses}L  "${row.nickname}"  [${ids}]`);
  }
  console.log(`\n[Seed] ✓ Done. Inserted ${inserted} ghosts owned by bot ${botId}.`);
}

main().catch((e) => {
  console.error('[Seed] ✗ Fatal:', e.message);
  process.exit(1);
});
