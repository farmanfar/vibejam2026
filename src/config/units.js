import unitSources from './unit-sources.json';
import repoDefinitions from './unit-definitions.json';
import generatedCatalog from './unit-catalog.generated.json';

const DRAFT_STORAGE_KEY = 'hired_swords_unit_definitions_draft_v1';

// Legacy per-threshold stat tiers from the pre-alpha BattleEngine. The alpha
// combat engine (src/systems/combat/factions/*.js) owns the real faction
// mechanics now, and none of them are stat-threshold bonuses — so nothing in
// this table is applied at runtime. Left non-empty only because RulesScene
// still iterates it; Robot is intentionally absent so its tooltip falls
// through to the description in synergy-icons.js instead of showing stale
// tier numbers. Undead/Beast/Fantasy/Tribal entries remain for the dead
// legacy tiles — no alpha unit carries those tags.
export const SYNERGIES = {
  Undead:  { 2: { atk: 1 },          3: { atk: 2 },           4: { atk: 3, hp: 1 } },
  Beast:   { 2: { hp: 2 },           3: { hp: 4 },            4: { hp: 6 } },
  Fantasy: { 2: { atk: 1, hp: 1 },   3: { atk: 2, hp: 2 },    4: { atk: 3, hp: 3 } },
  Tribal:  { 2: { atk: 1 },          3: { atk: 1, hp: 2 },    4: { atk: 2, hp: 3 } },
};

function canUseStorage() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readDraftDefinitions() {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error('[Units] Failed to parse unit draft from localStorage:', error);
    return null;
  }
}

function getGeneratedEntryMap() {
  return new Map((generatedCatalog.entries ?? []).map((entry) => [entry.id, entry]));
}

function getSourceEntryMap() {
  return new Map((unitSources ?? []).map((entry) => [entry.id, entry]));
}

export function getUnitSources() {
  return deepClone(unitSources ?? []);
}

export function getRepoUnitDefinitions() {
  return deepClone(repoDefinitions ?? []);
}

export function getUnitDefinitions() {
  return deepClone(readDraftDefinitions() ?? repoDefinitions ?? []);
}

export function saveUnitDefinitionsDraft(definitions) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(definitions));
  console.log(`[Units] Saved ${definitions.length} unit definitions to local draft storage`);
}

export function clearUnitDefinitionsDraft() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  console.log('[Units] Cleared local unit definition draft');
}

export function exportUnitDefinitionsJSON(definitions = getUnitDefinitions()) {
  return `${JSON.stringify(definitions, null, 2)}\n`;
}

export function getGeneratedCatalogEntries() {
  return deepClone(generatedCatalog.entries ?? []);
}

function buildRuntimeUnit(definition, generatedEntry, sourceEntry) {
  const tier = normalizeNumber(definition.tier, 0);
  const art = generatedEntry?.art ?? null;
  const hasPortrait = !!art?.portraitPath;
  const hasAtlas = !!art?.sheetPath && !!art?.metaPath;

  return {
    ...definition,
    atk: normalizeNumber(definition.atk, 1),
    hp: normalizeNumber(definition.hp, 1),
    cost: normalizeNumber(definition.cost, tier + 1),
    tier,
    enabled: definition.enabled !== false,
    source: sourceEntry ? deepClone(sourceEntry) : null,
    importStatus: generatedEntry?.status ?? 'missing_generated_entry',
    importWarnings: deepClone(generatedEntry?.warnings ?? []),
    importErrors: deepClone(generatedEntry?.errors ?? []),
    art: art ? deepClone(art) : null,
    spriteKey: `unit-portrait-${definition.id}`,
    hasPortrait,
    hasAtlas,
  };
}

export function getWarriors() {
  const definitions = getUnitDefinitions();
  const generatedMap = getGeneratedEntryMap();
  const sourceMap = getSourceEntryMap();

  return definitions.map((definition) =>
    buildRuntimeUnit(definition, generatedMap.get(definition.id), sourceMap.get(definition.id)));
}

export function getEnabledWarriors() {
  return getWarriors().filter((unit) => unit.enabled);
}

export function getWarriorById(id) {
  return getWarriors().find((unit) => unit.id === id) ?? null;
}

export function getUnitValidation(definitions = getUnitDefinitions()) {
  const generatedMap = getGeneratedEntryMap();
  const idCounts = new Map();
  const nameCounts = new Map();

  for (const definition of definitions) {
    idCounts.set(definition.id, (idCounts.get(definition.id) ?? 0) + 1);
    nameCounts.set(definition.name.trim().toLowerCase(), (nameCounts.get(definition.name.trim().toLowerCase()) ?? 0) + 1);
  }

  const byId = {};
  let readyArtCount = 0;
  let missingArtCount = 0;
  let duplicateIdCount = 0;
  let duplicateNameCount = 0;
  let invalidFieldCount = 0;

  for (const definition of definitions) {
    const generatedEntry = generatedMap.get(definition.id);
    const requiredIssues = [];

    if (!definition.name?.trim()) requiredIssues.push('Missing name');
    if (!Number.isFinite(Number(definition.hp)) || Number(definition.hp) <= 0) requiredIssues.push('Invalid hp');
    if (!Number.isFinite(Number(definition.atk)) || Number(definition.atk) <= 0) requiredIssues.push('Invalid atk');
    if (!Number.isFinite(Number(definition.cost)) || Number(definition.cost) <= 0) requiredIssues.push('Invalid cost');
    if (!Number.isFinite(Number(definition.tier)) || Number(definition.tier) < 0) requiredIssues.push('Invalid tier');
    if (!definition.faction?.trim()) requiredIssues.push('Missing faction');

    const duplicateId = (idCounts.get(definition.id) ?? 0) > 1;
    const duplicateName = (nameCounts.get(definition.name.trim().toLowerCase()) ?? 0) > 1;
    const artReady = generatedEntry?.status === 'ready' && !!generatedEntry?.art?.portraitPath;
    const atlasReady = generatedEntry?.status === 'ready' && !!generatedEntry?.art?.sheetPath && !!generatedEntry?.art?.metaPath;

    if (artReady) readyArtCount++;
    else missingArtCount++;
    if (duplicateId) duplicateIdCount++;
    if (duplicateName) duplicateNameCount++;
    if (requiredIssues.length > 0) invalidFieldCount++;

    byId[definition.id] = {
      artReady,
      atlasReady,
      duplicateId,
      duplicateName,
      requiredIssues,
      importStatus: generatedEntry?.status ?? 'missing_generated_entry',
      importWarnings: generatedEntry?.warnings ?? [],
      importErrors: generatedEntry?.errors ?? [],
    };
  }

  return {
    summary: {
      total: definitions.length,
      readyArtCount,
      missingArtCount,
      duplicateIdCount,
      duplicateNameCount,
      invalidFieldCount,
    },
    byId,
  };
}
