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
import { pulseLevelUp } from '../rendering/OutlineController.js'

// Team card row
const TEAM_Y        = 122
const TEAM_CARD_XS  = [208, 344, 480, 616, 752]  // visual x per slot [4,3,2,1,0]
// slot → visual index: visualIdx = 4 - slotIndex
// slot 0 (front-of-line) = rightmost visual (x=752)

// Shop card row
const SHOP_Y        = 420   // card rest Y; shelf top at 420; hover rises to 340
const SHOP_CARD_XS  = [248, 384, 520, 656]

// Columns
const LEFT_COL_X    = 90
const MERCHANT_X    = 870
const MERCHANT_Y    = 160   // merchantStrip container anchor
const SELL_ZONE_Y_OFFSET = 200  // below merchant anchor inside merchantStrip

// Layout lines
const SYNERGY_Y     = 198
const DIVIDER_Y     = 220

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

    this.teamCountLabel = null
    this.goldLabel = null
    this.cards = null
    this._teamAnchors = null
    this._teamCards = null
    this._merchantStrip = null
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

    const teamHeaderLabel = new PixelLabel(this, width / 2 - 80, 8, 'TEAM', {
      scale: 2, color: 'accent', align: 'center',
    })
    teamHeaderLabel.setDepth(20)
    LayoutEditor.register(this, 'teamHeaderLabel', teamHeaderLabel, width / 2 - 80, 8)

    this.goldLabel = new PixelLabel(this, width / 2 + 60, 8, `CREDITS: ${this.gold}`, {
      scale: 2, tint: Theme.warning, align: 'center',
    })
    this.goldLabel.setDepth(20)
    LayoutEditor.register(this, 'goldLabel', this.goldLabel, width / 2 + 60, 8)

    const livesLabel = new PixelLabel(this, width - 12, 8, `LIVES: ${3 - this.losses}`, {
      scale: 2, color: 'error', align: 'right',
    })
    livesLabel.setDepth(20)
    LayoutEditor.register(this, 'livesLabel', livesLabel, width - 12, 8)

    // ── Section labels ────────────────────────────────────────
    const storeLabel = new PixelLabel(this, 12, SHOP_Y - 14, 'STORE', {
      scale: 2, color: 'accent', align: 'left',
    })
    storeLabel.setDepth(8)
    LayoutEditor.register(this, 'storeLabel', storeLabel, 12, SHOP_Y - 14)

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

    // ── Synergy label ─────────────────────────────────────────
    this._drawSynergyStub()

    // ── Divider ───────────────────────────────────────────────
    // Registered with LayoutEditor per plan (explicit exception to "no decorative" rule)
    this.dividerGraphic = this.add.graphics()
    this.dividerGraphic.lineStyle(1, Theme.panelBorder, 0.8)
    this.dividerGraphic.lineBetween(0, DIVIDER_Y, width, DIVIDER_Y)
    this.dividerGraphic.setDepth(6)
    LayoutEditor.register(this, 'divider', this.dividerGraphic, 0, 0)

    // ── Card shelf ────────────────────────────────────────────
    this.cardShelf = this.add.graphics()
    this.cardShelf.fillStyle(Theme.panelBg, 1)
    this.cardShelf.fillRect(0, SHOP_Y, width, height - SHOP_Y)
    this.cardShelf.lineStyle(1, Theme.panelBorder, 1)
    this.cardShelf.lineBetween(0, SHOP_Y, width, SHOP_Y)
    this.cardShelf.setDepth(5)
    LayoutEditor.register(this, 'cardShelf', this.cardShelf, 0, 0)

    // ── Shop cards ────────────────────────────────────────────
    this.cards = []
    this._drawShopCards()

    // ── Merchant strip ────────────────────────────────────────
    const merchantStrip = this.add.container(MERCHANT_X, MERCHANT_Y)
    merchantStrip.setDepth(8)
    this._merchantStrip = merchantStrip
    LayoutEditor.register(this, 'merchantStrip', merchantStrip, MERCHANT_X, MERCHANT_Y)

    let merchantQuoteText = '"Choose your warriors wisely..."'
    let merchantSprite
    if (this.merchant && this.textures.exists(this.merchant.spriteKey)) {
      merchantSprite = this.add.sprite(0, 0, this.merchant.spriteKey).setScale(1.2)
      const animKey = getMerchantIdleAnimKey(this.merchant)
      try {
        merchantSprite.play(animKey)
        console.log(`[Shop] Merchant: ${this.merchant.name} playing '${animKey}'`)
      } catch (e) {
        console.error(`[Shop] sprite.play('${animKey}') failed for ${this.merchant.id}:`, e)
      }
      merchantQuoteText = this.merchant.blurb ?? merchantQuoteText
    } else {
      const merchantKey = this.textures.exists('merchant') ? 'merchant' : 'merchant_placeholder'
      merchantSprite = this.add.image(0, 0, merchantKey).setScale(1.2)
      console.log(`[Shop] Merchant: none chosen yet, using placeholder`)
    }
    merchantStrip.add(merchantSprite)

    const merchantQuote = new PixelLabel(this, 0, 60, merchantQuoteText, {
      scale: 1, color: 'muted', align: 'center',
    })
    merchantStrip.add(merchantQuote)

    // Sell zone (hidden by default, shown during team drag)
    this.sellZoneGraphic = this.add.graphics()
    this.sellZoneGraphic.lineStyle(2, Theme.error, 0.6)
    this.sellZoneGraphic.strokeRect(-62, SELL_ZONE_Y_OFFSET - 40, 124, 80)
    this.sellZoneGraphic.setVisible(false)
    merchantStrip.add(this.sellZoneGraphic)

    this.sellLabel = new PixelLabel(this, 0, SELL_ZONE_Y_OFFSET, 'SELL', {
      scale: 2, color: 'error', align: 'center',
    })
    this.sellLabel.setVisible(false)
    merchantStrip.add(this.sellLabel)

    // ── Button strip ──────────────────────────────────────────
    const buttonStrip = this.add.container(LEFT_COL_X, 360)
    buttonStrip.setDepth(8)
    LayoutEditor.register(this, 'buttonStrip', buttonStrip, LEFT_COL_X, 360)

    this.rerollBtn = new PixelButton(this, 0, -40, 'REROLL (1g)', () => {
      this._reroll()
    }, { style: 'filled', scale: 2, bg: Theme.accentDim, width: 140, height: 32 })
    buttonStrip.add(this.rerollBtn)

    this.fightBtn = new PixelButton(this, 0, 20, 'FIGHT!', () => {
      this._startBattle()
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 160, height: 40 })
    buttonStrip.add(this.fightBtn)

    // ── Team count label ──────────────────────────────────────
    this.teamCountLabel = new PixelLabel(this, LEFT_COL_X, 310, `${this._countFilledSlots()}/5`, {
      scale: 2, color: 'muted', align: 'center',
    })
    this.teamCountLabel.setDepth(8)
    LayoutEditor.register(this, 'teamCount', this.teamCountLabel, LEFT_COL_X, 310)

    // ── Drag layer (floats above everything during card drag) ─────────────────
    this._dragLayer = this.add.container(0, 0)
    this._dragLayer.setDepth(30)

    this.input.dragDistanceThreshold = 6

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[Shop] Shutdown — cleaning up')
      LayoutEditor.unregisterScene('Shop')
      this._uninstallCrtPointerTransform()
    })

    logShopRound({ scene: this, rolled: this.shopOffer })

    console.log('[Shop] Scene created successfully')
    finalizeCaptureScene('Shop')
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
          .setStrokeStyle(1, Theme.panelBorder, 0.4)
        anchor.add(placeholder)
      }
    }

    if (this.synergyLabel) this._updateSynergyStub()
    if (this.teamCountLabel) this.teamCountLabel.setText(`${this._countFilledSlots()}/5`)
  }

  // ── Synergy label ─────────────────────────────────────────────────────────

  _drawSynergyStub() {
    const text = this._buildSynergyText()
    this.synergyLabel = new PixelLabel(this, this.cameras.main.width / 2, SYNERGY_Y, text, {
      scale: 2, tint: Theme.fantasyGoldBright, align: 'center',
    })
    this.synergyLabel.setDepth(8)
    LayoutEditor.register(this, 'synergyText', this.synergyLabel, this.cameras.main.width / 2, SYNERGY_Y)
  }

  _updateSynergyStub() {
    this.synergyLabel.setText(this._buildSynergyText())
  }

  _buildSynergyText() {
    const counts = {}
    this.teamSlots.filter(Boolean).forEach(u => {
      if (u.faction) counts[u.faction] = (counts[u.faction] || 0) + 1
      if (u.class)   counts[u.class]   = (counts[u.class]   || 0) + 1
    })
    const parts = Object.entries(counts).map(([tag, n]) => `${tag} x${n}`)
    return parts.join('   ')
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

  // ── Shop card drag ────────────────────────────────────────────────────────

  _bindShopCardDrag(card, shopIndex) {
    let _rejected = false

    card.hitZone.on('dragstart', (pointer) => {
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
      this.goldLabel.setText(`GOLD: ${this.gold}`)
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
      console.log(`[Shop] drop resolution=buy-combine source=shop from=${shopIndex} to=${target}`)
      console.log(`[Shop] vfx slot=${target} stars=${occupant.stars}`)
      logShopBuy({ scene: this, unit: warrior, cost: warrior.cost, creditsAfter: this.gold, starLevel: occupant.stars })
      logShopCombine({ scene: this, unit: occupant, fromSlot: -1, toSlot: target, hostSlotAfter: target, newStars: occupant.stars })

    } else if (!occupant) {
      // buy-empty
      this.gold -= warrior.cost
      this.goldLabel.setText(`GOLD: ${this.gold}`)
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
      card.snapBack(Theme.error)
      console.log(`[Shop] drop resolution=reject-no-match source=shop from=${shopIndex} to=${target}`)
    }
  }

  // ── Team card drag ────────────────────────────────────────────────────────

  _bindTeamCardDrag(card, slotIndex) {
    card.hitZone.on('dragstart', (pointer) => {
      this._beginCardDrag(card, 'team', slotIndex, pointer)
      this.sellZoneGraphic.setVisible(true)
      this.sellLabel.setVisible(true)
      this.sellLabel.setText('SELL')
      this.sellZoneGraphic.setAlpha(0.6)
      console.log(`[Shop] drag-start id=${this.teamSlots[slotIndex]?.id} source=team index=${slotIndex} creditsOk=true hasMatch=false teamFull=${this._countFilledSlots() === MAX_BENCH_SLOTS}`)
    })

    card.hitZone.on('drag', (pointer, dragX, dragY) => {
      this._moveDraggedCard(card, pointer)
      if (this._isPointerInSellZone(pointer)) {
        this.sellLabel.setText('SELL +1')
        this.sellZoneGraphic.setAlpha(1.0)
      } else {
        this.sellLabel.setText('SELL')
        this.sellZoneGraphic.setAlpha(0.6)
      }
    })

    card.hitZone.on('dragend', (pointer) => {
      this.sellZoneGraphic.setVisible(false)
      this.sellLabel.setVisible(false)
      this._resolveTeamDrop(slotIndex, card, pointer)
    })
  }

  _resolveTeamDrop(fromSlot, card, pointer) {
    this._endCardDrag(card)
    // Remove the dragged instance from the drag layer — _drawTeamRow() will recreate it
    this._dragLayer.remove(card, true)
    const unit = this.teamSlots[fromSlot]

    if (this._isPointerInSellZone(pointer)) {
      this.teamSlots[fromSlot] = null
      this._syncDenseTeamFromSlots()
      this.gold += 1
      this.goldLabel.setText(`GOLD: ${this.gold}`)
      this._drawTeamRow()
      console.log(`[Shop] drop resolution=sell source=team from=${fromSlot} to=merchant`)
      logShopSell({ scene: this, unit, refund: 1, creditsAfter: this.gold })
      return
    }

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
    const strip = this._merchantStrip
    const wx = strip.x + 0
    const wy = strip.y + SELL_ZONE_Y_OFFSET
    return Math.abs(pointer.x - wx) < 72 && Math.abs(pointer.y - wy) < 50
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
    this.goldLabel.setText(`GOLD: ${this.gold}`)
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
