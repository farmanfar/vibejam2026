// Assassin class mechanic: every Assassin attack applies 1 poison stack to
// its target in addition to normal damage.
//
// This is handled DIRECTLY inside CombatCore.performAttack (not as a hook
// registered here). When attacker.class === 'Assassin' and kind === 'basic',
// the engine applies 1 poison stack (or the infectiousBiteOverride value if
// Gnat's proc fired). This file registers the class name so the Registry
// validation pass knows it exists.

export const assassinClass = {
  name: 'Assassin',
  // No hooks — poison is applied inline in performAttack.
};
