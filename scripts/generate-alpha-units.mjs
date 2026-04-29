#!/usr/bin/env node
// Alpha unit generator. Reads every .md in design/units/ and produces
// src/config/alpha-units.generated.json.
//
// Also applies stat overrides from src/config/alpha-balance-overrides.json
// and maps unit IDs to ability_ids (the generator IS the runtime-to-prose
// bridge since markdown doesn't declare ability_ids in frontmatter).
//
// Usage:  node scripts/generate-alpha-units.mjs

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const UNITS_DIR = join(ROOT, 'design', 'units');
const OUT_FILE = join(ROOT, 'src', 'config', 'alpha-units.generated.json');
const OVERRIDES_FILE = join(ROOT, 'src', 'config', 'alpha-balance-overrides.json');

// ---------- ability mapping ----------
// The only place where unit IDs are mapped to ability handler IDs. Update
// this when a new unit gets a handler. 'null' = TBD / statline-only.
const ABILITY_MAP = {
  dagger_mush: 'ricochet_volley',
  caged_shocker: 'spiteful_demise',
  assassin: 'sweeping_strikes',
  blood_king: 'heart_slam_on_death',
  archer_bandit: 'snipers_venom',
  archer: 'death_defying',
  electrocutioner: 'piercing_bolt',
  gnat: 'infectious_bite',
  hog_knight: 'ricochet_shot',
  minion_002: 'volatile_payload',
  minion_003: 'lobbed_bolt',
  relic_guardian_3: 'reactive_reinforcement',
  starter_warrior: 'sacrifice_pass',
  tribal_chopper: 'bloodlust',
  valiant: 'kill_piercing',
  // Vanilla units (class/faction mechanics only)
  dagger_bandit: null,
  dark_mec: null,
  ghoul: null,
  glitch_samurai: null,
  colossal_boss: null,
  ancient_guardian: null,
  bloat_flyer: null,
  minion_001: null,
  // TBD statline-only
  slopper: null,
  snipper: null,
  blaster_bot: null,
  lone_star: null,
};

// One-line rules text shown on the shop card (bottom half, revealed on hover).
// Keep each entry short enough to wrap to ~3 lines at 7px font in a ~108px column.
// `null` (or missing) → card shows "-" placeholder.
const RULES_TEXT = {
  dagger_mush: 'On entering combat, throws a dagger at the backmost enemy for 1 damage.',
  caged_shocker: 'On death, deals 1 damage to a random enemy.',
  assassin: 'Attacks the 3 frontmost enemies for 1 damage each, simultaneously.',
  blood_king: 'On death, deals 1 + Resonance to every living enemy.',
  archer_bandit: 'Battle start: applies 1 poison to every enemy. Cannot attack normally.',
  archer: 'Hits all enemies for 1 + Resonance. Survives first lethal hit once.',
  electrocutioner: 'Attacks pierce the first 2 enemies in line.',
  gnat: 'On attack, 50% chance to apply 5 poison instead of 1.',
  hog_knight: 'When any enemy dies, fires a 1-damage shot at the next enemy.',
  minion_002: 'On death, deals 2 damage to the opponent front unit.',
  minion_003: 'Ranged attacker. Lobs single-target bolts up to 3 tiles away.',
  relic_guardian_3: 'When another allied Robot dies, gain +1 ATK permanently.',
  starter_warrior: 'On death, grants +1 ATK to the unit directly behind.',
  tribal_chopper: 'On killing an enemy with a normal attack, attack again immediately.',
  valiant: 'On kill, attack pierces and deals current ATK to the next enemy.',
};

// Units whose basic attack should stay single-target even though their class
// has an onAction override (Blood King is an Ancient, but basic = single-target).
const BASIC_ATTACK_OVERRIDE = {
  blood_king: 'single_target',
};

// Units that skip normal combat rounds entirely (utility only).
const SKIP_BASIC_ATTACK = {
  archer_bandit: true,
};

// Art status overrides for units whose sprites are known-broken.
const ART_STATUS = {
  caged_shocker: 'blocked',
  blaster_bot: 'blocked',
  lone_star: 'blocked',
  starter_warrior: 'blocked',
  valiant: 'blocked',
};

// ---------- YAML frontmatter parser ----------
function parseFrontmatter(src) {
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const raw = match[1];
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    // Coerce numerics.
    const num = Number(val);
    out[key] = isNaN(num) || val === '' ? val : num;
  }
  return out;
}

// ---------- main ----------
function main() {
  const files = readdirSync(UNITS_DIR)
    .filter((f) => f.endsWith('.md') && f !== 'README.md' && f !== 'CLAUDE.md');

  // Load balance overrides.
  let overrides = {};
  try {
    overrides = JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8'));
    console.log(`[generator] Loaded balance overrides for: ${Object.keys(overrides).join(', ')}`);
  } catch {
    console.log('[generator] No alpha-balance-overrides.json found — using raw stats.');
  }

  const units = [];
  const warnings = [];

  for (const file of files) {
    const src = readFileSync(join(UNITS_DIR, file), 'utf8');
    const fm = parseFrontmatter(src);
    if (!fm || !fm.id) {
      warnings.push(`[WARN] ${file}: could not parse frontmatter or missing id — skipped`);
      continue;
    }
    const id = fm.id;
    if (!(id in ABILITY_MAP)) {
      warnings.push(`[WARN] ${id}: not in ABILITY_MAP — added as statline-only`);
    }

    const ability_id = ABILITY_MAP[id] ?? null;
    const ov = overrides[id] ?? {};

    const unit = {
      id,
      name: fm.name || id,
      faction: fm.faction || 'Unknown',
      class: fm.class || 'Unknown',
      tier: fm.tier ?? 1,
      hp: ov.hp ?? fm.hp ?? 1,
      atk: ov.atk ?? fm.attack ?? 1,
      range: fm.range ?? 1,
      ability_id,
      rules_text: RULES_TEXT[id] ?? null,
      skipBasicAttack: SKIP_BASIC_ATTACK[id] ?? false,
      art_status: ART_STATUS[id] ?? 'ok',
    };
    if (BASIC_ATTACK_OVERRIDE[id]) {
      unit.basicAttackOverride = BASIC_ATTACK_OVERRIDE[id];
    }
    units.push(unit);
  }

  // Sort by id for deterministic output.
  units.sort((a, b) => a.id.localeCompare(b.id));

  // Report.
  const withAbility = units.filter((u) => u.ability_id !== null);
  const vanilla = units.filter((u) => u.ability_id === null && !['slopper', 'snipper', 'blaster_bot', 'lone_star'].includes(u.id));
  const tbd = units.filter((u) => ['slopper', 'snipper', 'blaster_bot', 'lone_star'].includes(u.id));
  const artBlocked = units.filter((u) => u.art_status === 'blocked');

  console.log(`\n[generator] ========================================`);
  console.log(`[generator] ${units.length} units parsed total`);
  console.log(`[generator] ${withAbility.length} with unique ability handlers`);
  console.log(`[generator] ${vanilla.length} vanilla (class/faction only)`);
  console.log(`[generator] ${tbd.length} TBD statline-only: ${tbd.map((u) => u.id).join(', ')}`);
  console.log(`[generator] ${artBlocked.length} art BLOCKED: ${artBlocked.map((u) => u.id).join(', ')}`);

  if (warnings.length) {
    console.log('\n[generator] WARNINGS:');
    warnings.forEach((w) => console.log(` ${w}`));
  }

  // Special known issue: assassin.md has class: Knight in frontmatter.
  // Per grill pass, the assassin unit should be class: Assassin.
  // The doc was not updated in Phase 0 — flagging here so user can correct.
  const assassinUnit = units.find((u) => u.id === 'assassin');
  if (assassinUnit && assassinUnit.class === 'Knight') {
    console.log(`\n[generator] ⚠️  assassin (${assassinUnit.name}) has class:Knight in frontmatter`);
    console.log('[generator]    Per grill pass, this unit should be class:Assassin.');
    console.log('[generator]    Edit design/units/assassin.md to fix.');
  }

  writeFileSync(OUT_FILE, JSON.stringify({ units }, null, 2), 'utf8');
  console.log(`\n[generator] Wrote ${OUT_FILE}`);
}

main();
