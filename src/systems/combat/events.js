// Event type constants for the combat registry. Abilities/classes/factions
// register handlers keyed to these strings. The engine fires them via
// ctx.fireEvent(type, payload).
//
// Never use raw strings in handler code — always import from here so rename
// refactors stay cheap and typos surface at registration time.

export const EVT = {
  // Fires once per battle, before round 1. Payload: { team, unit }.
  BATTLE_START: 'battle_start',
  // Fires once per battle, after both teams settle. Payload: { winner }.
  BATTLE_END: 'battle_end',

  // Fires at the top of each round, before coin-flip. Payload: { round }.
  ROUND_START: 'round_start',
  // Fires at the end of each round, after poison tick + death resolution.
  ROUND_END: 'round_end',

  // Special "event" used for ability handlers that replace a unit's basic
  // attack (Electrocutioner, Sneaky Swords, Minion #003). Not dispatched via
  // fireEvent — the engine checks for this explicitly in _takeBasicAction.
  ON_ACTION: 'on_action',

  // Fires right before a unit performs its regular attack action.
  // Payload: { attacker, target }. Handlers can mutate attacker.flags.
  BEFORE_ATTACK: 'before_attack',

  // Fires immediately after damage is applied to a target (survived or not).
  // Payload: { attacker, target, damage, killed }.
  ON_HIT: 'on_hit',

  // Fires when an attack from `attacker` reduces `victim` to 0 HP.
  // Payload: { attacker, victim }. Does NOT fire on death from death triggers
  // or poison ticks — only direct attack kills. Use ON_ENEMY_DEATH for the
  // broader trigger (e.g., Hog Knight).
  ON_KILL: 'on_kill',

  // Fires when a unit would die. Handlers run in registration order and can
  // mutate the dying flag (e.g., Archer's Death-Defy interrupts). Payload:
  // { unit, source }.
  ON_FAINT: 'on_faint',

  // Fires for every still-alive unit when any OTHER unit on EITHER team dies.
  // Hog Knight uses this. Payload: { observer, victim }.
  ON_ANY_DEATH: 'on_any_death',

  // Fires for every still-alive allied unit when a friendly dies.
  // Relic Guardian 3 uses this (filtered by faction). Payload:
  // { observer, victim }.
  ON_ALLY_DEATH: 'on_ally_death',
};

export const TRIGGER_PRIORITY = {
  // Death-defy runs FIRST within on_faint so the interrupt has a chance to
  // clear the dying flag before other handlers mutate state for the corpse.
  INTERRUPT: 0,
  DEFAULT: 100,
  // Cleanup-type handlers that want to observe final state.
  LATE: 200,
};
