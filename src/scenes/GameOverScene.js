import { Scene } from 'phaser'
import { Theme, PixelLabel, PixelButton, FloatingBanner } from '../ui/index.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js'
import { SceneDust } from '../rendering/SceneDust.js'

export class GameOverScene extends Scene {
  constructor() {
    super('GameOver')
  }

  init(data) {
    this.wins = data.wins || 0
    this.losses = data.losses || 3
    this.commander = data.commander ?? null
  }

  create() {
    const { width, height } = this.cameras.main

    // CRT post-process (strongUi preset — narrative/end screens)
    SceneCrt.attach(this, 'strongUi')
    // Ambient dust — cold grey ash falling (mournful)
    SceneDust.attach(this, 'gameOver')

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
      startSceneWithCrtPolicy(this, 'ModeSelect', { runId: crypto.randomUUID() })
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 200, height: 44 })
    LayoutEditor.register(this, 'playAgainBtn', playAgainBtn, width / 2, height * 0.58)

    const menuBtn = new PixelButton(this, width / 2, height * 0.70, 'MAIN MENU', () => {
      startSceneWithCrtPolicy(this, 'Menu')
    }, { style: 'text', scale: 2 })
    LayoutEditor.register(this, 'menuBtn', menuBtn, width / 2, height * 0.70)

    this.events.once('shutdown', () => {
      console.log('[GameOver] Shutdown')
      LayoutEditor.unregisterScene('GameOver')
    })

    console.log(`[GameOver] Scene created - ${this.wins}W ${this.losses}L`)
    finalizeCaptureScene('GameOver')
  }
}
