import { getWarriorById } from '../config/warriors.js'
import { getCommanders } from '../config/commanders.js'
import { LayoutEditor } from './LayoutEditor.js'
import { PlayerConfig } from './PlayerConfig.js'

const CAPTURE_FLAG = 'captureMode'
const CAPTURE_READY_KEY = '__HS_CAPTURE_READY__'
const CAPTURE_SCENE_KEY = '__HS_CAPTURE_SCENE__'

const FIXTURE_LEADERBOARD = [
  { wins: 9, losses: 0, created_at: '2026-04-01T12:00:00.000Z' },
  { wins: 9, losses: 1, created_at: '2026-04-02T12:00:00.000Z' },
  { wins: 8, losses: 0, created_at: '2026-04-03T12:00:00.000Z' },
  { wins: 8, losses: 1, created_at: '2026-04-04T12:00:00.000Z' },
  { wins: 7, losses: 0, created_at: '2026-04-05T12:00:00.000Z' },
  { wins: 7, losses: 1, created_at: '2026-04-06T12:00:00.000Z' },
  { wins: 6, losses: 1, created_at: '2026-04-07T12:00:00.000Z' },
  { wins: 6, losses: 2, created_at: '2026-04-08T12:00:00.000Z' },
]

function canUseWindow() {
  return typeof window !== 'undefined'
}

function getSearchParams() {
  return canUseWindow() ? new URLSearchParams(window.location.search) : new URLSearchParams()
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }

  return JSON.parse(JSON.stringify(value))
}

function getWarriorClone(id) {
  const warrior = getWarriorById(id)
  if (!warrior) {
    throw new Error(`[Capture] Unknown warrior id: ${id}`)
  }

  return cloneValue(warrior)
}

export function isCaptureMode() {
  return getSearchParams().get(CAPTURE_FLAG) === '1'
}

export function shouldShowLayoutOverlays() {
  return isCaptureMode() && getSearchParams().get('showLayoutOverlays') === '1'
}

export function resetCaptureReady() {
  if (!canUseWindow()) return

  window[CAPTURE_READY_KEY] = false
  window[CAPTURE_SCENE_KEY] = null
}

export function markCaptureReady(sceneKey) {
  if (!isCaptureMode() || !canUseWindow()) return

  window[CAPTURE_READY_KEY] = true
  window[CAPTURE_SCENE_KEY] = sceneKey
  console.log(`[Capture] ${sceneKey} ready`)
}

export function finalizeCaptureScene(sceneKey) {
  if (!isCaptureMode()) return

  if (shouldShowLayoutOverlays()) {
    LayoutEditor.showSceneOverlays(sceneKey)
  }

  markCaptureReady(sceneKey)
}

export function resolveCaptureRoute() {
  if (!isCaptureMode()) return null

  const params = getSearchParams()
  const preset = params.get('capturePreset')

  if (!preset) {
    console.warn('[Capture] Missing capturePreset, falling back to Menu')
    return { sceneKey: 'Menu', data: {} }
  }

  try {
    switch (preset) {
      case 'menu': {
        const name = params.get('name')
        if (name !== null) {
          PlayerConfig.setName(name)
        }

        return { sceneKey: 'Menu', data: {} }
      }

      case 'shop':
        return {
          sceneKey: 'Shop',
          data: {
            stage: 3,
            gold: 7,
            wins: 2,
            losses: 1,
            runId: 'capture-shop',
            team: [
              getWarriorClone('starter_hero'),
              getWarriorClone('starter_companion'),
              getWarriorClone('guard'),
            ],
            shopOffer: [
              getWarriorClone('archer'),
              getWarriorClone('hero'),
              getWarriorClone('starter_companion'),
              getWarriorClone('guard'),
            ],
          },
        }

      case 'battle':
        return {
          sceneKey: 'Battle',
          data: {
            stage: 4,
            gold: 6,
            wins: 3,
            losses: 1,
            runId: 'capture-battle',
            captureFreeze: true,
            leftSet: 'gears-blue',
            rightSet: 'mountain-city-1',
            team: [
              getWarriorClone('starter_hero'),
              getWarriorClone('starter_companion'),
              getWarriorClone('guard'),
            ],
            opponent: [
              getWarriorClone('archer'),
              getWarriorClone('hero'),
              getWarriorClone('warrior'),
            ],
          },
        }

      case 'gameover':
        return {
          sceneKey: 'GameOver',
          data: { wins: 5, losses: 3 },
        }

      case 'hof-menu':
        return {
          sceneKey: 'HallOfFame',
          data: {
            runId: null,
            fixtureLeaderboard: cloneValue(FIXTURE_LEADERBOARD),
          },
        }

      case 'hof-champion':
        return {
          sceneKey: 'HallOfFame',
          data: {
            wins: 9,
            losses: 0,
            runId: 'capture-hof',
            team: [
              getWarriorClone('starter_hero'),
              getWarriorClone('starter_companion'),
              getWarriorClone('guard'),
            ],
            fixtureLeaderboard: cloneValue(FIXTURE_LEADERBOARD),
          },
        }

      case 'settings':
        return { sceneKey: 'Settings', data: {} }

      case 'unitlab':
        return { sceneKey: 'UnitLab', data: {} }

      case 'commander': {
        const commanderView = params.get('commanderView') ?? null
        return {
          sceneKey: 'CommanderSelect',
          data: {
            runId: 'capture-commander',
            commanders: getCommanders().slice(0, 3),
            captureView: commanderView,
          },
        }
      }

      default:
        console.warn(`[Capture] Unknown capturePreset "${preset}", falling back to Menu`)
        return { sceneKey: 'Menu', data: {} }
    }
  } catch (error) {
    console.error(`[Capture] Failed to build preset "${preset}":`, error)
    throw new Error(`Failed to build preset "${preset}": ${error.message}`)
  }
}
