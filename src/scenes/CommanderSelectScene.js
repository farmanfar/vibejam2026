import { Scene } from 'phaser';
import { Theme } from '../ui/index.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { getCommanders, pickRandomCommanders } from '../config/commanders.js';
import { SelectionMenuWidget } from '../widgets/SelectionMenuWidget.js';
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js';

// Translate legacy capture --view names to current widget view IDs
const LEGACY_VIEW_MAP = {
  leftWall:     'left',
  rightWall:    'right',
  tvClose:      'previewClose',
  center:       'center',
  featuredClose: 'featuredClose',
}

export class CommanderSelectScene extends Scene {
  constructor() {
    super('CommanderSelect')
  }

  init(data) {
    this._runId            = data.runId
    this._fixedCommanders  = data.commanders ?? null
    this._captureView      = data.captureView ?? null
    this._widget           = null
    console.log(`[Commander] Init - runId: ${this._runId}, fixed: ${!!this._fixedCommanders}`)
  }

  create() {
    this.cameras.main.setBackgroundColor(Theme.screenBg)

    // CRT post-process (softGameplay — interactive scene, lighter curvature)
    SceneCrt.attach(this, 'softGameplay')

    const choices   = this._fixedCommanders ?? pickRandomCommanders(3)
    const remaining = getCommanders().filter(c => !choices.some(ch => ch.id === c.id))
    const initialView = LEGACY_VIEW_MAP[this._captureView] ?? this._captureView ?? 'center'

    console.log(`[Commander] Featured: ${choices.map(c => c.name).join(', ')}`)
    console.log(`[Commander] Trophy walls: left=${Math.min(remaining.length, 11)}, right=${Math.min(Math.max(remaining.length - 11, 0), 11)}`)

    this._widget = new SelectionMenuWidget(this, {
      items: {
        featured:   choices,
        leftPanel:  remaining.slice(0, 11),
        rightPanel: remaining.slice(11, 22),
        preview:    choices.slice(0, 2),
      },
      text: {
        headerTitle: 'SELECT A COMMANDER',
        actionLabels: {
          back:           'BACK',
          confirm:        'EMBARK',
          primary:        'MOVE IN',
          secondaryLeft:  'PREV',
          secondaryRight: 'NEXT',
        },
        regionTitles: {
          leftPanel:  'WEST WING',
          rightPanel: 'EAST WING',
          preview:    'BATTLE ARCHIVE',
        },
      },
      visuals: {
        textureKeyForItem: (item) => `commander-sprite-${item.spriteIndex}`,
        labelForItem:      (item) => item.name.toUpperCase(),
        subtitleForItem:   (item) => `#${item.spriteIndex}`,
      },
      actions: {
        onSelectionChange: (_item) => {
          // Selection state is reflected by panel gold border + EMBARK button enablement
        },
        onConfirm: (item) => {
          console.log(`[Commander] Embarking with ${item.name} (${item.id})`)
          // Power-off plays on run start (CommanderSelect → Shop)
          startSceneWithCrtPolicy(this, 'Shop', {
            stage: 1, gold: 10, wins: 0, losses: 0, team: [],
            runId: this._runId,
            commander: item,
          })
        },
        onBack: () => {
          console.log('[Commander] Returning to menu')
          this.scene.start('Menu')
        },
      },
      options: {
        initialView,
        initialFocus:   'featured',
        enableKeyboard: true,
        showLeftPanel:  true,
        showRightPanel: true,
        showPreview:    true,
      },
    })

    // Widget self-registers its own shutdown cleanup (LayoutEditor + keyboard)
    finalizeCaptureScene('CommanderSelect')
  }
}
