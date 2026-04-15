import { Scene, Geom } from 'phaser'
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
import { getUnitPortraitRef } from '../rendering/UnitArt.js'
import { SceneCrt } from '../rendering/SceneCrt.js'
import { getMerchantIdleAnimKey } from '../config/merchants.js'

const BENCH_START_X = 50
const BENCH_Y = 390
const BENCH_SLOT_W = 56
const BENCH_SLOT_PITCH = 72
const BENCH_HIT_SLOP_Y = 12
const MAX_BENCH_SLOTS = 5
// Forgiving click/drag hit area — larger than the visual slot so clicks
// don't need to be precise. Width fills the full pitch; height adds
// BENCH_HIT_SLOP_Y of slop above and below.
const BENCH_HIT_W = BENCH_SLOT_PITCH
const BENCH_HIT_H = BENCH_SLOT_W + BENCH_HIT_SLOP_Y * 2

// TFT-style combine cap. 1* -> 2* -> 3*. Spec: "2 copies → 2-star, 4 copies → 3-star".
const MAX_STARS = 3

// Slot 0 is the front-of-line / first-to-act unit in combat (engine invariant
// from CombatCore + position.js). The battle scene renders player slot 0 at
// the right edge of the player group (closest to the enemy). To keep shop
// left→right order matching battle left→right order, the bench renders
// team[0] at the rightmost visual position. Visual index = MAX - 1 - slot.
const _slotToBenchX = (slot) =>
  BENCH_START_X + (MAX_BENCH_SLOTS - 1 - slot) * BENCH_SLOT_PITCH

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
    this.team = Array.isArray(data.team) ? data.team.map(w => ({ ...w })) : []
    this.availableWarriors = getEnabledWarriors()
    this.shop = new ShopManager(this.availableWarriors, this.stage)
    this.shopOffer = Array.isArray(data.shopOffer)
      ? data.shopOffer.map(w => (w ? { ...w } : null))
      : this.shop.roll()

    this.teamCountLabel = null
    this.goldLabel = null
    this.benchGroup = null
    this.cards = null

    this._selectedBenchIndex = null
    this._draggingFromIndex = null
    this._benchSlotRects = []
    this.sellBtn = null
  }

  create() {
    const { width, height } = this.cameras.main

    const freshTurn = this._freshTurn
    console.log(`[Shop] Creating shop scene — stage ${this.stage}, credits ${this.gold}${freshTurn ? ' (fresh turn, reset to 10)' : ''}, team size ${this.team.length}`)
    console.log(`[Shop] Commander: ${this.commander?.name ?? 'none'}`)

    // CRT post-process (softGameplay — interactive scene)
    const crtController = SceneCrt.attach(this, 'softGameplay')
    // The CRT barrel shader warps visible content but Phaser hit-testing
    // uses unwarped source coords, so clicks near the edges land where
    // source content WAS, not where the user sees it. Patch the input
    // manager's transformPointer to apply the same forward-barrel formula
    // to pointer.x/y so hit-testing lines up with what the user sees.
    this._installCrtPointerTransform(crtController)

    const headerPanel = new PixelPanel(this, 0, 0, width, 32, {
      bg: Theme.panelBg, border: Theme.panelBorder,
    })
    headerPanel.setDepth(20)
    LayoutEditor.register(this, 'headerPanel', headerPanel, 0, 0)

    const stageLabel = new PixelLabel(this, 12, 8, `STAGE ${this.stage}`, { scale: 2, color: 'accent' })
    stageLabel.setDepth(20)
    LayoutEditor.register(this, 'stageLabel', stageLabel, 12, 8)

    this.goldLabel = new PixelLabel(this, width / 2, 8, `GOLD: ${this.gold}`, {
      scale: 2, tint: Theme.warning, align: 'center',
    })
    this.goldLabel.setDepth(20)
    LayoutEditor.register(this, 'goldLabel', this.goldLabel, width / 2, 8)

    const livesLabel = new PixelLabel(this, width - 12, 8, `LIVES: ${3 - this.losses}`, {
      scale: 2, color: 'error', align: 'right',
    })
    livesLabel.setDepth(20)
    LayoutEditor.register(this, 'livesLabel', livesLabel, width - 12, 8)

    // Merchant display: chosen animated merchant (post-win-3) or the
    // pre-selection placeholder texture from BootScene. The chosen merchant
    // persists for the rest of the run via init(data).merchant threading.
    let merchant
    let merchantQuoteText = '"Choose your warriors wisely..."'
    if (this.merchant && this.textures.exists(this.merchant.spriteKey)) {
      merchant = this.add.sprite(width / 2, 72, this.merchant.spriteKey).setScale(1.5)
      const animKey = getMerchantIdleAnimKey(this.merchant)
      try {
        merchant.play(animKey)
        console.log(`[Shop] Merchant: ${this.merchant.name} playing '${animKey}'`)
      } catch (e) {
        console.error(`[Shop] sprite.play('${animKey}') failed for ${this.merchant.id}:`, e)
      }
      merchantQuoteText = this.merchant.blurb ?? merchantQuoteText
    } else {
      const merchantKey = this.textures.exists('merchant') ? 'merchant' : 'merchant_placeholder'
      merchant = this.add.image(width / 2, 72, merchantKey).setScale(1.5)
      console.log(`[Shop] Merchant: none chosen yet, using placeholder`)
    }
    merchant.setDepth(8)
    LayoutEditor.register(this, 'merchant', merchant, width / 2, 72)

    const merchantQuote = new PixelLabel(this, width / 2, 115, merchantQuoteText, {
      scale: 2, color: 'muted', align: 'center',
    })
    merchantQuote.setDepth(8)
    LayoutEditor.register(this, 'merchantQuote', merchantQuote, width / 2, 115)

    this.cardGroup = this.add.group()
    this._drawShopCards()

    // Card shelf — opaque panel that covers the bottom half of resting cards
    // (depth 5: above cards at rest=1, below cards on hover=10). This is what
    // creates the "half a card peeking" affordance.
    this.cardShelf = this.add.graphics()
    this.cardShelf.fillStyle(Theme.panelBg, 1)
    this.cardShelf.fillRect(0, 230, width, 110)
    this.cardShelf.lineStyle(1, Theme.panelBorder, 1)
    this.cardShelf.lineBetween(0, 230, width, 230)
    this.cardShelf.setDepth(5)
    LayoutEditor.register(this, 'cardShelf', this.cardShelf, 0, 0)

    const teamPanel = new PixelPanel(this, 16, 340, width - 32, 100, { title: 'YOUR TEAM' })
    teamPanel.setDepth(6)
    LayoutEditor.register(this, 'teamPanel', teamPanel, 16, 340)

    this._drawTeamBench()

    this.rerollBtn = new PixelButton(this, width / 2 - 130, 475, 'REROLL (1g)', () => {
      this._reroll()
    }, { style: 'filled', scale: 2, bg: Theme.accentDim, width: 140, height: 32 })
    this.rerollBtn.setDepth(8)
    LayoutEditor.register(this, 'rerollBtn', this.rerollBtn, width / 2 - 130, 475)

    this.fightBtn = new PixelButton(this, width / 2 + 130, 475, 'FIGHT!', () => {
      this._startBattle()
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 160, height: 40 })
    this.fightBtn.setDepth(8)
    LayoutEditor.register(this, 'fightBtn', this.fightBtn, width / 2 + 130, 475)

    this.teamCountLabel = new PixelLabel(this, width / 2, 475, `${this.team.length}/5`, {
      scale: 2, color: 'muted', align: 'center',
    })
    this.teamCountLabel.setDepth(8)
    LayoutEditor.register(this, 'teamCount', this.teamCountLabel, width / 2, 475)

    this._createSellButton()

    this.input.dragDistanceThreshold = 6
    this.input.keyboard.on('keydown-ESC', () => this._deselectBench('esc'))

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

  _drawShopCards() {
    const { width } = this.cameras.main
    const cardW = WarriorCard.WIDTH
    const gap = 16
    const totalW = this.shopOffer.length * cardW + (this.shopOffer.length - 1) * gap
    const startX = (width - totalW) / 2 + cardW / 2

    this.cards = []
    this.shopOffer.forEach((warrior, i) => {
      if (!warrior) return
      const x = startX + i * (cardW + gap)
      const y = 230

      const card = new WarriorCard(this, x, y, warrior, {
        onClick: () => this._buyWarrior(i),
      })
      LayoutEditor.register(this, `card_${i}`, card, x, y)
      // Capture rest position AFTER LayoutEditor applies overrides — register()
      // rewrites x/y immediately, so the constructor's snapshot is wrong.
      card.captureRestPosition()
      card.setDepth(1)
      this.cards.push(card)
    })
  }

  _drawTeamBench() {
    if (this.benchGroup) this.benchGroup.destroy(true)
    this.benchGroup = this.add.group()
    this._benchSlotRects = []

    for (let i = 0; i < 5; i++) {
      const x = _slotToBenchX(i)
      const y = BENCH_Y

      const slot = this.add.rectangle(x, y, BENCH_SLOT_W, BENCH_SLOT_W, Theme.screenBg)
        .setStrokeStyle(1, Theme.panelBorder)
      slot.setDepth(7)
      this.benchGroup.add(slot)
      this._benchSlotRects[i] = slot

      if (this.team[i]) {
        const w = this.team[i]
        const ref = getUnitPortraitRef(this, w, 'shop bench')
        // sprite + name are children of unitContainer only — NOT added to benchGroup
        // separately. benchGroup.destroy(true) recursively destroys container children.
        const sprite = this.add.image(0, -6, ref.key, ref.frame).setScale(1.3)
        const name = this.add.bitmapText(0, 22, FONT_KEY, w.name, 7)
          .setOrigin(0.5).setTint(Theme.primaryText)

        // Star badge above portrait for combined units. ASCII-only because
        // PixelFont (m5x7) has no glyph for ★ — it would render as '?'.
        const stars = w.stars ?? 1
        const starBadge = stars > 1
          ? this.add.bitmapText(0, -28, FONT_KEY, `*${stars}`, 7)
              .setOrigin(0.5).setTint(Theme.warning)
          : null

        const children = starBadge ? [sprite, name, starBadge] : [sprite, name]
        const unitContainer = this.add.container(x, y, children)
        unitContainer.setSize(BENCH_HIT_W, BENCH_HIT_H)
        unitContainer.setInteractive({
          hitArea: new Geom.Rectangle(-BENCH_HIT_W / 2, -BENCH_HIT_H / 2, BENCH_HIT_W, BENCH_HIT_H),
          hitAreaCallback: Geom.Rectangle.Contains,
          useHandCursor: true,
          draggable: true,
        })
        unitContainer.setDepth(8)
        // Per-container drag flag — set on dragstart, cleared on pointerdown.
        // Robust against Phaser's dragend→pointerup ordering.
        unitContainer._didDrag = false
        this.benchGroup.add(unitContainer)

        unitContainer.on('pointerdown', () => {
          unitContainer._didDrag = false
        })

        unitContainer.on('pointerup', () => {
          if (unitContainer._didDrag) return
          if (this._selectedBenchIndex === i) return
          this._selectBench(i)
        })

        unitContainer.on('pointerover', () => {
          if (this._selectedBenchIndex === i) return
          slot.setStrokeStyle(1, Theme.error)
        })
        unitContainer.on('pointerout', () => {
          if (this._selectedBenchIndex === i) return
          slot.setStrokeStyle(1, Theme.panelBorder)
        })

        unitContainer.on('dragstart', () => {
          unitContainer._didDrag = true
          this._draggingFromIndex = i
          unitContainer.setDepth(20)
          console.log(`[Shop] Drag start: slot ${i} (${this.team[i].name})`)
        })
        unitContainer.on('drag', (pointer, dragX, dragY) => {
          unitContainer.x = dragX
          unitContainer.y = dragY
        })
        unitContainer.on('dragend', (pointer) => {
          const from = this._draggingFromIndex
          this._draggingFromIndex = null
          const target = this._getSlotIndexFromPointer(pointer)

          if (target === null || target === from) {
            console.log(`[Shop] Drag end: slot ${from} — invalid drop, snapped back`)
            this._drawTeamBench()
            return
          }

          const dragged = this.team[from]
          const occupant = this.team[target]

          // Same-unit drop → attempt TFT-style combine before falling through
          // to swap. Rejections (mismatched stars, at max) snap back with a log.
          if (occupant && dragged && occupant.id === dragged.id) {
            const result = this._combineBench(from, target)
            if (result === 'combined') return
            console.log(`[Shop] Drag end: slot ${from} → slot ${target} — combine rejected (${result})`)
            this._drawTeamBench()
            return
          }

          if (occupant) {
            console.log(`[Shop] Drag end: slot ${from} → slot ${target} — swap with ${occupant.name}`)
            this._swapBench(from, target)
          } else {
            // Empty target beyond team.length: splice + push (keep dense)
            console.log(`[Shop] Drag end: slot ${from} → slot ${target} — moved to end`)
            const [moved] = this.team.splice(from, 1)
            this.team.push(moved)
            if (this._selectedBenchIndex === from) {
              this._selectedBenchIndex = this.team.length - 1
            } else if (this._selectedBenchIndex !== null && this._selectedBenchIndex > from) {
              this._selectedBenchIndex -= 1
            }
            this._drawTeamBench()
          }
        })
      } else {
        // Empty slot: click to deselect (when something is selected)
        slot.setInteractive({ useHandCursor: false })
        slot.on('pointerdown', () => {
          if (this._selectedBenchIndex !== null) {
            this._deselectBench('empty slot click')
          }
        })
      }
    }

    if (this.teamCountLabel) {
      this.teamCountLabel.setText(`${this.team.length}/5`)
    }

    if (this._selectedBenchIndex !== null && this._selectedBenchIndex >= this.team.length) {
      this._selectedBenchIndex = null
    }
    this._updateSelectionHighlight()
    this._updateSellButton()
  }

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
      // Forward barrel: source content at uv' = uv + (uv - 0.5) * |uv - 0.5|² * amount
      // is displayed at screen uv. So to convert a pointer (at screen uv) to
      // the source coord the user intended to click on, apply the same
      // forward transform.
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

  _createSellButton() {
    const { width } = this.cameras.main
    this.sellBtn = new PixelButton(this, width / 2, 505, 'SELL (+1g)', () => {
      this._sellSelected()
    }, { style: 'filled', scale: 2, bg: Theme.error, pill: true, width: 120, height: 28 })
    this.sellBtn.setDepth(9)
    this.sellBtn.setVisible(false)
    LayoutEditor.register(this, 'sellBtn', this.sellBtn, width / 2, 505)
    console.log('[Shop] SELL button created (hidden)')
  }

  _selectBench(index) {
    if (!this.team[index]) return
    const prev = this._selectedBenchIndex
    this._selectedBenchIndex = index
    if (prev !== null && prev !== index) {
      console.log(`[Shop] Bench select: slot ${prev} → slot ${index} (${this.team[index].name})`)
    } else {
      console.log(`[Shop] Bench select: slot ${index} (${this.team[index].name})`)
    }
    this._updateSelectionHighlight(prev)
    this._updateSellButton()
  }

  _deselectBench(reason) {
    if (this._selectedBenchIndex === null) return
    const prev = this._selectedBenchIndex
    this._selectedBenchIndex = null
    console.log(`[Shop] Bench deselect (${reason})`)
    this._updateSelectionHighlight(prev)
    this._updateSellButton()
  }

  _updateSelectionHighlight(previousIndex = null) {
    if (previousIndex !== null && this._benchSlotRects[previousIndex]) {
      this._benchSlotRects[previousIndex].setStrokeStyle(1, Theme.panelBorder)
    }
    const sel = this._selectedBenchIndex
    if (sel !== null && this._benchSlotRects[sel]) {
      this._benchSlotRects[sel].setStrokeStyle(2, Theme.selection)
    }
  }

  _updateSellButton() {
    if (!this.sellBtn) return
    this.sellBtn.setVisible(this._selectedBenchIndex !== null)
  }

  _sellSelected() {
    if (this._selectedBenchIndex === null) return
    const idx = this._selectedBenchIndex
    console.log(`[Shop] Sell via button: slot ${idx} (${this.team[idx].name}) refund 1g, credits now ${this.gold + 1}`)
    this._selectedBenchIndex = null
    this._sellWarrior(idx)
  }

  _swapBench(a, b) {
    const tmp = this.team[a]
    this.team[a] = this.team[b]
    this.team[b] = tmp
    if (this._selectedBenchIndex === a) this._selectedBenchIndex = b
    else if (this._selectedBenchIndex === b) this._selectedBenchIndex = a
    this._drawTeamBench()
  }

  // Drag-to-combine: the dragged warrior (A, at slot `from`) is consumed
  // and the host warrior (B, at slot `target`) gains +1 star / +1 HP / +1 ATK.
  // Returns 'combined' on success, otherwise a short reason string used by
  // the dragend handler to log a snap-back.
  //
  // Dense-bench invariant: splicing `from` shifts every index > from down
  // by 1, so the host's post-splice index is `target - 1` when from < target,
  // otherwise `target`. The host *warrior* survives; its *slot index* may
  // shift by one.
  _combineBench(from, target) {
    const dragged = this.team[from]
    const host = this.team[target]
    if (!dragged || !host) return 'missing-unit'
    if (dragged.id !== host.id) return 'id-mismatch'

    const aStars = dragged.stars ?? 1
    const bStars = host.stars ?? 1
    if (aStars !== bStars) return `stars-mismatch (${aStars}* vs ${bStars}*)`
    if (bStars >= MAX_STARS) return 'already-max'

    const nextStars = bStars + 1
    const prevHp = host.hp
    const prevAtk = host.atk
    host.stars = nextStars
    host.hp = prevHp + 1
    host.atk = prevAtk + 1

    this.team.splice(from, 1)
    const hostIndexAfter = (from < target) ? target - 1 : target

    if (this._selectedBenchIndex === from || this._selectedBenchIndex === target) {
      this._selectedBenchIndex = hostIndexAfter
    } else if (this._selectedBenchIndex !== null && this._selectedBenchIndex > from) {
      this._selectedBenchIndex -= 1
    }

    console.log(`[Shop] Combine: slot ${from} -> slot ${target} (host now at slot ${hostIndexAfter}), ${host.name} ${bStars}*->${nextStars}* (${prevHp}/${prevAtk} -> ${host.hp}/${host.atk})`)
    logShopCombine({ scene: this, unit: host, fromSlot: from, toSlot: target, hostSlotAfter: hostIndexAfter, newStars: nextStars })
    this._drawTeamBench()
    return 'combined'
  }

  _getSlotIndexFromPointer(pointer) {
    if (Math.abs(pointer.y - BENCH_Y) > (BENCH_SLOT_W / 2 + BENCH_HIT_SLOP_Y)) return null
    const visualIdx = Math.round((pointer.x - BENCH_START_X) / BENCH_SLOT_PITCH)
    const idx = (MAX_BENCH_SLOTS - 1) - visualIdx
    if (idx < 0 || idx > 4) return null
    return idx
  }

  _buyWarrior(index) {
    const warrior = this.shopOffer[index]
    if (!warrior) return
    if (this.gold < warrior.cost) return
    if (this.team.length >= 5) return

    const cost = warrior.cost
    this.gold -= cost
    this.team.push({ ...warrior, stars: warrior.stars ?? 1 })
    this.shopOffer[index] = null
    this.goldLabel.setText(`GOLD: ${this.gold}`)

    if (this.cards[index]) {
      this.cards[index].setDisabled()
    }

    this._drawTeamBench()
    logShopBuy({ scene: this, unit: warrior, cost, creditsAfter: this.gold, starLevel: warrior.stars ?? 1 })
  }

  _sellWarrior(index) {
    const warrior = this.team[index]
    if (!warrior) return
    const refund = 1
    this.gold += refund
    this.team.splice(index, 1)
    this.goldLabel.setText(`GOLD: ${this.gold}`)
    this._drawTeamBench()
    logShopSell({ scene: this, unit: warrior, refund, creditsAfter: this.gold })
  }

  _reroll() {
    if (this.gold < 1) return
    this.gold -= 1
    this.shopOffer = this.shop.roll()
    // Log reroll payment before restart — the upcoming create() will log a
    // shop_round with the actual cards shown (init will re-roll since we
    // don't thread shopOffer through restart data).
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
    const findingText = new PixelLabel(this, width / 2 + 130, 510, 'FINDING OPPONENT...', {
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
