import { Scene } from 'phaser'
import { Theme, FONT_KEY, PixelLabel, PixelButton, FloatingBanner } from '../ui/index.js'
import { GhostManager } from '../systems/GhostManager.js'

export class HallOfFameScene extends Scene {
  constructor() {
    super('HallOfFame')
  }

  init(data) {
    this.wins = data.wins
    this.losses = data.losses
    this.team = data.team
    this.runId = data.runId
  }

  create() {
    const { width, height } = this.cameras.main

    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.08)
    }

    new PixelLabel(this, width / 2, height * 0.18, 'CHAMPION!', {
      scale: 8, color: 'accent', align: 'center',
    })

    new PixelLabel(this, width / 2, height * 0.34, `${this.wins} - ${this.losses}`, {
      scale: 3, color: 'muted', align: 'center',
    })

    const gfx = this.add.graphics()
    gfx.lineStyle(1, Theme.panelBorder, 0.5)
    gfx.lineBetween(width * 0.2, height * 0.42, width * 0.8, height * 0.42)

    GhostManager.submitChampion(this.runId, this.team, this.wins, this.losses)

    this.leaderText = this.add.bitmapText(width / 2, height * 0.50, FONT_KEY, '', 7 * 2)
      .setOrigin(0.5, 0).setTint(Theme.mutedText)

    GhostManager.fetchLeaderboard().then(entries => {
      if (!entries || entries.length === 0) return
      const lines = entries.slice(0, 8).map((e, i) =>
        `${i + 1}. ${e.wins}W - ${e.losses}L`
      )
      this.leaderText.setText(lines.join('\n'))
    })

    new PixelButton(this, width / 2 - 110, height * 0.82, 'PLAY AGAIN', () => {
      this.scene.start('Shop', {
        stage: 1, gold: 10, wins: 0, losses: 0, team: [], runId: crypto.randomUUID(),
      })
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 180, height: 44 })

    new PixelButton(this, width / 2 + 110, height * 0.82, 'MAIN MENU', () => {
      this.scene.start('Menu')
    }, { style: 'text', scale: 2 })
  }
}
