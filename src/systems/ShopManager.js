export class ShopManager {
  constructor(allWarriors, stage) {
    this.allWarriors = allWarriors
    this.stage = stage
    this.shopSize = 4
  }

  roll() {
    const maxTier = this._maxTierForStage(this.stage)
    const pool = this.allWarriors.filter(w => w.tier <= maxTier)

    const offer = []
    for (let i = 0; i < this.shopSize; i++) {
      const weights = pool.map(w => this._tierWeight(w.tier, this.stage))
      const chosen = this._weightedPick(pool, weights)
      offer.push({ ...chosen })
    }
    return offer
  }

  _maxTierForStage(stage) {
    if (stage <= 2) return 1
    if (stage <= 4) return 2
    if (stage <= 6) return 3
    return 4
  }

  _tierWeight(tier, stage) {
    const base = [50, 30, 20, 10, 5]
    const stageBonus = Math.max(0, stage - tier * 2) * 5
    return base[tier] + stageBonus
  }

  _weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * total
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]
      if (r <= 0) return items[i]
    }
    return items[items.length - 1]
  }
}
