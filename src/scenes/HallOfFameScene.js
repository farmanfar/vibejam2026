import { Scene } from 'phaser'
import { Theme, FONT_KEY, PixelLabel, PixelButton, FloatingBanner } from '../ui/index.js'
import { GhostManager } from '../systems/GhostManager.js'
import { AchievementManager } from '../systems/AchievementManager.js'
import { AchievementToast }   from '../widgets/AchievementToast.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js'
import { SceneDust } from '../rendering/SceneDust.js'
import { VibeJamPortal } from '../widgets/VibeJamPortal.js'

export class HallOfFameScene extends Scene {
  constructor() {
    super('HallOfFame')
  }

  init(data = {}) {
    this.wins = data.wins ?? 0
    this.losses = data.losses ?? 0
    this.team = Array.isArray(data.team) ? data.team.map(unit => ({ ...unit })) : []
    this.runId = data.runId ?? null
    this.fixtureLeaderboard = Array.isArray(data.fixtureLeaderboard)
      ? data.fixtureLeaderboard.map(entry => ({ ...entry }))
      : null
    this.commander = data.commander ?? null
    this.fromMenu = !this.runId
  }

  create() {
    const { width, height } = this.cameras.main

    // CRT post-process (strongUi preset — narrative/end screens)
    SceneCrt.attach(this, 'strongUi')
    // Ambient dust — celebratory golden sparkles
    SceneDust.attach(this, 'hallOfFame')

    if (this.fromMenu) {
      const hofTitle = new PixelLabel(this, width / 2, height * 0.14, 'HALL OF FAME', {
        scale: 6, color: 'accent', align: 'center',
      })
      LayoutEditor.register(this, 'title', hofTitle, width / 2, height * 0.14)
    } else {
      const champTitle = new PixelLabel(this, width / 2, height * 0.18, 'CHAMPION!', {
        scale: 8, color: 'accent', align: 'center',
      })
      LayoutEditor.register(this, 'title', champTitle, width / 2, height * 0.18)

      const record = new PixelLabel(this, width / 2, height * 0.34, `${this.wins} - ${this.losses}`, {
        scale: 3, color: 'muted', align: 'center',
      })
      LayoutEditor.register(this, 'record', record, width / 2, height * 0.34)

      if (!this.fixtureLeaderboard) {
        AchievementManager.onChampion({ scene: this, roster: this.team })
        AchievementToast.flushPending(this)
        GhostManager.submitChampion(this.runId, this.team, this.wins, this.losses)
      }
    }

    const dividerY = this.fromMenu ? height * 0.26 : height * 0.42
    const gfx = this.add.graphics()
    gfx.lineStyle(1, Theme.panelBorder, 0.5)
    gfx.lineBetween(width * 0.2, dividerY, width * 0.8, dividerY)

    const leaderY = this.fromMenu ? height * 0.32 : height * 0.50
    this.leaderText = this.add.bitmapText(width / 2, leaderY, FONT_KEY, '', 14)
      .setOrigin(0.5, 0)
      .setTint(Theme.mutedText)
    LayoutEditor.register(this, 'leaderboard', this.leaderText, width / 2, leaderY)
    this.leaderText.setText('Loading...')

    if (this.fromMenu) {
      // Leaderboard viewer — no power-off on exit (just a browser)
      const backBtn = new PixelButton(this, width / 2, height * 0.82, 'BACK', () => {
        this.scene.start('Menu')
      }, { style: 'filled', scale: 3, bg: Theme.error, pill: true, width: 90, height: 32 })
      LayoutEditor.register(this, 'backBtn', backBtn, width / 2, height * 0.82)
    } else {
      // Champion end-of-run — power-off plays on exit
      const playAgainBtn = new PixelButton(this, width / 2 - 110, height * 0.82, 'PLAY AGAIN', () => {
        startSceneWithCrtPolicy(this, 'ModeSelect', { runId: crypto.randomUUID() })
      }, { style: 'filled', scale: 3, bg: Theme.accent, width: 180, height: 44 })
      LayoutEditor.register(this, 'playAgainBtn', playAgainBtn, width / 2 - 110, height * 0.82)

      const menuBtn = new PixelButton(this, width / 2 + 110, height * 0.82, 'MAIN MENU', () => {
        startSceneWithCrtPolicy(this, 'Menu')
      }, { style: 'text', scale: 2 })
      LayoutEditor.register(this, 'menuBtn', menuBtn, width / 2 + 110, height * 0.82)
    }

    let onPortalUpdate = null
    if (!this.fromMenu) {
      const portalX = width * 0.85
      const portalY = height * 0.55
      const vibejamPortal = new VibeJamPortal(this, portalX, portalY)
      LayoutEditor.register(this, 'vibejamPortal', vibejamPortal, portalX, portalY)
      onPortalUpdate = (_t, delta) => vibejamPortal.advance(delta)
      this.events.on('update', onPortalUpdate)
    }

    this.events.once('shutdown', () => {
      console.log('[HallOfFame] Shutdown')
      if (onPortalUpdate) this.events.off('update', onPortalUpdate)
      LayoutEditor.unregisterScene('HallOfFame')
    })

    if (this.fixtureLeaderboard) {
      this._applyLeaderboard(this.fixtureLeaderboard)
      console.log(`[HallOfFame] Scene created (fromMenu: ${this.fromMenu})`)
      finalizeCaptureScene('HallOfFame')
      return
    }

    GhostManager.fetchLeaderboard().then(result => {
      this._applyLeaderboard(result)
      finalizeCaptureScene('HallOfFame')
    })

    console.log(`[HallOfFame] Scene created (fromMenu: ${this.fromMenu})`)
  }

  _applyLeaderboard(result) {
    if (result === null) {
      this.leaderText.setText('COULD NOT LOAD LEADERBOARD')
      console.warn('[HallOfFame] Leaderboard fetch failed')
      return
    }

    if (result.length === 0) {
      this.leaderText.setText('NO CHAMPIONS YET')
      console.log('[HallOfFame] Leaderboard is empty')
      return
    }

    const lines = result.slice(0, 8).map((entry, index) =>
      `${index + 1}. ${entry.wins}W - ${entry.losses}L`
    )
    this.leaderText.setText(lines.join('\n'))
    console.log(`[HallOfFame] Showing ${lines.length} leaderboard entries`)
  }
}
