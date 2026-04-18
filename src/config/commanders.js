/**
 * Commander definitions — all 25 from the Fantasy Cards pack.
 * Names are placeholder — review the card art and rename as needed.
 * spriteIndex maps to cards/card{N}.png and sprites/Sprite{N}.png.
 *
 * Each commander also gets a `rule` applied to all units on their team
 * at battle start. Initial pass cycles three simple flat-stat presets
 * across the 25 commanders (index % 3) — to be redesigned later.
 */

const RULE_PRESETS = [
  { atk: 1, hp: 1, description: '+1 ATK / +1 HP TO ALL UNITS' },
  { atk: 0, hp: 2, description: '+2 HP TO ALL UNITS' },
  { atk: 2, hp: 0, description: '+2 ATK TO ALL UNITS' },
];

const BASE_COMMANDERS = [
  { id: 'commander_1',  name: 'Thornmaw',         spriteIndex: 1 },
  { id: 'commander_2',  name: 'Void Warden',      spriteIndex: 2 },
  { id: 'commander_3',  name: 'Iron Juggernaut',   spriteIndex: 3 },
  { id: 'commander_4',  name: 'Crimson Weaver',    spriteIndex: 4 },
  { id: 'commander_5',  name: 'Flame Warden',      spriteIndex: 5 },
  { id: 'commander_6',  name: 'Pale Reaper',       spriteIndex: 6 },
  { id: 'commander_7',  name: 'Shadow Bearer',     spriteIndex: 7 },
  { id: 'commander_8',  name: 'Ember Knight',      spriteIndex: 8 },
  { id: 'commander_9',  name: 'Rust Marauder',     spriteIndex: 9 },
  { id: 'commander_10', name: 'Arcane Seer',       spriteIndex: 10 },
  { id: 'commander_11', name: 'Maw Beast',         spriteIndex: 11 },
  { id: 'commander_12', name: 'Dark Ranger',       spriteIndex: 12 },
  { id: 'commander_13', name: 'Abyssal Mother',    spriteIndex: 13 },
  { id: 'commander_14', name: 'Flesh Colossus',    spriteIndex: 14 },
  { id: 'commander_15', name: 'Skull Shepherd',    spriteIndex: 15 },
  { id: 'commander_16', name: 'Gloom Crawler',     spriteIndex: 16 },
  { id: 'commander_17', name: 'Blaze Sovereign',   spriteIndex: 17 },
  { id: 'commander_18', name: 'Forge Brute',       spriteIndex: 18 },
  { id: 'commander_19', name: 'Dusk Pilgrim',      spriteIndex: 19 },
  { id: 'commander_20', name: 'Storm Captain',     spriteIndex: 20 },
  { id: 'commander_21', name: 'Wraith Engine',     spriteIndex: 21 },
  { id: 'commander_22', name: 'Orb Sentinel',      spriteIndex: 22 },
  { id: 'commander_23', name: 'Siege Hauler',      spriteIndex: 23 },
  { id: 'commander_24', name: 'War Rig',           spriteIndex: 24 },
  { id: 'commander_25', name: 'Spark Golem',       spriteIndex: 25 },
];

export const COMMANDERS = BASE_COMMANDERS.map((c, i) => ({
  ...c,
  rule: RULE_PRESETS[i % RULE_PRESETS.length],
}));

export function getCommanderRule(commander) {
  return commander?.rule ?? { atk: 0, hp: 0, description: 'NO EFFECT' };
}

export function getCommanders() {
  return [...COMMANDERS];
}

export function getCommanderById(id) {
  return COMMANDERS.find((c) => c.id === id) ?? null;
}

export function pickRandomCommanders(count = 3) {
  const shuffled = [...COMMANDERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
