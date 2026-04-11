/**
 * Shop system — rolls warriors from the pool, weighted by tier and round.
 * Higher rounds unlock higher tiers.
 */
export class ShopManager {
  constructor(allWarriors, round) {
    this.allWarriors = allWarriors;
    this.round = round;
    this.shopSize = 4;
  }

  /** Roll a new set of warriors for the shop */
  roll() {
    const maxTier = this._maxTierForRound(this.round);
    const pool = this.allWarriors.filter(w => w.tier <= maxTier);

    const offer = [];
    for (let i = 0; i < this.shopSize; i++) {
      const weights = pool.map(w => this._tierWeight(w.tier, this.round));
      const chosen = this._weightedPick(pool, weights);
      offer.push({ ...chosen }); // clone to avoid mutation
    }
    return offer;
  }

  _maxTierForRound(round) {
    if (round <= 2) return 1;
    if (round <= 4) return 2;
    if (round <= 6) return 3;
    return 4;
  }

  _tierWeight(tier, round) {
    // Lower tiers always available but become less likely as rounds progress
    const base = [50, 30, 20, 10, 5];
    const roundBonus = Math.max(0, round - tier * 2) * 5;
    return base[tier] + roundBonus;
  }

  _weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}
