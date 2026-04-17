import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelButton, PixelLabel, PixelPanel, WarriorCard,
} from '../ui/index.js'
import { ShopManager } from '../systems/ShopManager.js'
import { GhostManager } from '../systems/GhostManager.js'
import { BattleEngine } from '../systems/BattleEngine.js'
import { getEnabledAlphaWarriors as getEnabledWarriors } from '../config/alpha-units.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { logShopRound, logShopBuy, logShopSell, logShopReroll, logShopCombine } from '../systems/PlaytestLogger.js'
import { SceneCrt } from '../rendering/SceneCrt.js'
import { getMerchantIdleAnimKey } from '../config/merchants.js'
import { pulseLevelUp, pulseStarLevelUp } from '../rendering/OutlineController.js'
import { SynergyChipStrip } from '../widgets/SynergyChipStrip.js'
import { SynergyTooltip } from '../widgets/SynergyTooltip.js'

// Team card row
const TEAM_Y        = 122
const TEAM_CARD_XS  = [208, 344, 480, 616, 752]  // visual x per slot [4,3,2,1,0]
// slot → visual index: visualIdx = 4 - slotIndex
// slot 0 (front-of-line) = rightmost visual (x=752)

// Shop card row
const SHOP_Y        = 380   // card rest Y; shelf top at 380; hover rises to 300
const SHOP_CARD_XS  = [248, 384, 520, 656]

// Columns
const LEFT_COL_X    = 90
const MERCHANT_X    = 870
const MERCHANT_Y    = 160   // merchantStrip container anchor

// Layout lines
// Team cards (TEAM_Y=122, height 160) bottom at y=202. WarriorCard star pips
// sit at card-local y=92 → world y=206-222. Chip strip (38px tall) must clear
// the star pips, and the divider must sit below the chip strip.
const SYNERGY_Y     = 248
const DIVIDER_Y     = 276

// Game rules
const MAX_STARS       = 3
const MAX_BENCH_SLOTS = 5

export class ShopScene extends Scene {
  constructor() {
    super('Shop')
  }

  init(data) {
    this._freshTurn = data.gold === undefined
    this.stage = data.stage || 1
    this.gold = data.gold ?? 10
    this.wins = data.wins || 0
    this.losses = data.losses || 0
    this.runId = data.runId
    this.commander = data.commander ?? null
    this.merchant = data.merchant ?? null

    // Sparse 5-slot model for shop UI. BattleScene and external systems only see this.team (dense).
    this.teamSlots = new Array(5).fill(null)
    const incomingTeam = Array.isArray(data.team) ? data.team.map(w => ({ ...w })) : []
    incomingTeam.forEach((w, i) => { if (i < 5) this.teamSlots[i] = w })
    this.team = this.teamSlots.filter(Boolean)  // dense mirror, kept in sync

    this.availableWarriors = getEnabledWarriors()
    this.shop = new ShopManager(this.availableWarriors, this.stage)
    this.shopOffer = Array.isArray(data.shopOffer)
      ? data.shopOffer.map(w => (w ? { ...w } : null))
      : this.shop.roll()

    this.goldLabel = null
    this.cards = null
    this._teamAnchors = null
    this._teamCards = null
    this._merchantStrip = null
    this.synergyChips = null
    this.synergyTooltip = null
  }

  _syncDenseTeamFromSlots() {
    this.team = this.teamSlots.filter(Boolean)
  }

  _countFilledSlots() {
    return this.teamSlots.filter(Boolean).length
  }

  _findMatchingSlot(warrior) {
    for (let i = 0; i < 5; i++) {
      const u = this.teamSlots[i]
      if (u && u.id === warrior.id && (u.stars ?? 1) === (warrior.stars ?? 1) && (u.stars ?? 1) < MAX_STARS)
        return i
    }
    return null
  }

  create() {
    const { width, height } = this.cameras.main

    const freshTurn = this._freshTurn
    console.log(`[Shop] Creating shop scene — stage ${this.stage}, credits ${this.gold}${freshTurn ? ' (fresh turn, reset to 10)' : ''}, team size ${this.team.length}`)
    console.log(`[Shop] Commander: ${this.commander?.name ?? 'none'}`)

    // CRT post-process (softGameplay — interactive scene)
    const crtController = SceneCrt.attach(this, 'softGameplay')
    this._installCrtPointerTransform(crtController)

    // ── Header ───────────────────────────────────────────────
    const headerPanel = new PixelPanel(this, 0, 0, width, 32, {
      bg: Theme.panelBg, border: Theme.panelBorder,
    })
    headerPanel.setDepth(20)
    LayoutEditor.register(this, 'headerPanel', headerPanel, 0, 0)

    const stageLabel = new PixelLabel(this, 12, 8, `STAGE ${this.stage}`, { scale: 2, color: 'accent' })
    stageLabel.setDepth(20)
    LayoutEditor.register(this, 'stageLabel', stageLabel, 12, 8)

    this.goldLabel = new PixelLabel(this, width / 2, 8, `CREDITS: ${this.gold}`, {
      scale: 2, tint: Theme.warning, align: 'center',
    })
    this.goldLabel.setDepth(20)
    LayoutEditor.register(this, 'goldLabel', this.goldLabel, width / 2, 8)

    const livesLabel = new PixelLabel(this, width - 12, 8, `LIVES: ${3 - this.losses}`, {
      scale: 2, color: 'error', align: 'right',
    })
    livesLabel.setDepth(20)
    LayoutEditor.register(this, 'livesLabel', livesLabel, width - 12, 8)

    // ── Team anchor containers ────────────────────────────────
    // 5 persistent containers created once; _drawTeamRow() repopulates children.
    // Anchors[visualIdx]: visualIdx 0 = leftmost (slot 4), visualIdx 4 = rightmost (slot 0).
    this._teamAnchors = TEAM_CARD_XS.map((x, visualIdx) => {
      const slotIndex = (MAX_BENCH_SLOTS - 1) - visualIdx  // slot 0=rightmost=visualIdx 4
      const anchor = this.add.container(x, TEAM_Y)
      anchor.setDepth(7)
      LayoutEditor.register(this, `teamCard_${slotIndex}`, anchor, x, TEAM_Y)
      return anchor
    })
    this._teamCards = new Array(5).fill(null)  // slotIndex → WarriorCard instance
    this._drawTeamRow()

    // ── Synergy chip strip ────────────────────────────────────
    this._drawSynergyChips()

    // ── Divider ───────────────────────────────────────────────
    // Registered with LayoutEditor per plan (explicit exception to "no decorative" rule)
    this.dividerGraphic = this.add.graphics()
    this.dividerGraphic.lineStyle(1, Theme.panelBorder, 0.8)
    this.dividerGraphic.lineBetween(0, DIVIDER_Y, width, DIVIDER_Y)
    this.dividerGraphic.setDepth(6)
    LayoutEditor.register(this, 'divider', this.dividerGraphic, 0, 0)

    // ── Shop cards ────────────────────────────────────────────
    this.cards = []
    this._drawShopCards()

    // ── Merchant strip ────────────────────────────────────────
    const merchantStrip = this.add.container(MERCHANT_X, MERCHANT_Y)
    merchantStrip.setDepth(8)
    this._merchantStrip = merchantStrip
    LayoutEditor.register(this, 'merchantStrip', merchantStrip, MERCHANT_X, MERCHANT_Y)

    const MERCHANT_TARGET_H = 80
    let merchantQuoteText = '"Choose your warriors wisely..."'

    if (this.merchant && this.textures.exists(this.merchant.spriteKey)) {
      const merchantSprite = this.add.sprite(0, 0, this.merchant.spriteKey)
      const nativeH = merchantSprite.height || 32
      const scale = MERCHANT_TARGET_H / nativeH
      merchantSprite.setScale(scale)
      console.log(`[Shop] Merchant ${this.merchant.id} native=${merchantSprite.width}x${nativeH} → scale=${scale.toFixed(2)} target=${MERCHANT_TARGET_H}px`)

      const animKey = getMerchantIdleAnimKey(this.merchant)
      try {
        merchantSprite.play(animKey)
        console.log(`[Shop] Merchant: ${this.merchant.name} playing '${animKey}'`)
      } catch (e) {
        console.error(`[Shop] sprite.play('${animKey}') failed for ${this.merchant.id}:`, e)
      }
      merchantQuoteText = this.merchant.blurb ?? merchantQuoteText

      const merchantShadow = this.add.graphics()
      merchantShadow.fillStyle(0x000000, 0.35)
      merchantShadow.fillEllipse(0, 40, 50, 10)
      merchantStrip.add(merchantShadow)
      merchantStrip.add(merchantSprite)
    } else {
      // No merchant NPC yet (first merchant assigned at win 3 per BattleScene).
      // The vault sell zone below handles the sell affordance now.
      merchantQuoteText = ''
      console.log(`[Shop] Merchant slot: no NPC yet (pre win-3); vault handles sell affordance`)
    }

    this.merchantQuote = new PixelLabel(this, width / 2, DIVIDER_Y + 14, merchantQuoteText, {
      scale: 1, color: 'muted', align: 'center',
    })
    this.merchantQuote.setDepth(8)
    LayoutEditor.register(this, 'merchantQuote', this.merchantQuote, width / 2, DIVIDER_Y + 14)

    // ── Sell vault (animated 3D hole with double doors, always visible) ─────
    // Y matches REROLL button center (rerollStrip y=360 + local y=-40 = 320)
    // so the two primary actions sit on the same horizontal axis.
    this._buildSellVault(870, 320)

    // ── Reroll strip (bottom-left) ───────────────────────────
    const rerollStrip = this.add.container(LEFT_COL_X, 360)
    rerollStrip.setDepth(8)
    LayoutEditor.register(this, 'rerollStrip', rerollStrip, LEFT_COL_X, 360)
    console.log(`[Layout] Shop.rerollStrip at (${LEFT_COL_X}, 360)`)

    this.rerollBtn = new PixelButton(this, 0, -40, 'REROLL', () => {
      // Slot-machine spin, then actually roll. Scene restart wipes the button,
      // so the spin reads as the lead-in to the new shop row materialising.
      console.log('[Shop] reroll clicked — spinning before roll')
      this.rerollBtn.spin(() => this._reroll())
    }, { style: 'filled', scale: 3, bg: Theme.accentDim, pill: true, width: 160, height: 40 })
    rerollStrip.add(this.rerollBtn)

    const rerollCostLabel = new PixelLabel(this, 0, -14, '1c', {
      scale: 1, color: 'muted', align: 'center',
    })
    rerollStrip.add(rerollCostLabel)

    // ── Fight anchor (bottom-center, separated from reroll for decisiveness) ─
    const FIGHT_ANCHOR_X = 480
    const FIGHT_ANCHOR_Y = 510
    const fightAnchor = this.add.container(FIGHT_ANCHOR_X, FIGHT_ANCHOR_Y)
    fightAnchor.setDepth(8)
    LayoutEditor.register(this, 'fightAnchor', fightAnchor, FIGHT_ANCHOR_X, FIGHT_ANCHOR_Y)
    console.log(`[Layout] Shop.fightAnchor at (${FIGHT_ANCHOR_X}, ${FIGHT_ANCHOR_Y})`)

    this.fightBtn = new PixelButton(this, 0, 0, 'FIGHT!', () => {
      this._startBattle()
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 160, height: 40 })
    fightAnchor.add(this.fightBtn)

    // ── Drag layer (floats above everything during card drag) ─────────────────
    this._dragLayer = this.add.container(0, 0)
    this._dragLayer.setDepth(30)

    this.input.dragDistanceThreshold = 6

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[Shop] Shutdown — cleaning up')
      this._stopFightUrgency()
      LayoutEditor.unregisterScene('Shop')
      this._uninstallCrtPointerTransform()
    })

    logShopRound({ scene: this, rolled: this.shopOffer })

    this._updateFightUrgency()

    console.log('[Shop] Scene created successfully')
    finalizeCaptureScene('Shop')
  }

  // ── Fight button urgency (out-of-credits "soft touch" attention) ─────────
  // When credits hit 0, FIGHT! subtly swells, micro-shakes, and a low-alpha
  // shimmer sweeps left → right on loop. Stops the moment credits return.

  _updateFightUrgency() {
    if (!this.fightBtn) return
    if (this.gold <= 0) this._startFightUrgency()
    else this._stopFightUrgency()
  }

  _startFightUrgency() {
    if (this._fightUrgencyActive) return
    const btn = this.fightBtn
    if (!btn || !btn.btnW) return
    this._fightUrgencyActive = true
    console.log('[Shop] Fight urgency start — out of credits')

    this._fightBaseX = btn.x
    this._fightBaseY = btn.y

    this._fightSwellTween = this.tweens.add({
      targets: btn,
      scale: 1.03,
      duration: 880,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    })

    this._fightShakeTween = this.tweens.add({
      targets: btn,
      x: { from: this._fightBaseX - 0.6, to: this._fightBaseX + 0.6 },
      y: { from: this._fightBaseY - 0.3, to: this._fightBaseY + 0.3 },
      duration: 80,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    })

    const w = btn.btnW
    const h = btn.btnH
    const shimmer = this.add.rectangle(0, 0, 7, h * 0.85, 0xffffff, 0)
      .setAngle(20)
    btn.add(shimmer)
    this._fightShimmer = shimmer

    const travelFrom = -w / 2 - 10
    const travelTo   =  w / 2 + 10
    const sweep = () => {
      if (!this._fightUrgencyActive) return
      shimmer.x = travelFrom
      shimmer.alpha = 0
      this._fightShimmerTween = this.tweens.add({
        targets: shimmer,
        x: travelTo,
        duration: 1500,
        ease: 'Sine.InOut',
        onUpdate: () => {
          const t = (shimmer.x - travelFrom) / (travelTo - travelFrom)
          const edge = Math.min(t, 1 - t) * 3.5
          shimmer.alpha = Math.max(0, Math.min(0.22, edge * 0.22))
        },
        onComplete: () => {
          if (!this._fightUrgencyActive) return
          this._fightShimmerDelay = this.time.delayedCall(1100, sweep)
        },
      })
    }
    sweep()
  }

  _stopFightUrgency() {
    if (!this._fightUrgencyActive) return
    console.log('[Shop] Fight urgency stop')
    this._fightUrgencyActive = false

    if (this._fightSwellTween)   { this._fightSwellTween.stop();   this._fightSwellTween = null }
    if (this._fightShakeTween)   { this._fightShakeTween.stop();   this._fightShakeTween = null }
    if (this._fightShimmerTween) { this._fightShimmerTween.stop(); this._fightShimmerTween = null }
    if (this._fightShimmerDelay) { this._fightShimmerDelay.remove(false); this._fightShimmerDelay = null }

    if (this.fightBtn) {
      this.fightBtn.setScale(1)
      if (this._fightBaseX != null) this.fightBtn.x = this._fightBaseX
      if (this._fightBaseY != null) this.fightBtn.y = this._fightBaseY
    }
    if (this._fightShimmer) { this._fightShimmer.destroy(); this._fightShimmer = null }
  }

  // ── Team row ──────────────────────────────────────────────────────────────

  _drawTeamRow() {
    this._teamAnchors.forEach(a => a.removeAll(true))
    this._teamCards = new Array(5).fill(null)

    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      const unit = this.teamSlots[slotIndex]
      const visualIdx = (MAX_BENCH_SLOTS - 1) - slotIndex  // 0=slot4, 4=slot0
      const anchor = this._teamAnchors[visualIdx]

      if (unit) {
        const card = new WarriorCard(this, 0, 0, unit, { draggable: true, teamCard: true })
        card.captureRestPosition()
        anchor.add(card)
        this._teamCards[slotIndex] = card
        this._bindTeamCardDrag(card, slotIndex)
      } else {
        const placeholder = this.add.rectangle(0, 0, WarriorCard.WIDTH, WarriorCard.HEIGHT)
          .setStrokeStyle(2, Theme.panelBorder, 0.55)
        anchor.add(placeholder)
      }
    }

    if (this.synergyChips?.scene === this) this._updateSynergyChips()
  }

  // ── Synergy chip strip ────────────────────────────────────────────────────

  _drawSynergyChips() {
    const cx = this.cameras.main.width / 2
    this.synergyTooltip = new SynergyTooltip(this)
    this.synergyChips = new SynergyChipStrip(this, cx, SYNERGY_Y, {
      onChipHover: (tag, count, worldX, worldY) => {
        this.synergyTooltip.show(tag, count, worldX, worldY)
      },
      onChipOut: () => {
        this.synergyTooltip.hide()
      },
    })
    this.synergyChips.setDepth(8)
    LayoutEditor.register(this, 'synergyChips', this.synergyChips, cx, SYNERGY_Y)
    this._updateSynergyChips()
  }

  _updateSynergyChips() {
    if (!this.synergyChips || this.synergyChips.scene !== this) return

    const counts = {}
    this.teamSlots.filter(Boolean).forEach(u => {
      if (u.faction) counts[u.faction] = (counts[u.faction] || 0) + 1
      if (u.class)   counts[u.class]   = (counts[u.class]   || 0) + 1
    })
    this.synergyChips.setCounts(counts)
    // Hide any open tooltip when the team changes — the tag/count it was
    // showing may no longer be accurate.
    if (this.synergyTooltip?.scene === this) this.synergyTooltip.hide()
  }

  // ── Shop cards ────────────────────────────────────────────────────────────

  _drawShopCards() {
    this.cards = []
    this.shopOffer.forEach((warrior, i) => {
      if (!warrior) return
      const x = SHOP_CARD_XS[i]
      const y = SHOP_Y

      const card = new WarriorCard(this, x, y, warrior, { draggable: true })
      LayoutEditor.register(this, `card_${i}`, card, x, y)
      card.captureRestPosition()
      card.setDepth(1)
      this.cards[i] = card
      this._bindShopCardDrag(card, i)
    })
  }

  // ── Drag layer helpers ────────────────────────────────────────────────────

  _beginCardDrag(card, source, index, pointer) {
    card.cancelHoverTween()
    card._isHeld = true

    // Capture world position before reparenting (anchors are unrotated/unscaled)
    const worldX = card.parentContainer ? card.parentContainer.x + card.x : card.x
    const worldY = card.parentContainer ? card.parentContainer.y + card.y : card.y

    // Cursor offset so card doesn't snap its center to the pointer
    card._dragOffsetX = pointer.x - worldX
    card._dragOffsetY = pointer.y - worldY

    // Reparent — removes from scene displayList or anchor container automatically
    this._dragLayer.add(card)
    card.x = worldX
    card.y = worldY
    card.setDepth(30)

    console.log(`[Shop] drag-start visual source=${source} index=${index} world=(${Math.round(worldX)},${Math.round(worldY)}) offset=(${Math.round(card._dragOffsetX)},${Math.round(card._dragOffsetY)})`)
  }

  _moveDraggedCard(card, pointer) {
    card.x = pointer.x - card._dragOffsetX
    card.y = pointer.y - card._dragOffsetY
  }

  _endCardDrag(card) {
    card._isHeld = false
    card._dragOffsetX = undefined
    card._dragOffsetY = undefined
  }

  // Eject a rejected shop card from _dragLayer (depth=30) back to the scene
  // displayList so the snapBack tween animates UNDER the UI strips and shelf
  // instead of on top of them. World coords are preserved because _dragLayer
  // sits at (0,0).
  _returnShopCardHome(card) {
    this._dragLayer.remove(card, false)
    this.add.existing(card)
    card.setDepth(1)
    console.log(`[Shop] drag-return id=${card.warrior?.id} parent=scene depth=1`)
  }

  // ── Shop card drag ────────────────────────────────────────────────────────

  _bindShopCardDrag(card, shopIndex) {
    let _rejected = false

    card.hitZone.on('dragstart', (pointer) => {
      if (this._sellInProgress) { _rejected = true; return }
      const warrior = this.shopOffer[shopIndex]
      if (!warrior) { _rejected = true; return }
      const creditsOk = this.gold >= warrior.cost
      const teamFull  = this._countFilledSlots() === MAX_BENCH_SLOTS
      const hasMatch  = this._findMatchingSlot(warrior) !== null

      console.log(`[Shop] drag-start id=${warrior.id} source=shop index=${shopIndex} creditsOk=${creditsOk} hasMatch=${hasMatch} teamFull=${teamFull}`)

      if (!creditsOk || (teamFull && !hasMatch)) {
        _rejected = true
        card.shake()
        const reason = !creditsOk ? 'reject-no-credits' : 'reject-full-team'
        console.log(`[Shop] drop resolution=${reason} source=shop from=${shopIndex} to=none`)
        return
      }
      _rejected = false
      this._beginCardDrag(card, 'shop', shopIndex, pointer)
    })

    card.hitZone.on('drag', (pointer, dragX, dragY) => {
      if (_rejected) return
      this._moveDraggedCard(card, pointer)
    })

    card.hitZone.on('dragend', (pointer) => {
      if (_rejected) { _rejected = false; return }
      this._resolveShopDrop(shopIndex, card, pointer)
    })
  }

  _resolveShopDrop(shopIndex, card, pointer) {
    this._endCardDrag(card)
    const warrior = this.shopOffer[shopIndex]
    const target = this._getLogicalSlotFromPointer(pointer)

    if (target === null) {
      this._returnShopCardHome(card)
      card.snapBack(Theme.error)
      console.log(`[Shop] drop resolution=reject-dead-zone source=shop from=${shopIndex} to=none`)
      return
    }

    const occupant = this.teamSlots[target]

    if (occupant && occupant.id === warrior.id &&
        (occupant.stars ?? 1) === (warrior.stars ?? 1) &&
        (occupant.stars ?? 1) < MAX_STARS) {
      // buy-combine
      this.gold -= warrior.cost
      this.goldLabel.setText(`CREDITS: ${this.gold}`)
      this._updateFightUrgency()
      this.shopOffer[shopIndex] = null
      occupant.stars = (occupant.stars ?? 1) + 1
      occupant.hp  += 1
      occupant.atk += 1
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      // Destroy the dragged shop card — it lives in _dragLayer now and would
      // otherwise float over the newly-drawn team card ("double vision").
      // _drawShopCards() rebuilds the shop row on the next reroll.
      this._dragLayer.remove(card, true)
      const hostCard = this._teamCards[target]
      if (hostCard?.sprite) pulseLevelUp(this, hostCard.sprite)
      if (hostCard) pulseStarLevelUp(this, hostCard)
      hostCard?.playLevelUpWiggle?.()
      console.log(`[Shop] drop resolution=buy-combine source=shop from=${shopIndex} to=${target}`)
      console.log(`[Shop] vfx slot=${target} stars=${occupant.stars}`)
      logShopBuy({ scene: this, unit: warrior, cost: warrior.cost, creditsAfter: this.gold, starLevel: occupant.stars })
      logShopCombine({ scene: this, unit: occupant, fromSlot: -1, toSlot: target, hostSlotAfter: target, newStars: occupant.stars })

    } else if (!occupant) {
      // buy-empty
      this.gold -= warrior.cost
      this.goldLabel.setText(`CREDITS: ${this.gold}`)
      this._updateFightUrgency()
      this.shopOffer[shopIndex] = null
      this.teamSlots[target] = { ...warrior, stars: warrior.stars ?? 1 }
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      // Destroy the dragged shop card — see buy-combine note above.
      this._dragLayer.remove(card, true)
      console.log(`[Shop] drop resolution=buy-empty source=shop from=${shopIndex} to=${target}`)
      logShopBuy({ scene: this, unit: warrior, cost: warrior.cost, creditsAfter: this.gold, starLevel: warrior.stars ?? 1 })

    } else {
      // reject-no-match
      this._returnShopCardHome(card)
      card.snapBack(Theme.error)
      console.log(`[Shop] drop resolution=reject-no-match source=shop from=${shopIndex} to=${target}`)
    }
  }

  // ── Team card drag ────────────────────────────────────────────────────────

  _bindTeamCardDrag(card, slotIndex) {
    card.hitZone.on('dragstart', (pointer) => {
      if (this._sellInProgress) { card._sellBlocked = true; return }
      if (card._isCelebrating) { card._sellBlocked = true; return }
      card._sellBlocked = false
      this._beginCardDrag(card, 'team', slotIndex, pointer)
      // Arm vault: brighten anchor, doors stay closed until hover
      this.tweens.killTweensOf(this.sellAnchor)
      this.tweens.add({ targets: this.sellAnchor, alpha: 1.0, duration: 150 })
      console.log(`[Shop] drag-start id=${this.teamSlots[slotIndex]?.id} source=team index=${slotIndex} creditsOk=true hasMatch=false teamFull=${this._countFilledSlots() === MAX_BENCH_SLOTS}`)
    })

    card.hitZone.on('drag', (pointer, dragX, dragY) => {
      if (card._sellBlocked) return
      this._moveDraggedCard(card, pointer)
      // React to the CARD touching the pill, not the pointer being in the zone —
      // that way the ghost + door-open fire the instant the card overlaps.
      const inZone = this._isCardOverSellZone(card)
      if (inZone && !this._doorsOpen) {
        this._openVaultDoors()
        // Ghost the dragged card so the cursor and the opening pill are both
        // visible through it once the card hits the sell button.
        this.tweens.killTweensOf(card)
        this.tweens.add({ targets: card, alpha: 0.35, duration: 120 })
      } else if (!inZone && this._doorsOpen) {
        this._closeVaultDoors()
        this.tweens.killTweensOf(card)
        this.tweens.add({ targets: card, alpha: 1.0, duration: 120 })
      }
    })

    card.hitZone.on('dragend', (pointer) => {
      if (card._sellBlocked) { card._sellBlocked = false; return }
      if (this._isCardOverSellZone(card)) {
        this._consumeSell(slotIndex, card, pointer)
      } else {
        if (this._doorsOpen) this._closeVaultDoors()
        this.tweens.killTweensOf(this.sellAnchor)
        this.tweens.add({ targets: this.sellAnchor, alpha: 0.9, duration: 200 })
        this._resolveTeamDrop(slotIndex, card, pointer)
      }
    })
  }

  _resolveTeamDrop(fromSlot, card, pointer) {
    this._endCardDrag(card)
    // Remove the dragged instance from the drag layer — _drawTeamRow() will recreate it
    this._dragLayer.remove(card, true)

    const target = this._getLogicalSlotFromPointer(pointer)
    if (target === null || target === fromSlot) {
      this._drawTeamRow()
      console.log(`[Shop] drop resolution=reject-dead-zone source=team from=${fromSlot} to=none`)
      return
    }

    const occupant = this.teamSlots[target]
    const dragged  = this.teamSlots[fromSlot]

    if (occupant && dragged.id === occupant.id) {
      // combine
      const aStars = dragged.stars ?? 1
      const bStars = occupant.stars ?? 1
      if (aStars !== bStars) {
        this._drawTeamRow()
        console.log(`[Shop] drop resolution=combine source=team from=${fromSlot} to=${target} rejected=stars-mismatch`)
        return
      }
      if (bStars >= MAX_STARS) {
        this._drawTeamRow()
        console.log(`[Shop] drop resolution=combine source=team from=${fromSlot} to=${target} rejected=already-max`)
        return
      }
      occupant.stars = bStars + 1
      occupant.hp  += 1
      occupant.atk += 1
      this.teamSlots[fromSlot] = null
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      const hostCard = this._teamCards[target]
      if (hostCard?.sprite) pulseLevelUp(this, hostCard.sprite)
      if (hostCard) pulseStarLevelUp(this, hostCard)
      hostCard?.playLevelUpWiggle?.()
      console.log(`[Shop] drop resolution=combine source=team from=${fromSlot} to=${target}`)
      console.log(`[Shop] vfx slot=${target} stars=${occupant.stars}`)
      logShopCombine({ scene: this, unit: occupant, fromSlot, toSlot: target, hostSlotAfter: target, newStars: occupant.stars })

    } else if (occupant) {
      // swap
      this.teamSlots[fromSlot] = occupant
      this.teamSlots[target]   = dragged
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      console.log(`[Shop] drop resolution=swap source=team from=${fromSlot} to=${target}`)

    } else {
      // reorder (move to empty slot)
      this.teamSlots[target]   = dragged
      this.teamSlots[fromSlot] = null
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      console.log(`[Shop] drop resolution=reorder source=team from=${fromSlot} to=${target}`)
    }
  }

  // ── Drop target helpers ───────────────────────────────────────────────────

  _getLogicalSlotFromPointer(pointer) {
    const cardH = WarriorCard.HEIGHT
    const cardW = WarriorCard.WIDTH

    // Check team row — use anchor world position (LayoutEditor may have moved them)
    for (let visualIdx = 0; visualIdx < MAX_BENCH_SLOTS; visualIdx++) {
      const anchor = this._teamAnchors[visualIdx]
      if (!anchor) continue
      if (Math.abs(pointer.y - anchor.y) <= cardH / 2 + 20 &&
          Math.abs(pointer.x - anchor.x) <= cardW / 2 + 10) {
        return (MAX_BENCH_SLOTS - 1) - visualIdx   // slot index
      }
    }
    return null
  }

  _isPointerInSellZone(pointer) {
    const a = this.sellAnchor
    if (!a) return false
    // Drop tolerance is generous around the pill so flicky drops still land.
    return Math.abs(pointer.x - a.x) < 100 && Math.abs(pointer.y - a.y) < 36
  }

  // AABB overlap between the dragged card and the sell pill's visual rect.
  // Drives vault doors + card ghost off the CARD, not the cursor, so the
  // affordance fires the moment the card crosses onto the button.
  _isCardOverSellZone(card) {
    const a = this.sellAnchor
    if (!a || !card) return false
    const cardHalfW = WarriorCard.WIDTH / 2
    const cardHalfH = WarriorCard.HEIGHT / 2
    const pillHalfW = 80   // pill visual 160/2
    const pillHalfH = 20   // pill visual 40/2
    return Math.abs(card.x - a.x) < (cardHalfW + pillHalfW) &&
           Math.abs(card.y - a.y) < (cardHalfH + pillHalfH)
  }

  // ── Sell vault — blue pill button whose halves open like vault doors ─────
  //
  // The button IS the vault: closed state reads as a standard blue pill
  // (SELL +1c). On drag-hover, the two pill halves swing open around their
  // outer hinges, exposing a dark pit with the card's destination label.

  _buildSellVault(x, y) {
    this.sellAnchor = this.add.container(x, y)
    this.sellAnchor.setDepth(8)
    this.sellAnchor.setAlpha(0.9)
    LayoutEditor.register(this, 'sellAnchor', this.sellAnchor, x, y)
    console.log(`[Layout] Shop.sellAnchor at (${x}, ${y})`)

    this._doorsOpen = false
    this._sellInProgress = false
    this._sellLabelPulse = null

    const W = 160
    const H = 40
    const R = H / 2  // pill radius

    // Pit — dark pill-shaped interior, revealed when doors swing open.
    const pit = this.add.graphics()
    pit.fillStyle(0x060608, 1)
    pit.fillCircle(-W / 2 + R, 0, R)
    pit.fillCircle( W / 2 - R, 0, R)
    pit.fillRect(-W / 2 + R, -H / 2, W - 2 * R, H)
    this.sellAnchor.add(pit)

    // Depth bands — thin highlight at top lip, pure black at bottom,
    // sell a shallow-but-readable pit through the pill opening.
    const depth = this.add.graphics()
    depth.fillStyle(0x1a1c24, 1)
    depth.fillRect(-W / 2 + 6, -H / 2 + 3, W - 12, 3)
    depth.fillStyle(0x000000, 1)
    depth.fillRect(-W / 2 + 6,  H / 2 - 6, W - 12, 3)
    this.sellAnchor.add(depth)

    // Pit label — "DROP" rises from the dark when the doors open,
    // telegraphs "card goes here" without crowding the closed-state face.
    // PixelLabel uses top-aligned origin; y=-7 centers a scale-2 glyph vertically.
    this.sellLabel = new PixelLabel(this, 0, -7, 'DROP', {
      scale: 2, color: 'critical', align: 'center',
    })
    this.sellLabel.setAlpha(0)
    this.sellAnchor.add(this.sellLabel)

    // Left door half — object origin at outer LEFT edge (parent x=-W/2),
    // shape extends right to the seam at parent x=0.
    this.leftDoor = this.add.graphics()
    this._drawPillDoorHalf(this.leftDoor, 'left', W, H, R, Theme.accent)
    this.leftDoor.x = -W / 2
    this.sellAnchor.add(this.leftDoor)

    // Right door half — mirror of left, hinge at outer RIGHT edge.
    this.rightDoor = this.add.graphics()
    this._drawPillDoorHalf(this.rightDoor, 'right', W, H, R, Theme.accent)
    this.rightDoor.x = W / 2
    this.sellAnchor.add(this.rightDoor)

    // Face label — "SELL" sits on top of the closed pill, fades as doors open.
    // y=-7 centres a scale-2 glyph in the 40-tall pill (label origin is top).
    this.sellFaceLabel = new PixelLabel(this, 0, -7, 'SELL', {
      scale: 2, color: 'critical', align: 'center',
    })
    this.sellAnchor.add(this.sellFaceLabel)

    // Pill border — drawn last so the outline persists whether doors are
    // open or closed, holding the pill silhouette steady during animation.
    const border = this.add.graphics()
    border.lineStyle(1, Theme.panelBorder, 1)
    border.strokeRoundedRect(-W / 2, -H / 2, W, H, R)
    this.sellAnchor.add(border)

    // Tooltip line below the pill — reinforces the payout so the player can
    // price the decision without opening the vault.
    this.sellIdleHint = new PixelLabel(this, 0, H / 2 + 10, '+1c REFUND', {
      scale: 1, color: 'muted', align: 'center',
    })
    this.sellAnchor.add(this.sellIdleHint)
  }

  /**
   * Pill-half graphics. Origin (0,0) of the graphics object sits at the
   * outer hinge edge of the pill so scaleX → 0 collapses the half edge-on,
   * mimicking a vault door swinging open.
   */
  _drawPillDoorHalf(gfx, side, W, H, R, color) {
    gfx.fillStyle(color, 1)
    if (side === 'left') {
      // Shape covers object-local x ∈ [0, W/2]; rounded cap at the outer edge.
      gfx.fillCircle(R, 0, R)
      gfx.fillRect(R, -H / 2, W / 2 - R, H)
      // Gold lock pin near the seam (object x = W/2)
      gfx.fillStyle(Theme.fantasyBorderGold, 1)
      gfx.fillRect(W / 2 - 6, -5, 2, 2)
      gfx.fillRect(W / 2 - 6,  3, 2, 2)
    } else {
      // Shape covers object-local x ∈ [-W/2, 0]; rounded cap at outer edge.
      gfx.fillRect(-W / 2, -H / 2, W / 2 - R, H)
      gfx.fillCircle(-R, 0, R)
      gfx.fillStyle(Theme.fantasyBorderGold, 1)
      gfx.fillRect(-W / 2 + 4, -5, 2, 2)
      gfx.fillRect(-W / 2 + 4,  3, 2, 2)
    }
  }

  _stopSellLabelPulse() {
    if (this._sellLabelPulse) {
      this._sellLabelPulse.stop()
      this._sellLabelPulse = null
    }
  }

  _openVaultDoors() {
    if (this._doorsOpen) return
    this._doorsOpen = true
    console.log('[Shop] sellVault doors OPEN (pointer in zone)')
    this.tweens.killTweensOf([this.leftDoor, this.rightDoor, this.sellLabel, this.sellFaceLabel])
    this._stopSellLabelPulse()
    // scaleX → 0.05 leaves a thin "edge on" sliver so each pill half reads as
    // standing open edge-on rather than vanishing — sells the 3D perspective.
    this.tweens.add({
      targets: [this.leftDoor, this.rightDoor],
      scaleX: 0.05,
      duration: 180,
      ease: 'Cubic.easeOut',
    })
    // Face label fades out as the doors swallow it.
    this.tweens.add({
      targets: this.sellFaceLabel,
      alpha: 0,
      duration: 120,
      ease: 'Sine.In',
    })
    // Pit label rises from the dark: start small + dim, then breathe gently.
    this.sellLabel.setScale(0.7)
    this.sellLabel.setAlpha(0)
    this.tweens.add({
      targets: this.sellLabel,
      alpha: 0.6,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 180,
      ease: 'Sine.Out',
      onComplete: () => {
        if (!this._doorsOpen) return
        this._sellLabelPulse = this.tweens.add({
          targets: this.sellLabel,
          alpha:  { from: 0.6, to: 1.0 },
          scaleX: { from: 1.0, to: 1.12 },
          scaleY: { from: 1.0, to: 1.12 },
          duration: 720,
          ease: 'Sine.InOut',
          yoyo: true,
          repeat: -1,
        })
      },
    })
  }

  _closeVaultDoors(onComplete) {
    const wasOpen = this._doorsOpen
    if (!wasOpen && !onComplete) return
    if (wasOpen) console.log('[Shop] sellVault doors CLOSE (pointer left zone)')
    this._doorsOpen = false
    this._stopSellLabelPulse()
    this.tweens.killTweensOf([this.leftDoor, this.rightDoor, this.sellLabel, this.sellFaceLabel])
    this.tweens.add({
      targets: [this.leftDoor, this.rightDoor],
      scaleX: 1.0,
      duration: 140,
      ease: 'Cubic.easeIn',
      onComplete,
    })
    // Pit label sinks back into the dark.
    this.tweens.add({
      targets: this.sellLabel,
      alpha: 0,
      scaleX: 0.7,
      scaleY: 0.7,
      duration: 120,
      ease: 'Sine.In',
    })
    // Face label rides the closing doors back into view.
    this.tweens.add({
      targets: this.sellFaceLabel,
      alpha: 1,
      duration: 160,
      ease: 'Sine.Out',
    })
  }

  _consumeSell(fromSlot, card, pointer) {
    if (this._sellInProgress) return
    this._sellInProgress = true
    this._endCardDrag(card)
    // Cancel any in-flight alpha tween from the hover-ghost so the fall tween
    // below owns the alpha channel outright.
    this.tweens.killTweensOf(card)

    const unit = this.teamSlots[fromSlot]
    console.log(`[Shop] sellVault consume: slot=${fromSlot} unit=${unit?.id} refund=1`)

    // Reparent dragged card onto vault so we can tween to its local origin.
    // _dragLayer sits at (0,0) so card.x/y are already world coords.
    const worldX = card.x
    const worldY = card.y
    this.sellAnchor.add(card)
    card.x = worldX - this.sellAnchor.x
    card.y = worldY - this.sellAnchor.y

    // Dust puff — expanding gold ring at vault center (OutlineController pattern)
    const ring = this.add.graphics()
    ring.lineStyle(2, Theme.fantasyGold, 1)
    ring.strokeCircle(0, 0, 12)
    ring.setAlpha(0.7)
    this.sellAnchor.add(ring)
    this.tweens.add({
      targets: ring,
      scaleX: 1.6, scaleY: 1.6, alpha: 0,
      duration: 280, ease: 'Sine.Out',
      onComplete: () => ring.destroy(),
    })

    // Card falls into hole — shrink + fade + slide to center
    this.tweens.add({
      targets: card,
      x: 0, y: 0,
      scaleX: 0.3, scaleY: 0.3,
      alpha: 0,
      duration: 220,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        card.destroy()
        this._closeVaultDoors(() => {
          this.teamSlots[fromSlot] = null
          this._syncDenseTeamFromSlots()
          this.gold += 1
          this.goldLabel.setText(`CREDITS: ${this.gold}`)
          this._updateFightUrgency()
          this._drawTeamRow()
          this.tweens.killTweensOf(this.sellAnchor)
          this.tweens.add({ targets: this.sellAnchor, alpha: 0.9, duration: 200 })
          this._sellInProgress = false
          logShopSell({ scene: this, unit, refund: 1, creditsAfter: this.gold })
          console.log(`[Shop] sellVault consume: animation complete, slot cleared`)
        })
      },
    })
  }

  // ── CRT pointer transform (unchanged) ────────────────────────────────────

  _installCrtPointerTransform(crtController) {
    if (!crtController) {
      console.warn('[Shop] CRT pointer transform skipped — no controller')
      return
    }
    const mgr = this.input.manager
    if (!mgr || typeof mgr.transformPointer !== 'function') {
      console.warn('[Shop] CRT pointer transform skipped — InputManager.transformPointer missing')
      return
    }
    if (mgr._shopCrtPatched) {
      console.warn('[Shop] CRT pointer transform already installed — reusing')
      this._crtPointerRestore = mgr._shopCrtRestore
      return
    }

    const cam = this.cameras.main
    const original = mgr.transformPointer
    mgr.transformPointer = function (pointer, pageX, pageY, wasMove) {
      original.call(this, pointer, pageX, pageY, wasMove)
      const amt = crtController.curvatureAmount
      if (!amt) return
      const w = cam.width
      const h = cam.height
      const uvX = pointer.x / w - 0.5
      const uvY = pointer.y / h - 0.5
      const d = uvX * uvX + uvY * uvY
      const p0 = pointer.position
      p0.x = (uvX + uvX * d * amt + 0.5) * w
      p0.y = (uvY + uvY * d * amt + 0.5) * h
      pointer.x = p0.x
      pointer.y = p0.y
    }
    mgr._shopCrtPatched = true
    mgr._shopCrtRestore = () => {
      mgr.transformPointer = original
      mgr._shopCrtPatched = false
      mgr._shopCrtRestore = null
    }
    this._crtPointerRestore = mgr._shopCrtRestore
    console.log(`[Shop] CRT pointer transform installed (curvature ${crtController.curvatureAmount})`)
  }

  _uninstallCrtPointerTransform() {
    if (!this._crtPointerRestore) return
    try {
      this._crtPointerRestore()
      console.log('[Shop] CRT pointer transform uninstalled')
    } catch (e) {
      console.error('[Shop] Failed to uninstall CRT pointer transform:', e)
    }
    this._crtPointerRestore = null
  }

  // ── Game actions ──────────────────────────────────────────────────────────

  _sellWarrior(index) {
    const warrior = this.teamSlots[index]
    if (!warrior) return
    const refund = 1
    this.gold += refund
    this.teamSlots[index] = null
    this._syncDenseTeamFromSlots()
    this.goldLabel.setText(`CREDITS: ${this.gold}`)
    this._updateFightUrgency()
    this._drawTeamRow()
    logShopSell({ scene: this, unit: warrior, refund, creditsAfter: this.gold })
  }

  _reroll() {
    if (this.gold < 1) return
    this.gold -= 1
    this.shopOffer = this.shop.roll()
    logShopReroll({ scene: this, cost: 1, creditsAfter: this.gold, rolled: null })
    this.scene.restart({
      stage: this.stage, gold: this.gold, wins: this.wins, losses: this.losses,
      team: this.team, runId: this.runId, commander: this.commander, merchant: this.merchant,
    })
  }

  async _startBattle() {
    if (this.team.length === 0) return

    if (this.fightBtn) this.fightBtn.setEnabled(false)
    const { width } = this.cameras.main
    const findingText = new PixelLabel(this, LEFT_COL_X, 410, 'FINDING OPPONENT...', {
      scale: 1, color: 'muted', align: 'center',
    })

    try {
      GhostManager.snapshotTeam(this.runId, this.wins, this.losses, this.stage, this.team)
      const opponent = await GhostManager.fetchOpponent(this.wins, this.losses, this.stage)
      this.scene.start('Battle', {
        stage: this.stage, wins: this.wins, losses: this.losses,
        team: this.team, runId: this.runId, commander: this.commander, merchant: this.merchant, opponent,
      })
    } catch (e) {
      console.error('[Shop] Ghost matchmaking failed, using AI opponent:', e)
      const opponent = new BattleEngine().generateEnemyTeam(this.stage)
      this.scene.start('Battle', {
        stage: this.stage, wins: this.wins, losses: this.losses,
        team: this.team, runId: this.runId, commander: this.commander, merchant: this.merchant, opponent,
      })
    }
  }
}
