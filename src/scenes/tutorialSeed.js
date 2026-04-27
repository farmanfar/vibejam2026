const PREFERRED_SEED_IDS = ['minion_001', 'minion_002']

function sharesTag(a, b) {
  return !!a && !!b && (
    (a.faction && a.faction === b.faction)
    || (a.class && a.class === b.class)
  )
}

export function pickTutorialSeedIds(availableWarriors = []) {
  const enabled = availableWarriors.filter(w => w && w.enabled !== false && (w.tier ?? 1) === 1)
  const byId = new Map(enabled.map(w => [w.id, w]))
  const preferredA = byId.get(PREFERRED_SEED_IDS[0])
  const preferredB = byId.get(PREFERRED_SEED_IDS[1])

  if (preferredA && preferredB && preferredA.id !== preferredB.id && sharesTag(preferredA, preferredB)) {
    return [preferredA.id, preferredA.id, preferredA.id, preferredB.id]
  }

  for (let i = 0; i < enabled.length; i++) {
    for (let j = i + 1; j < enabled.length; j++) {
      const a = enabled[i]
      const b = enabled[j]
      if (a.id !== b.id && sharesTag(a, b)) {
        return [a.id, a.id, a.id, b.id]
      }
    }
  }

  const fallback = enabled[0] ?? availableWarriors[0] ?? null
  if (!fallback) return []
  return [fallback.id, fallback.id, fallback.id, fallback.id]
}
