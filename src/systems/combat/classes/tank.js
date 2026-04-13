// Tank class mechanic: Reactive Armor scaling proc.
//
// The actual proc is rolled by the engine inside _rollReactiveArmor (called
// from performAttack / applyDamage). Base 10% + 10% per additional Tank on
// the same team, cap 50%. No per-tank handler is needed — this file just
// registers the class name so the Registry knows it exists and validation
// against frontmatter works.

export const tankClass = {
  name: 'Tank',
  // No hooks — proc is rolled inline in the engine.
};
