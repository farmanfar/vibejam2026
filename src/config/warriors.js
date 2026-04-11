/**
 * Warrior definitions — will be data-driven from warriors.json later.
 * For now, a starter roster to get the game loop working.
 *
 * Tiers: 0=common, 1=uncommon, 2=rare, 3=epic, 4=legendary
 * Factions: Robot, Undead, Beast, Fantasy, Tribal
 */
export const WARRIORS = [
  // Tier 0 — Common (cost 1)
  { id: 'skeleton_unarmed', name: 'Skeleton',     atk: 2, hp: 3,  cost: 1, tier: 0, faction: 'Undead' },
  { id: 'small_bug',        name: 'Small Bug',    atk: 1, hp: 4,  cost: 1, tier: 0, faction: 'Beast' },
  { id: 'guard_robot',      name: 'Guard Bot',    atk: 2, hp: 2,  cost: 1, tier: 0, faction: 'Robot' },
  { id: 'minion_1',         name: 'Minion',       atk: 1, hp: 3,  cost: 1, tier: 0, faction: 'Tribal' },
  { id: 'dark_mec',         name: 'Dark Mec',     atk: 3, hp: 1,  cost: 1, tier: 0, faction: 'Robot' },

  // Tier 1 — Uncommon (cost 2)
  { id: 'skeleton_archer',  name: 'Bone Archer',  atk: 3, hp: 3,  cost: 2, tier: 1, faction: 'Undead' },
  { id: 'medium_bug',       name: 'Medium Bug',   atk: 2, hp: 5,  cost: 2, tier: 1, faction: 'Beast' },
  { id: 'bomb_droid',       name: 'Bomb Droid',   atk: 4, hp: 2,  cost: 2, tier: 1, faction: 'Robot' },
  { id: 'tribe_hunter',     name: 'Tribe Hunter', atk: 3, hp: 4,  cost: 2, tier: 1, faction: 'Tribal' },
  { id: 'dagger_mush',      name: 'Dagger Mush',  atk: 3, hp: 3,  cost: 2, tier: 1, faction: 'Fantasy' },

  // Tier 2 — Rare (cost 3)
  { id: 'ghoul',            name: 'Ghoul',        atk: 4, hp: 5,  cost: 3, tier: 2, faction: 'Undead' },
  { id: 'big_bug',          name: 'Big Bug',      atk: 3, hp: 8,  cost: 3, tier: 2, faction: 'Beast' },
  { id: 'hell_bot',         name: 'Hell Bot',     atk: 5, hp: 4,  cost: 3, tier: 2, faction: 'Robot' },
  { id: 'tribe_warrior',    name: 'Tribe Warrior', atk: 4, hp: 6, cost: 3, tier: 2, faction: 'Tribal' },
  { id: 'orb_mage',         name: 'Orb Mage',     atk: 5, hp: 3,  cost: 3, tier: 2, faction: 'Fantasy' },

  // Tier 3 — Epic (cost 4)
  { id: 'glitch_samurai',   name: 'Glitch Samurai', atk: 6, hp: 6,  cost: 4, tier: 3, faction: 'Fantasy' },
  { id: 'dust_warrior',     name: 'Dust Warrior',   atk: 5, hp: 8,  cost: 4, tier: 3, faction: 'Tribal' },
  { id: 'shock_sweeper',    name: 'Shock Sweeper',  atk: 7, hp: 5,  cost: 4, tier: 3, faction: 'Robot' },
  { id: 'skeleton_summoner', name: 'Bone Summoner', atk: 4, hp: 7,  cost: 4, tier: 3, faction: 'Undead' },

  // Tier 4 — Legendary (cost 5)
  { id: 'blood_king',       name: 'Blood King',   atk: 8, hp: 8,  cost: 5, tier: 4, faction: 'Fantasy' },
  { id: 'turtle_mech',      name: 'Turtle Mech',  atk: 7, hp: 10, cost: 5, tier: 4, faction: 'Robot' },
  { id: 'lord_of_flames',   name: 'Flame Lord',   atk: 9, hp: 7,  cost: 5, tier: 4, faction: 'Fantasy' },
];

/**
 * Synergy bonuses for matching faction warriors.
 * 2 = minor bonus, 3 = major bonus, 4+ = elite bonus
 */
export const SYNERGIES = {
  Robot:   { 2: { hp: 1 },           3: { hp: 2, atk: 1 },    4: { hp: 3, atk: 2 } },
  Undead:  { 2: { atk: 1 },          3: { atk: 2 },            4: { atk: 3, hp: 1 } },
  Beast:   { 2: { hp: 2 },           3: { hp: 4 },             4: { hp: 6 } },
  Fantasy: { 2: { atk: 1, hp: 1 },   3: { atk: 2, hp: 2 },    4: { atk: 3, hp: 3 } },
  Tribal:  { 2: { atk: 1 },          3: { atk: 1, hp: 2 },    4: { atk: 2, hp: 3 } },
};
