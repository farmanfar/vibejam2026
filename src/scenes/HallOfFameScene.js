import { Scene } from 'phaser'
import { Theme, FONT_KEY, PixelLabel, PixelButton, FloatingBanner } from '../ui/index.js'
import { GhostManager } from '../systems/GhostManager.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'

export class HallOfFameScene extends Scene {
  constructor() {
    super('HallOfFame')
  }

  init(data = {}) {
    this.wins = data.wins ?? 0
    this.losses = data.losses ?? 0
    this.team = data.team ?? []
    this.runId = data.runId ?? null
    this.fromMenu = !this.runId
  }

  create() {
    const { width, height } = this.cameras.main

    // Scanlines
    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.08)
    }

    if (this.fromMenu) {
      // Accessed from main menu — just show leaderboard
      const hofTitle = new PixelLabel(this, width / 2, height * 0.14, 'HALL OF FAME', {
        scale: 6, color: 'accent', align: 'center',
      })
      LayoutEditor.register(this, 'title', hofTitle, width / 2, height * 0.14)
    } else {
      // Accessed after winning — show champion title + record
      const champTitle = new PixelLabel(this, width / 2, height * 0.18, 'CHAMPION!', {
        scale: 8, color: 'accent', align: 'center',
      })
      LayoutEditor.register(this, 'title', champTitle, width / 2, height * 0.18)

      const record = new PixelLabel(this, width / 2, height * 0.34, `${this.wins} - ${this.losses}`, {
        scale: 3, color: 'muted', align: 'center',
      })
      LayoutEditor.register(this, 'record', record, width / 2, height * 0.34)

      GhostManager.submitChampion(this.runId, this.team, this.wins, this.losses)
    }

    // Divider
    const dividerY = this.fromMenu ? height * 0.26 : height * 0.42
    const gfx = this.add.graphics()
    gfx.lineStyle(1, Theme.panelBorder, 0.5)
    gfx.lineBetween(width * 0.2, dividerY, width * 0.8, dividerY)

    // Leaderboard text
    const leaderY = this.fromMenu ? height * 0.32 : height * 0.50
    this.leaderText = this.add.bitmapText(width / 2, leaderY, FONT_KEY, '', 7 * 2)
      .setOrigin(0.5, 0).setTint(Theme.mutedText)
    LayoutEditor.register(this, 'leaderboard', this.leaderText, width / 2, leaderY)

    // Loading indicator
    this.leaderText.setText('Loading...')

    GhostManager.fetchLeaderboard().then(result => {
      if (result === null) {
        // Error or offline
        this.leaderText.setText('COULD NOT LOAD LEADERBOARD')
        console.warn('[HallOfFame] Leaderboard fetch failed')
      } else if (result.length === 0) {
        // Genuine empty
        this.leaderText.setText('NO CHAMPIONS YET')
        console.log('[HallOfFame] Leaderboard is empty')
      } else {
        const lines = result.slice(0, 8).map((e, i) =>
          `${i + 1}. ${e.wins}W - ${e.losses}L`
        )
        this.leaderText.setText(lines.join('\n'))
        console.log(`[HallOfFame] Showing ${lines.length} leaderboard entries`)
      }
    })

    // Buttons
    if (this.fromMenu) {
      const backBtn = new PixelButton(this, width / 2, height * 0.82, 'BACK', () => {
        this.scene.start('Menu')
      }, { style: 'filled', scale: 3, bg: Theme.accent, width: 140, height: 40 })
      LayoutEditor.register(this, 'backBtn', backBtn, width / 2, height * 0.82)
    } else {
      const playAgainBtn = new PixelButton(this, width / 2 - 110, height * 0.82, 'PLAY AGAIN', () => {
        this.scene.start('Shop', {
          stage: 1, gold: 10, wins: 0, losses: 0, team: [], runId: crypto.randomUUID(),
        })
      }, { style: 'filled', scale: 3, bg: Theme.accent, width: 180, height: 44 })
      LayoutEditor.register(this, 'playAgainBtn', playAgainBtn, width / 2 - 110, height * 0.82)

      const menuBtn = new PixelButton(this, width / 2 + 110, height * 0.82, 'MAIN MENU', () => {
        this.scene.start('Menu')
      }, { style: 'text', scale: 2 })
      LayoutEditor.register(this, 'menuBtn', menuBtn, width / 2 + 110, height * 0.82)
    }

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[HallOfFame] Shutdown')
      LayoutEditor.unregisterScene('HallOfFame')
    })

    console.log(`[HallOfFame] Scene created (fromMenu: ${this.fromMenu})`)
  }
}
