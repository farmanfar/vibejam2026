/**
 * Merchant definitions — 6 animated merchants, each a simple looping idle
 * taken from pre-exported horizontal (or one vertical) PNG strips shipped
 * by the artist in public/assets/merchants/npcs/.
 *
 * BootScene loads each via `this.load.spritesheet(spriteKey, asset, { frameWidth, frameHeight })`
 * and registers a single global `<spriteKey>-idle` animation covering all
 * `frameCount` frames. Every consumer (MenuScene, ShopScene, MerchantSelectScene)
 * just calls `sprite.play(getMerchantIdleAnimKey(merchant))` — no atlas JSON,
 * no Aseprite tag machinery, no per-sprite animation creation.
 *
 * Frame metadata below was verified by parsing the source .aseprite binaries
 * (canvas size × tag frame count) — see public/assets/merchants/source/ for
 * the editable originals if art needs to be retouched.
 */

// Favors: each merchant has a preferred class or faction. When that merchant
// is hired for the run, the favored set counts as if it had one more member
// on the team at battle start, so threshold/scaling synergies trigger with
// one fewer actual unit. Distributed across the 3 factions (Folk/Monster/
// Robot) and 3 thematically-fitting classes for an even spread.
const MERCHANT_FAVORS = {
  traveler:        { kind: 'faction', name: 'Robot'     },
  skull_trader:    { kind: 'faction', name: 'Monster'   },
  fruit_vendor:    { kind: 'faction', name: 'Folk'      },
  bread_vendor:    { kind: 'class',   name: 'Knight'    },
  fortune_teller:  { kind: 'class',   name: 'Ancient'   },
  mushroom_dealer: { kind: 'class',   name: 'Assassin'  },
};

const BASE_MERCHANTS = [
  { id: 'traveler',        name: 'Wandering Trader',
    spriteKey: 'merchant-traveler',
    asset: 'assets/merchants/npcs/traveler_blue.png',
    frameWidth: 24,  frameHeight: 32,  frameCount: 10,
    blurb: '"I\'ve seen a thing or two."' },

  { id: 'skull_trader',    name: 'Skull Trader',
    spriteKey: 'merchant-skull_trader',
    asset: 'assets/merchants/npcs/skull_trader_blue.png',
    frameWidth: 41,  frameHeight: 33,  frameCount: 10,
    blurb: '"Pre-owned craniums."' },

  { id: 'fruit_vendor',    name: 'Fruit Vendor',
    spriteKey: 'merchant-fruit_vendor',
    asset: 'assets/merchants/npcs/fruit_vendor_blue.png',
    frameWidth: 46,  frameHeight: 38,  frameCount: 12,
    blurb: '"Only the ripest."' },

  { id: 'bread_vendor',    name: 'Bread Vendor',
    spriteKey: 'merchant-bread_vendor',
    asset: 'assets/merchants/npcs/bread_vendor_blue.png',
    frameWidth: 48,  frameHeight: 41,  frameCount: 24,
    blurb: '"Still warm."' },

  { id: 'fortune_teller',  name: 'Fortune Teller',
    spriteKey: 'merchant-fortune_teller',
    asset: 'assets/merchants/npcs/fortune_teller.png',
    frameWidth: 46,  frameHeight: 43,  frameCount: 24,
    blurb: '"Your future is ... coin."' },

  { id: 'mushroom_dealer', name: 'Mushroom Dealer',
    spriteKey: 'merchant-mushroom_dealer',
    asset: 'assets/merchants/npcs/mushroom_dealer.png',
    // Vertical strip — Phaser's spritesheet loader stacks frames top-to-bottom
    // when frameWidth == image width. 24 frames of 111×53.
    frameWidth: 111, frameHeight: 53, frameCount: 24,
    blurb: '"Fresh spores, half price."' },
];

export const MERCHANTS = BASE_MERCHANTS.map((m) => ({
  ...m,
  favors: MERCHANT_FAVORS[m.id] ?? null,
}));

export function getMerchants() {
  return [...MERCHANTS];
}

export function getMerchantById(id) {
  return MERCHANTS.find((m) => m.id === id) ?? null;
}

export function pickRandomMerchants(count = 3) {
  const shuffled = [...MERCHANTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Global animation key to play on a merchant sprite. BootScene registers
 * exactly one anim per merchant at `<spriteKey>-idle`, covering all frames
 * of the strip. Unique keys per merchant mean no global collisions — any
 * scene can call `sprite.play(getMerchantIdleAnimKey(m))` without setup.
 */
export function getMerchantIdleAnimKey(merchant) {
  return `${merchant.spriteKey}-idle`;
}

// ---------------------------------------------------------------------------
// Favors — tooltip + combat helpers
// ---------------------------------------------------------------------------

/**
 * Raw favor descriptor `{ kind, name }` or null. Combat adapter plumbs this
 * into CombatCore as `team.favor` so class/faction initialize hooks can add
 * +1 to their counted-member logic (see combat/classes/* and combat/factions/*).
 */
export function getMerchantFavor(merchant) {
  return merchant?.favors ?? null;
}

/** Short label rendered on the merchant card: e.g. "FAVORS KNIGHT". */
export function getMerchantFavorLabel(merchant) {
  const f = merchant?.favors;
  if (!f?.name) return '';
  return `FAVORS ${String(f.name).toUpperCase()}`;
}

/** Verbose hover tooltip: "Needs 1 less Knight to trigger the class set bonus." */
export function getMerchantFavorTooltip(merchant) {
  const f = merchant?.favors;
  if (!f?.name) return '';
  const bucket = f.kind === 'faction' ? 'faction' : 'class';
  return `Needs 1 less ${f.name} to trigger the ${bucket} set bonus.`;
}
