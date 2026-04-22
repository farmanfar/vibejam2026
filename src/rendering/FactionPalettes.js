/**
 * Parallax set registry.
 * Reads parallax-manifest.json (generated from PENUSBMIC art packs).
 * Layer order comes from HammerTime's ParallaxPreviewScreen (layer-order.json)
 * or alphabetical fallback.
 */

import MANIFEST from './parallax-manifest.json'

/** All available parallax set IDs. */
export const PARALLAX_SET_IDS = Object.keys(MANIFEST)

/** Minimum layer count for good parallax depth (skip 2-layer sets). */
const MIN_LAYERS = 3

/** Sets available for random battle backgrounds (28/29 have verified layer order). */
export const USABLE_SET_IDS = PARALLAX_SET_IDS.filter(
  id => MANIFEST[id].length >= MIN_LAYERS
)

/**
 * Get the layer filenames for a parallax set (back-to-front order).
 * @param {string} setId - e.g. 'gears-blue'
 * @returns {string[]} Layer filenames in render order
 */
export function getSetLayers(setId) {
  return MANIFEST[setId] || []
}

/**
 * Get the asset folder path for a parallax set.
 * @param {string} setId
 * @returns {string} e.g. 'assets/parallax/gears-blue'
 */
export function getSetFolder(setId) {
  return `assets/parallax/${setId}`
}

/**
 * Pick two different random parallax sets for a battle.
 * @returns {{ left: string, right: string }}
 */
export function pickRandomSets() {
  const pool = USABLE_SET_IDS.length >= 2 ? USABLE_SET_IDS : PARALLAX_SET_IDS
  const leftIdx = Math.floor(Math.random() * pool.length)
  let rightIdx = Math.floor(Math.random() * (pool.length - 1))
  if (rightIdx >= leftIdx) rightIdx++

  const left = pool[leftIdx]
  const right = pool[rightIdx]
  console.log(`[Parallax] Picked sets: left=${left} (${MANIFEST[left].length} layers) right=${right} (${MANIFEST[right].length} layers)`)
  return { left, right }
}

/** Mountain-city palette variants — same scene composition, four color points. */
export const MOUNTAIN_CITY_IDS = ['mountain-city-1', 'mountain-city-2', 'mountain-city-3', 'mountain-city-4']

/**
 * Pick two different mountain-city palette variants (guaranteed distinct).
 * Used by BattleScene so every fight stages on the same stable scene.
 * @returns {{ left: string, right: string }}
 */
export function pickMountainCitySets() {
  const leftIdx = Math.floor(Math.random() * MOUNTAIN_CITY_IDS.length)
  let rightIdx = Math.floor(Math.random() * (MOUNTAIN_CITY_IDS.length - 1))
  if (rightIdx >= leftIdx) rightIdx++
  const left = MOUNTAIN_CITY_IDS[leftIdx]
  const right = MOUNTAIN_CITY_IDS[rightIdx]
  console.log(`[Parallax] Picked mountain-city sets: left=${left} (${MANIFEST[left].length} layers) right=${right} (${MANIFEST[right].length} layers)`)
  return { left, right }
}

/**
 * Get all texture keys + paths for preloading every parallax set.
 * @returns {{ key: string, path: string }[]}
 */
export function getAllParallaxAssets() {
  const assets = []
  for (const setId of PARALLAX_SET_IDS) {
    const layers = MANIFEST[setId]
    const folder = getSetFolder(setId)
    for (let i = 0; i < layers.length; i++) {
      assets.push({
        key: `plx_${setId}_${i}`,
        path: `${folder}/${layers[i]}`,
      })
    }
  }
  return assets
}
