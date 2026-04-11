import { Scene } from 'phaser'
import { Theme, PixelLabel, PixelButton, FloatingBanner } from '../ui/index.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'

export class GameOverScene extends Scene {
  constructor() {
    super('GameOver')
  }

  init(data) {
    this.wins = data.wins || 0
    this.losses = data.losses || 3
  }

  create() {
    const { width, height } = this.cameras.main

    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.08)
    }

    const title = new PixelLabel(this, width / 2, height * 0.25, 'GAME OVER', {
      scale: 8, color: 'error', align: 'center',
    })
    LayoutEditor.register(this, 'title', title, width / 2, height * 0.25)

    const record = new PixelLabel(this, width / 2, height * 0.40, `${this.wins} WINS - 3 LOSSES`, {
      scale: 3, color: 'muted', align: 'center',
    })
    LayoutEditor.register(this, 'record', record, width / 2, height * 0.40)

    const gfx = this.add.graphics()
    gfx.lineStyle(1, Theme.panelBorder, 0.5)
    gfx.lineBetween(width * 0.3, height * 0.48, width * 0.7, height * 0.48)

    const playAgainBtn = new PixelButton(this, width / 2, height * 0.58, 'PLAY AGAIN', () => {
      this.scene.start('Shop', {
        stage: 1, gold: 10, wins: 0, losses: 0, team: [], runId: crypto.randomUUID(),
      })
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 200, height: 44 })
    LayoutEditor.register(this, 'playAgainBtn', playAgainBtn, width / 2, height * 0.58)

    const menuBtn = new PixelButton(this, width / 2, height * 0.70, 'MAIN MENU', () => {
      this.scene.start('Menu')
    }, { style: 'text', scale: 2 })
    LayoutEditor.register(this, 'menuBtn', menuBtn, width / 2, height * 0.70)

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[GameOver] Shutdown')
      LayoutEditor.unregisterScene('GameOver')
    })

    console.log(`[GameOver] Scene created — ${this.wins}W ${this.losses}L`)
  }
}
