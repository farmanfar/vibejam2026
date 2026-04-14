// Alpha unit adapter — shapes the headless alpha combat engine's
// unit definitions into the game-UI shape that Shop/Battle/WarriorCard expect.
//
// Source of truth:
//   - alpha-units.generated.json : stats/abilities from design/units/*.md
//                                  (produced by `npm run alpha:generate`).
//   - alpha-art.generated.json   : baked Aseprite atlas metadata
//                                  (produced by `npm run alpha:sprites`).
//
// Units without a baked atlas still appear in the shop — they fall back
// to the generated warrior_placeholder_<tier> texture via getUnitTextureKey
// so the full roster is playable from day one.

import alphaUnitsRaw from './alpha-units.generated.json';
import alphaArtRaw from './alpha-art.generated.json';

const ART_ENTRIES = alphaArtRaw?.entries ?? {};

function toGameShape(alpha) {
  const art = ART_ENTRIES[alpha.id] ?? null;
  const hasPortrait = !!art;
  const spriteKey = hasPortrait ? art.spriteKey : null;
  return {
    id: alpha.id,
    name: alpha.name,
    faction: alpha.faction,
    class: alpha.class,
    tier: alpha.tier,
    hp: alpha.hp,
    atk: alpha.atk,
    range: alpha.range ?? 1,
    cost: alpha.tier,
    ability_id: alpha.ability_id ?? null,
    rules_text: alpha.rules_text ?? null,
    skipBasicAttack: !!alpha.skipBasicAttack,
    basicAttackOverride: alpha.basicAttackOverride ?? null,
    enabled: alpha.art_status !== 'blocked',
    hasPortrait,
    spriteKey,
    art,
    source: 'alpha',
  };
}

let _cache = null;
function buildCache() {
  if (_cache) return _cache;
  const list = (alphaUnitsRaw?.units ?? []).map(toGameShape);
  const enabled = list.filter((w) => w.enabled);
  const mapped = enabled.filter((w) => w.hasPortrait);
  const unmapped = enabled.length - mapped.length;
  console.log(
    `[AlphaUnits] Loaded ${list.length} alpha units — ${enabled.length} enabled ` +
    `(${mapped.length} with art, ${unmapped} placeholder fallback)`,
  );
  _cache = { list, enabled };
  return _cache;
}

export function getAlphaWarriors() {
  return buildCache().list.map((w) => ({ ...w }));
}

export function getEnabledAlphaWarriors() {
  return buildCache().enabled.map((w) => ({ ...w }));
}

export function getAlphaUnitById(id) {
  const hit = buildCache().list.find((w) => w.id === id);
  return hit ? { ...hit } : null;
}

// Legacy compatibility — the old warriors.js module exported a SYNERGIES
// table used by BattleEngine. CombatCore owns real faction/class mechanics
// now, so the alpha path doesn't need this — export an empty object so any
// stray `import { SYNERGIES }` still resolves without crashing.
export const SYNERGIES = {};
