import { Scene } from 'phaser'
import { Theme } from '../ui/index.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import {
  getMerchants,
  pickRandomMerchants,
  getMerchantIdleAnimKey,
} from '../config/merchants.js'
import { SelectionMenuWidget } from '../widgets/SelectionMenuWidget.js'
import { SceneCrt } from '../rendering/SceneCrt.js'

/**
 * MerchantSelectScene — second consumer of SelectionMenuWidget.
 *
 * Fires exactly once per run, the first time the player reaches 3 wins.
 * Player picks one of 3 randomly-chosen animated merchants; the choice then
 * persists in run state through every subsequent Shop phase. No back button,
 * no left/right panels, no preview — the widget's hidden-layer options gate
 * navigation so input can't land on empty views.
 *
 * Gameplay consequences (shop pool weighting, etc.) are not wired yet — this
 * pass is purely visual.
 */
export class MerchantSelectScene extends Scene {
  constructor() {
    super('MerchantSelect')
  }

  init(data) {
    this._runId     = data.runId     ?? null
    this._stage     = data.stage     ?? 1
    this._wins      = data.wins      ?? 0
    this._losses    = data.losses    ?? 0
    this._team      = Array.isArray(data.team) ? data.team : []
    this._commander = data.commander ?? null
    this._fixedMerchants = data.merchants ?? null
    this._widget    = null
    console.log(`[Merchant] Init — wins: ${this._wins}, losses: ${this._losses}, team: ${this._team.length}, commander: ${this._commander?.name ?? 'none'}`)
  }

  create() {
    this.cameras.main.setBackgroundColor(Theme.screenBg)

    // CRT post-process (softGameplay — interactive scene)
    SceneCrt.attach(this, 'softGameplay')

    const choices = this._fixedMerchants ?? pickRandomMerchants(3)
    console.log(`[Merchant] Featured: ${choices.map(m => m.name).join(', ')}`)

    this._widget = new SelectionMenuWidget(this, {
      items: {
        featured: choices,
      },
      text: {
        headerTitle: 'SELECT A MERCHANT',
        actionLabels: {
          back:           'BACK',
          confirm:        'VISIT SHOP',
          primary:        'MOVE IN',
          secondaryLeft:  'PREV',
          secondaryRight: 'NEXT',
        },
      },
      visuals: {
        animated:          true,
        textureKeyForItem: (item) => item.spriteKey,
        labelForItem:      (item) => item.name.toUpperCase(),
        subtitleForItem:   (item) => item.id,
        spriteScale:       2,
        // Featured sprite hook: start the global `<spriteKey>-idle` anim that
        // BootScene registered on load. See `_wireMerchantSprite` below.
        onFeaturedSpriteCreated: (sprite, item) => {
          this._wireMerchantSprite(sprite, item)
        },
      },
      actions: {
        onSelectionChange: (item) => {
          console.log(`[Merchant] Focus: ${item.name}`)
        },
        onConfirm: (item) => {
          console.log(`[Merchant] Confirmed: ${item.name} (${item.id})`)
          this.scene.start('Shop', {
            stage:     this._stage,
            wins:      this._wins,
            losses:    this._losses,
            team:      this._team,
            runId:     this._runId,
            commander: this._commander,
            merchant:  item,
          })
        },
        // onBack intentionally omitted — widget renders no back button
        // (showBack: false) so this callback can never be invoked.
      },
      options: {
        initialView:    'center',
        initialFocus:   'featured',
        enableKeyboard: true,
        showLeftPanel:  false,
        showRightPanel: false,
        showPreview:    false,
        showBack:       false,
      },
    })

    finalizeCaptureScene('MerchantSelect')
  }

  /**
   * Play the merchant's looping idle animation. BootScene registers exactly
   * one global `<spriteKey>-idle` anim per merchant on load, so this is a
   * direct `sprite.play(key)` with a texture-existence guard and error log.
   */
  _wireMerchantSprite(sprite, merchant) {
    if (!sprite || !this.textures.exists(merchant.spriteKey)) {
      console.warn(`[Merchant] ${merchant.id}: missing texture ${merchant.spriteKey}, cannot animate`)
      return
    }
    const animKey = getMerchantIdleAnimKey(merchant)
    try {
      sprite.play(animKey)
      console.log(`[Merchant] ${merchant.id}: playing '${animKey}'`)
    } catch (e) {
      console.error(`[Merchant] sprite.play('${animKey}') failed for ${merchant.id}:`, e)
    }
  }
}
