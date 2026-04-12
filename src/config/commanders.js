/**
 * Commander definitions — all 25 from the Fantasy Cards pack.
 * Names are placeholder — review the card art and rename as needed.
 * spriteIndex maps to cards/card{N}.png and sprites/Sprite{N}.png.
 */
export const COMMANDERS = [
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
