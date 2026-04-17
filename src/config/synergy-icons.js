import { SYNERGIES } from './units.js';

const FALLBACK_TEXTURE_KEY = 'syn-icon-default';
const FALLBACK_FILE = 'tag-default.png';

// Faction icons — display rules sourced from SYNERGIES (threshold-based tiers).
// Folk and Monster are present in alpha-units data but have no SYNERGIES entries
// yet, so their chips render the icon + raw count only (no /N tier hint).
const FACTION_ICONS = {
  Robot:   { textureKey: 'syn-icon-faction-robot',   file: 'faction-robot.png',   displayName: 'Robot',   kind: 'faction' },
  Undead:  { textureKey: 'syn-icon-faction-undead',  file: 'faction-undead.png',  displayName: 'Undead',  kind: 'faction' },
  Beast:   { textureKey: 'syn-icon-faction-beast',   file: 'faction-beast.png',   displayName: 'Beast',   kind: 'faction' },
  Fantasy: { textureKey: 'syn-icon-faction-fantasy', file: 'faction-fantasy.png', displayName: 'Fantasy', kind: 'faction' },
  Tribal:  { textureKey: 'syn-icon-faction-tribal',  file: 'faction-tribal.png',  displayName: 'Tribal',  kind: 'faction' },
  Folk:    { textureKey: 'syn-icon-faction-folk',    file: 'faction-folk.png',    displayName: 'Folk',    kind: 'faction' },
  Monster: { textureKey: 'syn-icon-faction-monster', file: 'faction-monster.png', displayName: 'Monster', kind: 'faction' },
};

// Class icons — display rules are per-class freeform (not all class mechanics
// are clean threshold tiers; some scale linearly, some are always-on). Each
// entry carries a short `description` line + an optional `tiers` array for
// classes whose mechanic does map to thresholds (e.g. Grunt 3+/5+).
// Source: src/systems/combat/classes/*.js
//
// `file: null` means no PNG is on disk yet — the chip falls back to the
// shared `syn-icon-default` texture. To swap in a real icon, drop a PNG into
// public/assets/ui/synergies/ matching the textureKey naming and change the
// `file` field here. The tooltip text/tiers keep working regardless.
const CLASS_ICONS = {
  Ancient: {
    textureKey: 'syn-icon-class-ancient',
    file: 'class-ancient.png',
    displayName: 'Ancient',
    kind: 'class',
    description: 'AoE basic attack. Each attack grants +1 ATK to other Ancients (cap 5).',
  },
  Assassin: {
    textureKey: 'syn-icon-class-assassin',
    file: 'class-assassin.png',
    displayName: 'Assassin',
    kind: 'class',
    description: 'Each attack applies +1 poison stack to its target.',
  },
  Berserker: {
    textureKey: 'syn-icon-class-berserker',
    file: 'class-berserker.png',
    displayName: 'Berserker',
    kind: 'class',
    tiers: [{ threshold: 3, label: '+3 ATK to all Berserkers' }],
  },
  Grunt: {
    textureKey: 'syn-icon-class-grunt',
    file: 'class-grunt.png',
    displayName: 'Grunt',
    kind: 'class',
    tiers: [
      { threshold: 3, label: '+3 HP to all Grunts' },
      { threshold: 5, label: '+3 HP +3 ATK to all Grunts' },
    ],
  },
  Gunner: {
    textureKey: 'syn-icon-class-gunner',
    file: 'class-gunner.png',
    displayName: 'Gunner',
    kind: 'class',
    tiers: [{ threshold: 3, label: 'Each Gunner fires once at battle start' }],
  },
  Knight: {
    textureKey: 'syn-icon-class-knight',
    file: 'class-knight.png',
    displayName: 'Knight',
    kind: 'class',
    description: 'Each Knight gets +1 HP / +1 ATK per other Knight on team.',
  },
  Tank: {
    textureKey: 'syn-icon-class-tank',
    file: 'class-tank.png',
    displayName: 'Tank',
    kind: 'class',
    description: 'Reactive Armor 10% base, +10% per other Tank (cap 50%).',
  },
};

export const SYNERGY_ICONS = { ...FACTION_ICONS, ...CLASS_ICONS };

export const SYNERGY_ICON_FALLBACK = {
  textureKey: FALLBACK_TEXTURE_KEY,
  file: FALLBACK_FILE,
  displayName: '',
  kind: 'unknown',
};

export function getSynergyIconEntry(tag) {
  const entry = SYNERGY_ICONS[tag];
  if (entry) return entry;
  return { ...SYNERGY_ICON_FALLBACK, displayName: tag || '' };
}

export function getAllPreloadEntries() {
  return [
    ...Object.values(SYNERGY_ICONS)
      .filter((entry) => entry.file)
      .map(({ textureKey, file }) => ({ textureKey, file })),
    { textureKey: FALLBACK_TEXTURE_KEY, file: FALLBACK_FILE },
  ];
}

function bonusToLabel(bonus) {
  if (!bonus) return '';
  const parts = [];
  if (bonus.atk) parts.push(`+${bonus.atk} ATK`);
  if (bonus.hp)  parts.push(`+${bonus.hp} HP`);
  return parts.join(' ');
}

// Returns the unified tier list for a tag — works for both faction tags
// (sourced from SYNERGIES) and class tags (sourced from CLASS_ICONS.tiers).
// Empty array means the tag has no threshold tiers (use `description` line).
export function getSynergyTiers(tag) {
  const entry = SYNERGY_ICONS[tag];
  if (entry?.tiers) {
    return entry.tiers
      .map(({ threshold, label }) => ({ threshold: Number(threshold), label }))
      .sort((a, b) => a.threshold - b.threshold);
  }

  const tiers = SYNERGIES[tag];
  if (!tiers) return [];
  return Object.entries(tiers)
    .map(([threshold, bonus]) => ({ threshold: Number(threshold), label: bonusToLabel(bonus) }))
    .sort((a, b) => a.threshold - b.threshold);
}

// Resolves which tier is currently active and which is next, given the unit
// count for a tag. `active` and `next` are { threshold, label } or null.
export function resolveActiveTier(tag, count) {
  const tiers = getSynergyTiers(tag);
  if (tiers.length === 0) return { tiers, active: null, next: null };

  let active = null;
  let next = null;
  for (const tier of tiers) {
    if (count >= tier.threshold) active = tier;
    else if (!next) next = tier;
  }
  return { tiers, active, next };
}

// Returns the count to display on the chip badge: e.g. "2/3" if a higher tier
// is reachable, "4/4" at max tier, or just "1" if there are no tiers at all
// but the tag is in the registry (e.g. Knight scales linearly).
export function getChipBadgeText(tag, count) {
  const { tiers, next } = resolveActiveTier(tag, count);
  if (next) return `${count}/${next.threshold}`;
  if (tiers.length > 0) return `${count}/${tiers[tiers.length - 1].threshold}`;
  return `${count}`;
}
