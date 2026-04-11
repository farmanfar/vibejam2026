import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(repoRoot, 'design', 'asset-catalog.md');
const outputSourcesPath = path.join(repoRoot, 'src', 'config', 'unit-sources.json');
const outputDefinitionsPath = path.join(repoRoot, 'src', 'config', 'unit-definitions.json');

const INCLUDED_SECTIONS = new Set([
  'Units & Combatants',
  'Bosses & Mini-Bosses',
  'Companions & Pets',
  'Ambient NPCs & Animals',
]);

const ID_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'with', 'without', 'enemy', 'advanced',
  'version', 'sprite', 'pack', 'series', 'char', 'character',
]);

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function cleanInline(value) {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^[\-\s]+/, '')
    .trim();
}

function extractField(block, label) {
  const pattern = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, 'i');
  const match = block.match(pattern);
  return match ? cleanInline(match[1]) : '';
}

function inferPack(name, sourceDir, explicitPack) {
  if (explicitPack) return explicitPack;

  const parenMatch = name.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) {
    return parenMatch[1].trim();
  }

  const firstSegment = sourceDir.split('/')[0]?.trim();
  return firstSegment || 'PENUSBMIC';
}

function significantTokens(value) {
  return slugify(value)
    .split('_')
    .filter(Boolean)
    .filter((token) => !ID_STOP_WORDS.has(token));
}

function inferFaction(name, pack, section) {
  const text = `${name} ${pack} ${section}`.toLowerCase();
  if (/(robot|bot|droid|mech|cannon|blaster|delivery|planter|electro|tech)/.test(text)) return 'Robot';
  if (/(skeleton|bone|ghoul|blood|reaper|undead|skull|soul|ghost|summoner|hoarder)/.test(text)) return 'Undead';
  if (/(bug|crow|dog|retriever|boar|rabbit|sheep|chick|chicken|animal|beast|companion|pet)/.test(text)) return 'Beast';
  if (/(dust|tribe|tribal|stranded|hunter|warrior|guardian|traveler|protector|merchant)/.test(text)) return 'Tribal';
  return 'Fantasy';
}

function inferTier(name, section, faction) {
  const text = name.toLowerCase();

  if (section === 'Bosses & Mini-Bosses') return 4;
  if (section === 'Companions & Pets') return 0;
  if (section === 'Ambient NPCs & Animals') return /(guardian|protector|keeper)/.test(text) ? 1 : 0;

  if (/(king|lord|guardian 3|colossal|blood king|bone reaper|ancient guardian|mini boss|heart hoarder)/.test(text)) {
    return 4;
  }

  if (/(samurai|swordmaster|sweeper|summoner|mech|protector|sage|orb mage|assassin|gunslinger|warrior)/.test(text)) {
    return faction === 'Robot' ? 4 : 3;
  }

  if (/(hero|ghoul|spitter|mage|bandit|hunter|archer|panda|temple guardian|dagger mushroom|bomb droid|guard robot|tribe)/.test(text)) {
    return 2;
  }

  if (/(delivery|circle bot|rusty|small|minion|companion|chicken|rabbit|sheep|boar|bug|mushroom)/.test(text)) {
    return 1;
  }

  return 1;
}

function inferStats(tier, faction) {
  const baseAtk = [2, 3, 4, 6, 8];
  const baseHp = [3, 4, 6, 7, 9];
  const atkBias = { Robot: 0, Undead: 1, Beast: -1, Fantasy: 1, Tribal: 0 };
  const hpBias = { Robot: 1, Undead: 0, Beast: 2, Fantasy: 0, Tribal: 1 };

  return {
    atk: Math.max(1, baseAtk[tier] + (atkBias[faction] ?? 0)),
    hp: Math.max(1, baseHp[tier] + (hpBias[faction] ?? 0)),
  };
}

function buildFlavorText(name, faction, pack) {
  return `${name} joins the ${faction.toLowerCase()} ranks from ${pack}.`;
}

function parseEntries(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let currentSection = '';
  let currentName = '';
  let currentLines = [];

  function flush() {
    if (!currentName || !INCLUDED_SECTIONS.has(currentSection)) {
      currentName = '';
      currentLines = [];
      return;
    }

    const block = currentLines.join('\n');
    const sourceDir = extractField(block, 'Path').replace(/\/+$/, '');
    const pack = inferPack(currentName, sourceDir, extractField(block, 'Pack'));

    if (sourceDir) {
      blocks.push({
        name: currentName.trim(),
        section: currentSection,
        sourceDir,
        pack,
      });
    }

    currentName = '';
    currentLines = [];
  }

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentSection = cleanInline(line.slice(3));
      continue;
    }

    if (line.startsWith('#### ')) {
      flush();
      currentName = cleanInline(line.slice(5));
      currentLines = [];
      continue;
    }

    if (currentName) {
      currentLines.push(line);
    }
  }

  flush();
  return blocks;
}

function ensureUniqueIds(entries) {
  const seen = new Map();

  return entries.map((entry) => {
    const baseId = significantTokens(entry.name).join('_') || slugify(entry.name) || 'unit';
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}_${count + 1}`;
    return { ...entry, id };
  });
}

function buildDefinitions(entries) {
  return entries.map((entry) => {
    const faction = inferFaction(entry.name, entry.pack, entry.section);
    const tier = inferTier(entry.name, entry.section, faction);
    const stats = inferStats(tier, faction);

    return {
      id: entry.id,
      name: entry.name,
      atk: stats.atk,
      hp: stats.hp,
      cost: tier + 1,
      tier,
      faction,
      enabled: true,
      devComment: `Seeded from ${entry.section} in design/asset-catalog.md.`,
      flavorText: buildFlavorText(entry.name, faction, entry.pack),
    };
  });
}

function main() {
  const markdown = fs.readFileSync(catalogPath, 'utf8');
  const parsed = ensureUniqueIds(parseEntries(markdown));

  const sources = parsed.map((entry) => ({
    id: entry.id,
    name: entry.name,
    category: entry.section,
    pack: entry.pack,
    sourceDir: entry.sourceDir,
    enabled: true,
  }));

  const definitions = buildDefinitions(parsed);

  fs.writeFileSync(outputSourcesPath, `${JSON.stringify(sources, null, 2)}\n`);
  fs.writeFileSync(outputDefinitionsPath, `${JSON.stringify(definitions, null, 2)}\n`);

  console.log(`[units:seed] Wrote ${sources.length} source entries to ${path.relative(repoRoot, outputSourcesPath)}`);
  console.log(`[units:seed] Wrote ${definitions.length} definitions to ${path.relative(repoRoot, outputDefinitionsPath)}`);
}

main();
