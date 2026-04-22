import { Scene } from 'phaser'
import { Theme, PixelLabel } from '../ui/index.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import {
  getMerchants,
  pickRandomMerchants,
  getMerchantIdleAnimKey,
  getMerchantFavorLabel,
  getMerchantFavorTooltip,
} from '../config/merchants.js'
import { SelectionMenuWidget } from '../widgets/SelectionMenuWidget.js'
import { SceneCrt } from '../rendering/SceneCrt.js'
import { SceneDust } from '../rendering/SceneDust.js'

/**
 * MerchantSelectScene — second consumer of SelectionMenuWidget.
 *
 * Fires exactly once per run, the first time the player reaches 3 wins.
 * Player picks one of 3 randomly-chosen animated merchants; the choice then
 * persists in run state through every subsequent Shop phase. No back button,
 * no left/right panels, no preview — the widget's hidden-layer options gate
 * navigation so input can't land on empty views.
 *
 * Each merchant has a `favors` class or faction rendered as a persistent
 * "FAVORS X" label on the card plus a bottom-of-screen tooltip on hover/focus.
 * The favor is plumbed into CombatCore (via BattleSceneAdapter) and grants
 * the favored set a phantom +1 member at battle start — threshold synergies
 * trigger with one fewer actual unit and scaling synergies earn an extra tier.
 * See `src/config/merchants.js` (MERCHANT_FAVORS) and class/faction hooks.
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
    this._shopLocks = Array.isArray(data.shopLocks) ? data.shopLocks.slice() : null
    this._shopOffer = Array.isArray(data.shopOffer) ? data.shopOffer : null
    this._widget    = null
    console.log(`[Merchant] Init — wins: ${this._wins}, losses: ${this._losses}, team: ${this._team.length}, commander: ${this._commander?.name ?? 'none'}`)
    console.log(`[Merchant] Carrying shop state — locks: ${this._shopLocks ? this._shopLocks.filter(Boolean).length : 0}, offer: ${this._shopOffer ? 'preserved' : 'none'}`)
  }

  create() {
    this.cameras.main.setBackgroundColor(Theme.screenBg)

    // CRT post-process (softGameplay — interactive scene)
    SceneCrt.attach(this, 'softGameplay')
    // Ambient dust — gold glints floating upward (bazaar/incense feel)
    SceneDust.attach(this, 'merchantSelect')

    const choices = this._fixedMerchants ?? pickRandomMerchants(3)
    console.log(`[Merchant] Featured: ${choices.map(m => m.name).join(', ')}`)

    // Persistent tooltip label near the bottom of the screen. Empty until a
    // merchant card is hovered/focused — we reuse this single label instead
    // of allocating one per card so layout stays predictable.
    const { width, height } = this.cameras.main
    this._tooltipLabel = new PixelLabel(this, width / 2, height - 48, '', {
      scale: 1, tint: Theme.fantasyGold, align: 'center',
    })
    this._tooltipLabel.setDepth(22)
    this._tooltipLabel.setAlpha(0)
    LayoutEditor.register(this, 'merchantFavorTooltip', this._tooltipLabel, width / 2, height - 48)

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
        // Persistent "FAVORS X" line rendered below the nameplate by the
        // featured layer builder (abilityForItem hook).
        abilityForItem:    (item) => getMerchantFavorLabel(item),
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
          this._showFavorTooltip(item)
        },
        onFeaturedHoverEnter: (_index, item) => {
          this._showFavorTooltip(item)
        },
        onFeaturedHoverLeave: () => {
          this._hideFavorTooltip()
        },
        onConfirm: (item) => {
          console.log(`[Merchant] Confirmed: ${item.name} (${item.id}) favors=${item.favors?.name ?? 'none'}`)
          this.scene.start('Shop', {
            stage:     this._stage,
            wins:      this._wins,
            losses:    this._losses,
            team:      this._team,
            runId:     this._runId,
            commander: this._commander,
            merchant:  item,
            shopLocks: this._shopLocks ?? undefined,
            shopOffer: this._shopOffer ?? undefined,
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

  _showFavorTooltip(merchant) {
    const text = getMerchantFavorTooltip(merchant)
    if (!this._tooltipLabel) return
    if (!text) { this._hideFavorTooltip(); return }
    this._tooltipLabel.setText(text)
    this._tooltipLabel.setAlpha(1)
    console.log(`[Merchant] Tooltip: ${text}`)
  }

  _hideFavorTooltip() {
    if (!this._tooltipLabel) return
    this._tooltipLabel.setAlpha(0)
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
