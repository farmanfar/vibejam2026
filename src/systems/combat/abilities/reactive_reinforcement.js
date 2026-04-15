// Relic Guardian 3 — Reactive Reinforcement (on_ally_death).
//
// Whenever another allied Robot unit dies, +1 ATK permanently. Self-death
// doesn't fire the handler. Non-Robot allies don't trigger it.
// The engine dispatches on_ally_death from _fireDeathObservers.

import { EVT } from '../events.js';

export const reactive_reinforcement = {
  id: 'reactive_reinforcement',
  event: EVT.ON_ALLY_DEATH,
  fn(ctx, { observer, victim }) {
    if (!observer.alive || observer.dying) return;
    if (observer === victim) return; // Self-death (shouldn't fire per spec, but guard)
    if (victim.faction !== 'Robot') return; // Only allied Robot deaths
    observer.baseAtk += 1;
    observer.atk = observer.baseAtk + (observer.resonanceStacks || 0);
    ctx.log.push('reactive_reinforcement_proc', {
      unit: observer.unitId,
      instanceId: observer.instanceId,
      slot: observer.slot,
      team: observer.team,
      trigger: victim.unitId,
      triggerInstanceId: victim.instanceId,
      newAtk: observer.atk,
    });
  },
};
