import { describe, test, expect } from 'vitest';
import { analyzeResult } from '../../../../scripts/lib/battle-telemetry.mjs';
import { makeUnit, runBattle } from './testHelpers.js';

// ---------- synthetic log helpers ----------

function makeInit({ player, enemy, playerFavor = null, enemyFavor = null, seed = 42 }) {
  return {
    kind: 'battle_init',
    player: player.map((u, i) => ({
      unitId: u.id, instanceId: u._instanceId ?? `${u.id}#p${i}`,
      slot: i, team: 'player', tier: u.tier ?? 1, class: u.class ?? 'Grunt',
      faction: u.faction ?? 'Folk', hp: u.hp ?? 3, maxHp: u.hp ?? 3, atk: u.atk ?? 1,
      alive: true, poison: 0, resonance: 0,
    })),
    enemy: enemy.map((u, i) => ({
      unitId: u.id, instanceId: u._instanceId ?? `${u.id}#e${i}`,
      slot: i, team: 'enemy', tier: u.tier ?? 1, class: u.class ?? 'Grunt',
      faction: u.faction ?? 'Folk', hp: u.hp ?? 3, maxHp: u.hp ?? 3, atk: u.atk ?? 1,
      alive: true, poison: 0, resonance: 0,
    })),
    playerFavor, enemyFavor, seed,
  };
}

function makeResult(entries, { winner = 'player', rounds = 1 } = {}) {
  return { winner, rounds, log: { entries } };
}

// ---------- tests ----------

describe('battle-telemetry', () => {
  test('basic damage accounting — stamped real battle', () => {
    const p = makeUnit('attacker', { hp: 2, atk: 3, _instanceId: 'attacker#p0' });
    const e = makeUnit('target',   { hp: 10, atk: 1, _instanceId: 'target#e0' });
    const result = runBattle({ player: [p], enemy: [e], seed: 42 });
    const analysis = analyzeResult(result);
    const pInst = analysis.perUnit['attacker#p0'];
    const eInst = analysis.perUnit['target#e0'];
    expect(pInst).toBeDefined();
    expect(eInst).toBeDefined();
    // attacker deals some damage; target takes it
    expect(pInst.damageDealt).toBeGreaterThan(0);
    expect(eInst.damageTaken).toBeGreaterThan(0);
    expect(pInst.damageDealt).toBe(eInst.damageTaken);
  });

  test('kill attribution — stamped real battle', () => {
    // p1 (high atk) kills e1 (low hp, no retaliation possible)
    const p = makeUnit('p1', { hp: 100, atk: 10, _instanceId: 'p1#p0' });
    const e = makeUnit('e1', { hp: 3,   atk: 1,  _instanceId: 'e1#e0' });
    const result = runBattle({ player: [p], enemy: [e], seed: 0 });
    expect(result.winner).toBe('player');
    const analysis = analyzeResult(result);
    expect(analysis.perUnit['p1#p0'].kills).toBe(1);
    expect(analysis.perUnit['e1#e0'].deaths).toBe(1);
  });

  test('Death-Defy saves both kill and death counts — synthetic', () => {
    const p = { id: 'attacker', _instanceId: 'attacker#p0', hp: 5 };
    const e = { id: 'archer',   _instanceId: 'archer#e0',   hp: 2 };
    const init = makeInit({ player: [p], enemy: [e] });
    const entries = [
      init,
      { kind: 'round_start', round: 1 },
      // lethal hit on archer
      { kind: 'attack', attackerInstanceId: 'attacker#p0', targetInstanceId: 'archer#e0',
        damage: 2, requested: 2, blocked: false, hpAfter: 0, damageKind: 'basic',
        attacker: 'attacker', target: 'archer' },
      { kind: 'faint_start', instanceId: 'archer#e0', unit: 'archer', slot: 0, team: 'enemy' },
      // Death-Defy fires — archer is saved, no faint_final follows
      { kind: 'death_defy_trigger', unit: 'archer', instanceId: 'archer#e0', slot: 0, team: 'enemy', newHp: 1 },
      { kind: 'death_defy_repositioned', unit: 'archer', instanceId: 'archer#e0', slot: 1, team: 'enemy', newHp: 1 },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'enemy', rounds: 5 }));
    // attacker gets NO kill; archer gets NO death
    expect(analysis.perUnit['attacker#p0'].kills).toBe(0);
    expect(analysis.perUnit['archer#e0'].deaths).toBe(0);
    expect(analysis.perUnit['archer#e0'].survivalRounds).toBeNull();
  });

  test('Monster reanimate — no death counted, reanimates++', () => {
    const p = { id: 'attacker', _instanceId: 'attacker#p0', hp: 5 };
    const m = { id: 'ghoul',    _instanceId: 'ghoul#e0',    hp: 3 };
    const init = makeInit({ player: [p], enemy: [m] });
    const entries = [
      init,
      { kind: 'round_start', round: 2 },
      { kind: 'attack', attackerInstanceId: 'attacker#p0', targetInstanceId: 'ghoul#e0',
        damage: 3, requested: 3, blocked: false, hpAfter: 0, damageKind: 'basic' },
      { kind: 'faint_start', instanceId: 'ghoul#e0', unit: 'ghoul', slot: 0, team: 'enemy' },
      // Monster reanimate fires INSTEAD OF faint_final
      { kind: 'reanimate_success', instanceId: 'ghoul#e0', unit: 'ghoul', newSlot: 2, team: 'enemy', newHp: 3 },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'enemy', rounds: 10 }));
    expect(analysis.perUnit['ghoul#e0'].reanimates).toBe(1);
    expect(analysis.perUnit['ghoul#e0'].deaths).toBe(0);
    expect(analysis.perUnit['ghoul#e0'].survivalRounds).toBeNull();
    // attacker gets no kill
    expect(analysis.perUnit['attacker#p0'].kills).toBe(0);
  });

  test('reanimated-then-died — deaths=1, reanimates=1', () => {
    const p = { id: 'attacker', _instanceId: 'attacker#p0', hp: 20 };
    const m = { id: 'ghoul',    _instanceId: 'ghoul#e0',    hp: 3  };
    const init = makeInit({ player: [p], enemy: [m] });
    const entries = [
      init,
      { kind: 'round_start', round: 1 },
      { kind: 'attack', attackerInstanceId: 'attacker#p0', targetInstanceId: 'ghoul#e0',
        damage: 3, requested: 3, blocked: false, hpAfter: 0, damageKind: 'basic' },
      { kind: 'faint_start', instanceId: 'ghoul#e0', unit: 'ghoul', slot: 0, team: 'enemy' },
      { kind: 'reanimate_success', instanceId: 'ghoul#e0', unit: 'ghoul', newSlot: 2, team: 'enemy', newHp: 3 },
      { kind: 'round_start', round: 3 },
      // Dies again (no reanimate this time)
      { kind: 'attack', attackerInstanceId: 'attacker#p0', targetInstanceId: 'ghoul#e0',
        damage: 3, requested: 3, blocked: false, hpAfter: 0, damageKind: 'basic' },
      { kind: 'faint_start', instanceId: 'ghoul#e0', unit: 'ghoul', slot: 2, team: 'enemy' },
      { kind: 'faint_final', instanceId: 'ghoul#e0', unit: 'ghoul', slot: 2, team: 'enemy' },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'player', rounds: 3 }));
    expect(analysis.perUnit['ghoul#e0'].reanimates).toBe(1);
    expect(analysis.perUnit['ghoul#e0'].deaths).toBe(1);
    expect(analysis.perUnit['ghoul#e0'].survivalRounds).toBe(3);
    expect(analysis.perUnit['attacker#p0'].kills).toBe(1);
  });

  test('poison lethal — environmental death, no attacker kill', () => {
    const p = { id: 'p1', _instanceId: 'p1#p0', hp: 10 };
    const e = { id: 'e1', _instanceId: 'e1#e0', hp: 1  };
    const init = makeInit({ player: [p], enemy: [e] });
    const entries = [
      init,
      { kind: 'round_start', round: 2 },
      { kind: 'poison_tick', target: 'e1', targetInstanceId: 'e1#e0',
        targetSlot: 0, targetTeam: 'enemy', stacks: 2, damage: 2, hpAfter: -1 },
      { kind: 'faint_start', instanceId: 'e1#e0', unit: 'e1', slot: 0, team: 'enemy' },
      { kind: 'faint_final', instanceId: 'e1#e0', unit: 'e1', slot: 0, team: 'enemy' },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'player', rounds: 2 }));
    expect(analysis.perUnit['e1#e0'].deaths).toBe(1);
    expect(analysis.perUnit['e1#e0'].damageTaken).toBe(2);
    expect(analysis.perUnit['p1#p0'].kills).toBe(0);
    expect(analysis.meta.environmentalDeaths).toBe(1);
  });

  test('null-attacker damage entry — environmental death', () => {
    const p = { id: 'p1', _instanceId: 'p1#p0', hp: 10 };
    const e = { id: 'e1', _instanceId: 'e1#e0', hp: 1  };
    const init = makeInit({ player: [p], enemy: [e] });
    const entries = [
      init,
      { kind: 'round_start', round: 1 },
      // bomb-style: attacker is null
      { kind: 'damage', attacker: null, attackerInstanceId: null,
        targetInstanceId: 'e1#e0', damage: 5, blocked: false, hpAfter: 0, damageKind: 'bomb' },
      { kind: 'faint_start', instanceId: 'e1#e0', unit: 'e1', slot: 0, team: 'enemy' },
      { kind: 'faint_final', instanceId: 'e1#e0', unit: 'e1', slot: 0, team: 'enemy' },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'player', rounds: 1 }));
    expect(analysis.perUnit['e1#e0'].deaths).toBe(1);
    expect(analysis.meta.environmentalDeaths).toBe(1);
    expect(analysis.perUnit['p1#p0'].kills).toBe(0);
  });

  test('survival rounds — stamped real battle', () => {
    // p survives the whole battle (winner)
    // e dies at some round
    const p = makeUnit('p1', { hp: 50, atk: 5, _instanceId: 'p1#p0' });
    const e = makeUnit('e1', { hp: 3,  atk: 1, _instanceId: 'e1#e0' });
    const result = runBattle({ player: [p], enemy: [e], seed: 0 });
    const analysis = analyzeResult(result);
    expect(analysis.perUnit['p1#p0'].survivalRounds).toBeNull();
    expect(analysis.perUnit['e1#e0'].survivalRounds).not.toBeNull();
    expect(analysis.perUnit['e1#e0'].survivalRounds).toBeGreaterThan(0);
  });

  test('resonance peak — credits TARGET, not source', () => {
    const src = { id: 'src', _instanceId: 'src#p0', hp: 5 };
    const tgt = { id: 'tgt', _instanceId: 'tgt#p1', hp: 5 };
    const e   = { id: 'e1',  _instanceId: 'e1#e0',  hp: 5 };
    const init = makeInit({ player: [src, tgt], enemy: [e] });
    const entries = [
      init,
      { kind: 'round_start', round: 1 },
      { kind: 'resonance_stack', source: 'src', sourceInstanceId: 'src#p0', sourceSlot: 0, sourceTeam: 'player',
        target: 'tgt', targetInstanceId: 'tgt#p1', targetSlot: 1, targetTeam: 'player', stacks: 1, newAtk: 2 },
      { kind: 'resonance_stack', source: 'src', sourceInstanceId: 'src#p0', sourceSlot: 0, sourceTeam: 'player',
        target: 'tgt', targetInstanceId: 'tgt#p1', targetSlot: 1, targetTeam: 'player', stacks: 3, newAtk: 4 },
      { kind: 'resonance_stack', source: 'src', sourceInstanceId: 'src#p0', sourceSlot: 0, sourceTeam: 'player',
        target: 'tgt', targetInstanceId: 'tgt#p1', targetSlot: 1, targetTeam: 'player', stacks: 2, newAtk: 3 },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'player', rounds: 3 }));
    // tgt received the stacks; peak should be 3
    expect(analysis.perUnit['tgt#p1'].resonanceStacksPeak).toBe(3);
    // src granted them; its peak stays 0
    expect(analysis.perUnit['src#p0'].resonanceStacksPeak).toBe(0);
  });

  test('determinism — same seed produces identical analysis', () => {
    const p = makeUnit('p1', { hp: 5, atk: 2, _instanceId: 'p1#p0' });
    const e = makeUnit('e1', { hp: 4, atk: 1, _instanceId: 'e1#e0' });
    const r1 = analyzeResult(runBattle({ player: [p], enemy: [e], seed: 99 }));
    const r2 = analyzeResult(runBattle({ player: [p], enemy: [e], seed: 99 }));
    expect(r1).toEqual(r2);
  });

  test('ability fires whitelist — only whitelisted kinds counted, action_start excluded', () => {
    const p = { id: 'ancient', _instanceId: 'ancient#p0', hp: 5, class: 'Ancient', faction: 'Folk' };
    const e = { id: 'e1',      _instanceId: 'e1#e0',      hp: 5 };
    const init = makeInit({ player: [p], enemy: [e] });
    const entries = [
      init,
      // Generic engine events — must NOT be counted
      { kind: 'action_start', unit: 'ancient', slot: 0, team: 'player', source: 'class' },
      { kind: 'faint_start',  unit: 'e1', instanceId: 'e1#e0', slot: 0, team: 'enemy' },
      // Ability-fire events — MUST be counted
      { kind: 'ancient_aoe_start',    unit: 'ancient', slot: 0, team: 'player' },
      { kind: 'gunner_startup_shot',  unit: 'ancient', slot: 0, team: 'player', target: 'e1', targetSlot: 0, gunnerCount: 1, damage: 2 },
      { kind: 'infectious_bite_roll', unit: 'ancient', slot: 0, team: 'player', target: 'e1', proc: true },
      { kind: 'death_defy_skip',      unit: 'ancient', instanceId: 'ancient#p0', slot: 0, team: 'player', reason: 'already_used' },
    ];
    const analysis = analyzeResult(makeResult(entries, { winner: 'player', rounds: 1 }));
    const fires = analysis.abilityFires['ancient'];
    expect(fires).toBeDefined();
    expect(fires['ancient_aoe_start']).toBe(1);
    expect(fires['gunner_startup_shot']).toBe(1);
    expect(fires['infectious_bite_roll']).toBe(1);
    expect(fires['death_defy_skip']).toBe(1);
    // Excluded kinds must not appear
    expect(fires['action_start']).toBeUndefined();
    expect(fires['faint_start']).toBeUndefined();
  });
});
