import { Scene } from 'phaser'
import { Theme, PixelButton, PixelLabel, PixelPanel } from '../ui/index.js'
import { PortalTooltip } from '../widgets/PortalTooltip.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js'
import { SceneDust } from '../rendering/SceneDust.js'

export class ModeSelectScene extends Scene {
  constructor() {
    super('ModeSelect')
  }

  _clearPortalState() {
    if (this.registry.get('portalArrival')) {
      this.registry.set('portalArrival', false)
      this.registry.set('portalWelcomeShown', false) // reset for future portal visits
      console.log('[Portal] portalArrival flag cleared')
    }
    if (this._portalHint?.visible) this._portalHint.hide()
  }

  init(data = {}) {
    this._runId = data.runId ?? crypto.randomUUID()
    console.log(`[ModeSelect] Init - runId: ${this._runId}`)
  }

  create() {
    const { width, height } = this.cameras.main

    this.cameras.main.setBackgroundColor(Theme.screenBg)
    SceneCrt.attach(this, 'strongUi')
    SceneDust.attach(this, 'menu')

    const title = new PixelLabel(this, width / 2, 78, 'CHOOSE RUN MODE', {
      scale: 5, color: 'accent', align: 'center',
    })
    LayoutEditor.register(this, 'title', title, width / 2, 78)

    const panel = new PixelPanel(this, width / 2 - 235, 145, 470, 220, {
      bg: Theme.panelBg,
      border: Theme.panelBorder,
    })
    panel.setDepth(1)
    LayoutEditor.register(this, 'panel', panel, width / 2 - 235, 145)

    const tutorialBtn = new PixelButton(this, width / 2, 205, 'TUTORIAL MODE', () => {
      console.log(`[ModeSelect] Tutorial mode selected - runId: ${this._runId}`)
      this._clearPortalState()
      startSceneWithCrtPolicy(this, 'CommanderSelect', {
        runId: this._runId,
        tutorial: true,
      })
    }, { style: 'filled', scale: 3, bg: Theme.accentDim, width: 260, height: 44, cornerRadius: 4 })
    tutorialBtn.setDepth(2)
    LayoutEditor.register(this, 'tutorialBtn', tutorialBtn, width / 2, 205)

    const tutorialCopy = new PixelLabel(this, width / 2, 236, 'GUIDED FIRST STAGE. RECOMMENDED FOR NEW PLAYERS.', {
      scale: 1, color: 'muted', align: 'center',
    })
    tutorialCopy.setDepth(2)
    LayoutEditor.register(this, 'tutorialCopy', tutorialCopy, width / 2, 236)

    // --- Portal arrival tutorial hint ---
    const isPortalArrival = this.registry.get('portalArrival') === true
    const portalHintText = 'TRAVELERS SHOULD PLAY THE TUTORIAL'
    this._portalHint = new PortalTooltip(
      this, PortalTooltip.centeredX(this, width / 2, portalHintText), 152,
      portalHintText,
      'portalTutorialHint',
    )
    if (isPortalArrival) {
      console.log('[Portal] Portal arrival detected in ModeSelectScene — showing tutorial hint')
      this._portalHint.show()
    }

    const normalBtn = new PixelButton(this, width / 2, 290, 'NORMAL MODE', () => {
      console.log(`[ModeSelect] Normal mode selected - runId: ${this._runId}`)
      this._clearPortalState()
      startSceneWithCrtPolicy(this, 'CommanderSelect', {
        runId: this._runId,
        tutorial: false,
      })
    }, { style: 'filled', scale: 3, bg: Theme.accentDim, width: 260, height: 44, cornerRadius: 4 })
    normalBtn.setDepth(2)
    LayoutEditor.register(this, 'normalBtn', normalBtn, width / 2, 290)

    const normalCopy = new PixelLabel(this, width / 2, 321, 'SKIP THE TUTORIAL. STANDARD RUN.', {
      scale: 1, color: 'muted', align: 'center',
    })
    normalCopy.setDepth(2)
    LayoutEditor.register(this, 'normalCopy', normalCopy, width / 2, 321)

    const backBtn = new PixelButton(this, 68, height - 50, 'BACK', () => {
      console.log('[ModeSelect] Returning to menu')
      this._clearPortalState()
      this.scene.start('Menu')
    }, { style: 'filled', scale: 2, bg: Theme.error, pill: true, width: 92, height: 32 })
    LayoutEditor.register(this, 'backBtn', backBtn, 68, height - 50)

    this.events.once('shutdown', () => {
      console.log('[ModeSelect] Shutdown')
      LayoutEditor.unregisterScene('ModeSelect')
      if (this._portalHint) { this._portalHint.destroy(); this._portalHint = null }
    })

    console.log('[ModeSelect] Scene created successfully')
    finalizeCaptureScene('ModeSelect')
  }
}
