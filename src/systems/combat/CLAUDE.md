# CLAUDE.md — systems/combat/

Headless alpha combat engine. **Completely isolated from BattleEngine.js** — scenes and game UI never import from here. Only consumers: sim CLI (`scripts/sim-battle.mjs`) and vitest tests.

## Files

- **RNG.js** — Seeded Mulberry32 PRNG. `new RNG(seed)`. Methods: `next()` (0–1 float), `chance(p)`, `int(min, max)`, `pick(arr)`.
- **events.js** — Event name constants (`BATTLE_START`, `ON_ACTION`, `ON_FAINT`, `ON_KILL`, `ON_ANY_DEATH`, `ON_ALLY_DEATH`, `BEFORE_ATTACK`) and `TRIGGER_PRIORITY` (`INTERRUPT=0`, `DEFAULT=100`, `LATE=200`).
- **CombatLog.js** — Append-only battle log. `push(kind, payload)` → `{ kind, ...payload }`. ⚠️ Never put a `kind` field in payload — it will overwrite the entry kind. Use `damageKind` for damage type labels.
- **Registry.js** — Maps ability_id → handler, class name → mechanic, faction name → mechanic. `abilitiesForUnit(unit, eventType)` returns handlers sorted by priority. Built once via `buildRegistry()` from `index.js`.
- **position.js** — Slot-aware queries: `frontmostAliveEnemy`, `highestSlotAliveEnemy`, `alliesBehindWithinRange`, `enemiesWithinRange`, `compactTeam`, `sortBySlot`, `moveUnitToBack`, `placeAtBackSlot`.
- **status.js** — Poison system: `applyPoison(unit, n)` (adds up to cap 5), `setPoison(unit, n)` (overrides), `tickPoison(unit)`, `rollToxicCascade(unit, rng, allUnits)`.
- **CombatCore.js** — Main engine. `new CombatCore({ registry, seed })`. `core.run({ player, enemy })` → `{ winner, rounds, log }`.
- **index.js** — Re-exports `buildRegistry` and `CombatCore`. Entry point for all consumers.
- **classes/** — One file per class mechanic (`ancient.js`, `assassin.js`, `berserker.js`, `grunt.js`, `gunner.js`, `knight.js`, `tank.js`).
- **factions/** — One file per faction mechanic (`folk.js`, `monster.js`, `robot.js`).
- **abilities/** — One file per ability_id handler.

## Registry Pattern

```js
// Adding a new ability:
registry.registerAbility('my_ability_id', {
  event: events.ON_FAINT,         // which event triggers this
  priority: TRIGGER_PRIORITY.DEFAULT,
  handler: ({ unit, rng, core, log, allUnits }) => {
    // ... do work
  }
});
```

```js
// Adding a class mechanic:
registry.registerClass('MyClass', {
  initialize: ({ unit, allies }) => { /* stat bonuses at battle start */ },
  onAction:   ({ unit, ... }) => { /* fires when unit takes its turn */ },
  // etc.
});
```

```js
// Adding a faction mechanic:
registry.registerFaction('MyFaction', {
  onFaint: ({ unit, ... }) => { /* fires when a unit of this faction faints */ },
});
```

The `index.js` `buildRegistry()` function is the single place that wires all handlers in. When adding a new ability/class/faction file, always add its registration call there.

## Event Types

| Constant | When it fires |
|---|---|
| `BATTLE_START` | Once, before round 1 |
| `ON_ACTION` | When a unit takes its turn (before attack resolution) |
| `BEFORE_ATTACK` | Just before a single attack hit lands |
| `ON_FAINT` | When a unit's HP reaches 0 (see Death Batch below) |
| `ON_KILL` | On the attacker when they land the killing blow |
| `ON_ANY_DEATH` | On any observer when any unit on any team dies |
| `ON_ALLY_DEATH` | On any observer when an ally (same team) dies |

## Death Batch Model

Multiple units can die in a single action (AoE, chain explosions, etc.). Resolution:

1. All kills in one action set `unit.dying = true` (but `unit.alive` stays `true`).
2. After all damage is resolved, `CombatCore._resolveDyingBatch()` runs.
3. **During step 2**, ON_FAINT / ON_KILL / ON_ANY_DEATH / ON_ALLY_DEATH handlers fire **in slot order** (lower slot index first) for the dying batch.
4. Only after all handlers finish does `unit.alive = false` get set.

**Critical:** `frontmostAliveEnemy` and similar queries filter `!u.dying`. This prevents a dying unit (still technically `alive=true`) from being targeted during the batch.

**Monster reanimate:** Uses `projectedAlive` (alive-and-not-dying count) to check slot availability before committing. A unit can reanimate even if it was just killed in the same batch.

## Archer (Death-Defying) Interrupt Contract

Death-Defying (`death_defying.js`) fires at `TRIGGER_PRIORITY.INTERRUPT = 0`, before all other ON_FAINT handlers (priority 100+).

- Clears `unit.dying = false`, restores 1 HP, moves unit to back slot.
- This removes the unit from the dying batch — subsequent DEFAULT-priority handlers for other units do NOT see the Archer as dying.
- Single-use: sets `unit.flags.usedDeathDefy = true`. Guard at top of handler.

## Ancient Resonance (Per-Action Once)

Ancient class `onAction` and `heart_slam_on_death` both call `grantResonanceForAction(unit)`. This function:
- Checks `unit.flags._resonanceGrantedThisAction`; if already set, skips.
- Otherwise sets the flag and increments `unit.resonanceStacks`.

`CombatCore._takeBasicAction` resets `_resonanceGrantedThisAction = false` after the action completes. This ensures Ancient AoE (which calls `performAttack` N times in one action) only grants one resonance stack.

## Blood King Anomaly

Blood King is Ancient class but his basic attack is single-target melee (not AoE). His def has `basicAttackOverride: 'single_target'`. `_takeBasicAction` checks this flag before dispatching to the class `onAction` hook. His AoE fires only on death via `heart_slam_on_death`.

## Adding a New Unit

1. Add to `design/units/<id>.md` (frontmatter + abilities).
2. Add entry to `ABILITY_MAP` in `scripts/generate-alpha-units.mjs` (unit id → ability_id string or null).
3. Run `npm run alpha:generate` — updates `src/config/alpha-units.generated.json`.
4. Add ability handler to `src/systems/combat/abilities/<ability_id>.js`.
5. Register it in `index.js` `buildRegistry()`.
6. Write tests in `src/systems/combat/__tests__/`.

## Isolation Note

**Never import from this directory in scene files or BattleEngine.js.** The alpha engine is a parallel development path — it will eventually replace BattleEngine, but that migration is a separate task. Until then, the two paths must not cross.
