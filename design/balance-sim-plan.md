# Balance Sim — Sonnet Plan (v4, post-verification)

**This supersedes all prior versions of this plan.**

**Do NOT invoke Codex, codex:rescue, or any Codex tooling.** The user drives Codex review externally.

**Changes from v3 (all verified against source this session):**
- Resonance peak uses `targetInstanceId` explicitly — the v3 waterfall would have credited the *source* Ancient, which is wrong (the buff lands on the target).
- `isAbilityLogKind` replaced with an explicit **whitelist** — suffix matching would include `action_start` (a generic engine event fired per action) and would miss `infectious_bite_roll`, `gunner_startup_shot`, `death_defy_skip`.
- Files touched now includes `.gitignore` (entire `reports/` dir is currently gitignored).
- `design/balance-sim-plan.md` is overwritten, not deleted.
- Test fixtures explicitly stamp `_instanceId` via `makeUnit` overrides; reanimate tests use **synthetic logs** (hand-built `log.entries`) for determinism.
- Seed-range clarification: each battle uses a unique offset within its subcommand's range — no reuse across pairs.
- Merchant-impact side-swap: the favor must swap sides alongside the team.

---

## Context

We have a working headless combat engine (`src/systems/combat/CombatCore.js`) and a single-fixture bulk sim (`scripts/sim-battle.mjs`). Existing `npm run sim:balance` runs a fixed fixture 1000× and writes `{seed, winner, rounds}` per battle — insufficient to drive balance decisions.

We're building a balance-analysis suite **on top of** the existing engine that aggregates every battle's log into per-unit telemetry (damage, kills, deaths, reanimates, survival, ability fires), runs matchup matrices, themed synergy comparisons, and merchant-favor impact studies, then emits markdown + CSV reports the user can read to derive balance changes. Stays deterministic, reproducible, under 10 minutes for `full`.

Out of scope: economy/shop simulation (design spec not yet implemented), star levels, dupe merge, commander-vs-commander tournaments. Deferred.

## Critical engine facts (verified — do not re-derive)

- **Attack log kind is `attack`** (`CombatCore.js:441`). Payload includes `attackerInstanceId`, `targetInstanceId`, `damage`, `blocked`, `hpAfter`.
- **Generic damage kind is `damage`** (`CombatCore.js:518`). `damage.attacker` can be `null`.
- **Poison kind is `poison_tick`** (`status.js:68`). No attacker field. `hpAfter` can be **negative** (no clamp).
- **Reanimate SKIPS `faint_final`.** `monsterFaction.onFaint` clears `unit.dying = false` and emits `reanimate_success`; the dying-batch compaction loop only logs `faint_final` for units where `dying === true` still. So a reanimated unit's trace is: `faint_start` → `reanimate_success` (no `faint_final`).
- **Death-Defy also SKIPS `faint_final`** via the same mechanism (interrupt-priority handler clears `dying`).
- **`_snapshot` omits tier/class/faction** (`CombatCore.js:729-741`) — we add them.
- **`_runTick` has 4 unconditional `console.log` calls** (`CombatCore.js:274, 322, 335, 341`) — ~60M lines at 1M battles. Gate behind `verbose`.
- **`resonance_stack` payload** carries both `sourceInstanceId` AND `targetInstanceId`; the stack count applies to the **target** (the Ancient receiving +1). `stacks` field is the post-grant value, so `Math.max` on every entry gives the peak.
- **`action_start` fires for EVERY action** (`CombatCore.js:367, 381, 394, 405`) with `source` ∈ `{override_single, ability, class, default}`. It is a generic engine event, NOT an ability fire.
- **Ability events use inconsistent source-id fields.** Some use `instanceId`, some use `sourceInstanceId`, some have no instance id at all (only `unit`/`slot`/`team`). Aggregator uses `entry.unit` (the `unitId`) as the `abilityFires` key — see §5 rationale.
- **Registry is expensive.** Build once per CLI invocation; reuse across every `new CombatCore(...)`.
- **`reports/` is gitignored.** Committing the golden summary requires a `.gitignore` exception.
- **`testHelpers.js` `makeUnit` does NOT stamp `_instanceId`.** Tests must pass it as an override, e.g. `makeUnit('p1', { _instanceId: 'p1#p0' })`, or use synthetic logs.

## Files touched

```
CREATE  scripts/sim-balance.mjs                                 orchestrator CLI (≤800 lines, split if larger)
CREATE  scripts/lib/battle-telemetry.mjs                        pure aggregator
CREATE  scripts/lib/team-generator.mjs                          stamping + themes
CREATE  scripts/lib/report-writers.mjs                          md / csv / jsonl
CREATE  src/systems/combat/__tests__/telemetry.test.js
CREATE  src/systems/combat/__tests__/team-generator.test.js
EDIT    src/systems/combat/CombatCore.js                        verbose flag + snapshot fields
EDIT    scripts/sim-battle.mjs                                  pass verbose: bulk===1 || --verbose
EDIT    package.json                                            repoint sim:balance (no 'full' arg)
EDIT    .gitignore                                              allow reports/balance/golden/summary.md
EDIT    scripts/CLAUDE.md                                       document sim-balance.mjs
OVERWRITE design/balance-sim-plan.md                            replace with final v4 text for in-tree reference
```

All test files use `__tests__/` (matching repo convention). Anything outside this list: stop and explain.

## Phase-by-phase (commit at each `[COMMIT]`)

### Phase 1 — Engine changes

**Edit `CombatCore.js`:**

1. Constructor: `constructor({ registry, seed = 0, verbose = false } = {})`; `this.verbose = verbose`.
2. Gate the four `console.log` calls at lines ~274, ~322, ~335, ~341 behind `if (this.verbose)`. Keep the `console.warn` at line 312 unconditional.
3. Extend `_snapshot` to include `tier`, `class`, `faction`, `maxHp`.

**Edit `sim-battle.mjs`:** pass `verbose: verbose || bulk === 1` to `new CombatCore(...)`.

**[COMMIT] — "CombatCore: verbose flag, tier/class/faction in snapshot"**

---

### Phase 2 — battle-telemetry.mjs + tests

Pure `analyzeResult(result)` function; reads only `result.log.entries`. See §5 for output shape and §6 for full algorithm.

Tests: mix of (a) stamped real battles and (b) synthetic hand-built log entries. See §6 for required test list.

**[COMMIT] — "Add battle-telemetry aggregator with vitest coverage"**

---

### Phase 3 — team-generator.mjs + tests

`stampTeam`, `randomTeam`, `themedTeam`, `allPairs`. Instance-id format: `` `${def.id}#${teamId}${slot}` ``.

**[COMMIT] — "Add team-generator with stamping, themes, tests"**

---

### Phase 4 — report-writers.mjs

`writeMarkdown`, `writeCsv`, `appendJsonl`, `makeReportDir`. No tests required.

**[COMMIT] — "Add report-writers (md/csv/jsonl + dir helper)"**

---

### Phase 5 — sim-balance.mjs orchestrator

Subcommands: `per-unit`, `matchup-matrix`, `class-synergy`, `faction-synergy`, `merchant-impact`, `full` (default when no subcommand given).

Seed ranges:
- `per-unit`:        `[0 .. 200_000)`
- `matchup-matrix`:  `[200_000 .. 500_000)`
- `class-synergy`:   `[500_000 .. 600_000)`
- `faction-synergy`: `[600_000 .. 700_000)`
- `merchant-impact`: `[700_000 .. 800_000)`

Registry built ONCE at CLI startup. Every A-vs-B runs both sides with distinct seeds (see §8).

**[COMMIT] — "Add sim-balance orchestrator with 5 subcommands + summary"**

---

### Phase 6 — Validation + docs

- `.gitignore` exception to allow `reports/balance/golden/summary.md`.
- Generate golden fixture: `npm run sim:balance -- --seed 0 --out reports/balance/golden`.
- Overwrite `design/balance-sim-plan.md` with this v4 text.
- Update `scripts/CLAUDE.md`.

**[COMMIT] — "Balance-sim golden fixture + docs"**

## 5 — Telemetry output shape

```js
{
  meta: {
    winner: 'player' | 'enemy' | 'draw',
    rounds: Number,
    seed: Number,
    playerFavor: { kind, name } | null,
    enemyFavor:  { kind, name } | null,
    environmentalDeaths: Number,
  },
  perTeam: {
    player: { damageDealt, unitsLost, favor },
    enemy:  { damageDealt, unitsLost, favor },
  },
  perUnit: {
    [instanceId: string]: {
      unitId, team, startSlot, tier, class, faction,
      damageDealt, damageTaken, kills, deaths,
      survivalRounds: Number | null,
      reanimates,
      resonanceStacksPeak,
    }
  },
  abilityFires: {
    [unitId: string]: { [logKind: string]: Number }
  }
}
```

**Deliberate design choices:**
- Per-instance `abilityFires` dropped — ability log events have inconsistent source-id fields.
- `environmentalDeaths` is meta-level (single counter), not per-unit.
- Reanimated-then-survived units have `deaths === 0` (no `faint_final` ever fired).

## 6 — Kill / death / survival / reanimate algorithm

Seed `perUnit` from `battle_init` (always `entries[0]`). Walk remaining entries:

- `round_start` → update `currentRound`
- `attack` / `damage` → credit `damageDealt`/`damageTaken`; if `!blocked && hpAfter <= 0`, set `tentativeKillBy`
- `poison_tick` → credit `damageTaken`; if `hpAfter <= 0`, set `tentativeKillBy` with `attacker: null`
- `faint_final` → confirm kill: `deaths++`, `survivalRounds = round`, credit attacker `kills++` or `environmentalDeaths++`
- `reanimate_success` → `reanimates++`, clear tentative; **DO NOT** decrement deaths (never incremented)
- `resonance_stack` → `Math.max` peak on **`targetInstanceId`** (NOT source)
- `ancient_favor_init` → `Math.max` peak on `entry.instanceId`
- Whitelisted ability kind → `abilityFires[entry.unit][entry.kind]++`

**Correctness walkthrough:**
- Death-Defy: tentative set, `faint_start` emitted, handler clears `dying`, no `faint_final`. Tentative expires unclaimed. ✓
- Monster reanimate: `reanimate_success` clears tentative, increments reanimates, no death. ✓
- Poison kill: `attacker: null` in tentative → `environmentalDeaths++` on `faint_final`. ✓
- Reanimated-then-died: `reanimates: 1, deaths: 1` after later `faint_final`. ✓

## 7 — Ability-fire whitelist (explicit)

**Do NOT suffix-match.** `action_start` fires for every action and must be excluded.

```js
const ABILITY_FIRE_WHITELIST = new Set([
  // Class initializers
  'ancient_favor_init', 'grunt_synergy_init', 'knight_honorbound_init',
  'berserker_synergy_init', 'robot_hp_init',
  // Class active effects
  'ancient_aoe_start', 'gunner_startup_shot',
  // Faction effects
  'folk_favor_buff', 'folk_death_buff', 'folk_death_buff_fizzle',
  // Archer Death-Defy
  'death_defy_trigger', 'death_defy_repositioned', 'death_defy_aoe', 'death_defy_skip',
  // Abilities
  'snipers_venom_start', 'ricochet_volley_start', 'piercing_bolt_start',
  'bloodlust_bonus_start', 'ricochet_shot_fire', 'infectious_bite_roll',
  'heart_slam_start', 'sacrifice_pass_proc', 'reactive_reinforcement_proc',
  'kill_piercing_start', 'lobbed_bolt_start', 'spiteful_demise_start',
  'volatile_payload_start', 'sweeping_strikes_start',
]);
```

**Maintenance rule:** when adding a new ability, update this whitelist. See `src/systems/combat/CLAUDE.md §Adding-a-New-Unit`.

## 8 — Side-bias handling

Every A-vs-B comparison runs both sides with distinct seeds:

```js
seedP = base + c * reps * 2 + r * 2       // A as player
seedE = base + c * reps * 2 + r * 2 + 1   // A as enemy
```

`per-unit` (mirror match) is exempt.

**Merchant-impact:** favor moves with the team on the side-swap. Each merchant gets 4 runs per rep (with-as-player, with-as-enemy, without-as-player, without-as-enemy).

## 9 — Report formats

### `summary.md`

Header with total battles, duration, seed base, pool size. Tables: outlier units (avg WR across all matchups, ±10% threshold), synergy deltas (flagged at ±10%), merchant favor impact. Links to all five report files.

### `unit-matchup-matrix.csv`

Rows = player unit, cols = enemy unit, values = A's win rate after side-swap.

### `raw-runs.jsonl`

Matchup-matrix only (thin). One JSON per line: `{sub, seed, side, player, enemy, winner, rounds, dmgP, dmgE}`.

## 10 — Done criteria

- `npm test` all green (telemetry + team-generator tests included)
- `npm run sim` single-matchup prints tick logs
- `npm run sim:balance` completes full run <10 min
- `npm run sim:balance -- --seed 0 --out reports/balance/golden` works without arg duplication
- `reports/balance/golden/summary.md` committed; other files gitignored
- `scripts/CLAUDE.md` has `sim-balance.mjs` section
- `design/balance-sim-plan.md` overwritten with v4 content
- Zero changes outside the file list
- No per-battle `console.log` in sim hot paths

## 11 — Known gotchas

- Death-Defy and Monster reanimate BOTH skip `faint_final`. Don't assume `hpAfter === 0` → death.
- Poison `hpAfter` can be negative. Use `<= 0`.
- `damage.attacker` can be null; `poison_tick` has no attacker at all. Guard damageDealt attribution.
- `resonance_stack` buffs the **target**, not the source. Credit peak to `targetInstanceId`.
- `action_start` fires for every action — NOT an ability fire. Whitelist ensures exclusion.
- `testHelpers.makeUnit` doesn't stamp `_instanceId` — pass `{ _instanceId: 'p1#p0' }` override.
- Compaction changes `unit.slot`; instance IDs are the stable identity.
- `battle_init` (log.entries[0]) is the authoritative roster.

## 12 — Out of scope

- Economy / shop / credits simulation
- Star levels, duplicate merges, commander rotation
- `worker_threads` parallelism
- `assists` telemetry
- HTML dashboard
- Per-instance `abilityFires`
