// PlaytestLogger — append-only session log of battles + shop activity.
//
// Each page load starts a new session. Every call to one of the `log*`
// functions POSTs a single JSONL entry to the Vite dev middleware at
// /__playtest-log, which appends to reports/playtest/<session>.jsonl.
//
// Guarded by import.meta.env.DEV — no-op in production builds. Scenes can
// import unconditionally.
//
// Read back with: cat reports/playtest/<session>.jsonl | jq
//
// Entry ordering: fetches are fire-and-forget so receive-order can drift
// slightly. Use the monotonic `seq` field when reconstructing.

const ENABLED = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

const SESSION_ID = `playtest-${new Date().toISOString().replace(/[:.]/g, '-')}`;
let _seq = 0;

if (ENABLED) {
  console.log(`[Playtest] Session started — ${SESSION_ID}`);
}

function nextSeq() {
  return _seq++;
}

function _post(entry) {
  if (!ENABLED) return;
  fetch('/__playtest-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
    keepalive: true,
  }).catch((e) => console.error('[Playtest] export failed:', e));
}

function _envelope(scene, type, payload) {
  return {
    session: SESSION_ID,
    seq: nextSeq(),
    timestamp: new Date().toISOString(),
    type,
    stage: scene?.stage ?? null,
    wins: scene?.wins ?? null,
    losses: scene?.losses ?? null,
    credits: scene?.gold ?? scene?.credits ?? null,
    runId: scene?.runId ?? null,
    ...payload,
  };
}

// Unit snapshot — only serializable primitives. Used for team and shop rolls.
export function snapshotUnit(w) {
  if (!w) return null;
  return {
    id: w.id ?? null,
    name: w.name ?? null,
    faction: w.faction ?? null,
    class: w.class ?? null,
    tier: w.tier ?? null,
    hp: w.hp ?? null,
    maxHp: w.maxHp ?? w.hp ?? null,
    atk: w.atk ?? null,
    range: w.range ?? null,
    ability_id: w.ability_id ?? null,
    stars: w.stars ?? 1,
    cost: w.cost ?? null,
    _instanceId: w._instanceId ?? null,
  };
}

function snapshotTeam(team) {
  if (!Array.isArray(team)) return [];
  return team.map(snapshotUnit).filter(Boolean);
}

// ---------- battle ----------

export function logBattle({ scene, result, playerTeam, enemyTeam }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'battle', {
    seed: result?.seed ?? null,
    winner: result?.winner ?? (result?.won ? 'player' : 'enemy'),
    won: result?.won ?? null,
    rounds: result?.rounds ?? null,
    playerTeam: snapshotTeam(playerTeam),
    enemyTeam: snapshotTeam(enemyTeam),
    rawLog: Array.isArray(result?.rawLog) ? result.rawLog : [],
  });
  console.log(`[Playtest] battle seq=${entry.seq} winner=${entry.winner} rounds=${entry.rounds} rawLog=${entry.rawLog.length}`);
  _post(entry);
}

// ---------- shop ----------

export function logShopRound({ scene, rolled }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'shop_round', {
    rolled: snapshotTeam(rolled),
    team: snapshotTeam(scene?.team),
    commander: scene?.commander ? { id: scene.commander.id ?? null, name: scene.commander.name ?? null } : null,
  });
  console.log(`[Playtest] shop_round seq=${entry.seq} stage=${entry.stage} team=${entry.team.length}`);
  _post(entry);
}

export function logShopBuy({ scene, unit, cost, creditsAfter, starLevel }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'shop_buy', {
    unit: snapshotUnit(unit),
    cost: cost ?? null,
    creditsAfter: creditsAfter ?? null,
    starLevel: starLevel ?? 1,
  });
  console.log(`[Playtest] shop_buy seq=${entry.seq} unit=${entry.unit?.id} cost=${entry.cost}`);
  _post(entry);
}

export function logShopSell({ scene, unit, refund, creditsAfter }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'shop_sell', {
    unit: snapshotUnit(unit),
    refund: refund ?? null,
    creditsAfter: creditsAfter ?? null,
  });
  console.log(`[Playtest] shop_sell seq=${entry.seq} unit=${entry.unit?.id} refund=${entry.refund}`);
  _post(entry);
}

export function logShopReroll({ scene, cost, creditsAfter, rolled }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'shop_reroll', {
    cost: cost ?? null,
    creditsAfter: creditsAfter ?? null,
    rolled: snapshotTeam(rolled),
  });
  console.log(`[Playtest] shop_reroll seq=${entry.seq} cost=${entry.cost}`);
  _post(entry);
}

export function logShopCombine({ scene, unit, fromSlot, toSlot, hostSlotAfter, newStars }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'shop_combine', {
    unit: snapshotUnit(unit),
    fromSlot: fromSlot ?? null,
    toSlot: toSlot ?? null,
    hostSlotAfter: hostSlotAfter ?? null,
    newStars: newStars ?? null,
  });
  console.log(`[Playtest] shop_combine seq=${entry.seq} unit=${entry.unit?.id} ${entry.fromSlot}->${entry.toSlot} stars=${entry.newStars}`);
  _post(entry);
}

// ---------- commander / merchant (stubs, wired when those systems exist) ----------

export function logCommanderAssigned({ scene, commander }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'commander_assigned', {
    commander: commander ? {
      id: commander.id ?? null,
      name: commander.name ?? null,
      synergyBonuses: commander.synergyBonuses ?? null,
    } : null,
  });
  console.log(`[Playtest] commander_assigned seq=${entry.seq} commander=${entry.commander?.name}`);
  _post(entry);
}

export function logCommanderSwap({ scene, from, to, cost }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'commander_swap', {
    from: from ? { id: from.id ?? null, name: from.name ?? null } : null,
    to: to ? { id: to.id ?? null, name: to.name ?? null } : null,
    cost: cost ?? null,
  });
  console.log(`[Playtest] commander_swap seq=${entry.seq} ${entry.from?.name} -> ${entry.to?.name}`);
  _post(entry);
}

export function logMerchantOffer({ scene, merchant }) {
  if (!ENABLED) return;
  const entry = _envelope(scene, 'merchant_offer', {
    merchant: merchant ? {
      id: merchant.id ?? null,
      type: merchant.type ?? null,
      quote: merchant.quote ?? null,
      weightedBy: merchant.weightedBy ?? null,
    } : null,
  });
  console.log(`[Playtest] merchant_offer seq=${entry.seq} type=${entry.merchant?.type}`);
  _post(entry);
}

export function getSessionId() {
  return SESSION_ID;
}
