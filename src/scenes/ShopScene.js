import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelButton, PixelLabel, PixelPanel, WarriorCard,
  pillShades,
} from '../ui/index.js'
import { ShopManager } from '../systems/ShopManager.js'
import { GhostManager } from '../systems/GhostManager.js'
import { BattleEngine } from '../systems/BattleEngine.js'
import { getEnabledAlphaWarriors as getEnabledWarriors } from '../config/alpha-units.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { logShopRound, logShopBuy, logShopSell, logShopReroll, logShopCombine } from '../systems/PlaytestLogger.js'
import { SceneCrt } from '../rendering/SceneCrt.js'
import { SceneDust } from '../rendering/SceneDust.js'
import { getMerchantIdleAnimKey } from '../config/merchants.js'
import { pulseLevelUp, pulseStarLevelUp } from '../rendering/OutlineController.js'
import { SynergyChipStrip } from '../widgets/SynergyChipStrip.js'
import { SynergyTooltip } from '../widgets/SynergyTooltip.js'
import { CommanderBadge } from '../widgets/CommanderBadge.js'
import { LockToggle } from '../widgets/LockToggle.js'
import { TutorialOverlay } from '../widgets/TutorialOverlay.js'
import { pickTutorialSeedIds } from './tutorialSeed.js'
import { SoundManager } from '../systems/SoundManager.js'

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
const TEAM_ANCHOR_BASE_DEPTH = 9
const TEAM_ANCHOR_HOVER_DEPTH = 10

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
    this.tutorial = data.tutorial === true
    this._tutorialActive = false
    this._tutorialOverlay = null

    // Per-card lock state — one boolean per shop slot (4). Locked slots preserve
    // their card across manual rerolls AND round transitions. Lock auto-clears
    // when a card is bought out from under it.
    this.shopLocks = Array.isArray(data.shopLocks)
      ? [0, 1, 2, 3].map(i => !!data.shopLocks[i])
      : [false, false, false, false]

    // Sparse 5-slot model for shop UI. BattleScene and external systems only see this.team (dense).
    this.teamSlots = new Array(5).fill(null)
    const incomingTeam = Array.isArray(data.team) ? data.team.map(w => ({ ...w })) : []
    incomingTeam.forEach((w, i) => { if (i < 5) this.teamSlots[i] = w })
    this.team = this.teamSlots.filter(Boolean)  // dense mirror, kept in sync

    this.availableWarriors = getEnabledWarriors()
    this.shop = new ShopManager(this.availableWarriors, this.stage)

    // Build the opening offer: if a prior offer was handed through (returning
    // from battle with locked cards), keep the locked slots and roll the rest.
    // Otherwise roll fresh for all 4.
    if (Array.isArray(data.shopOffer)) {
      const incoming = data.shopOffer.map(w => (w ? { ...w } : null))
      const fresh = this.shop.roll()
      this.shopOffer = [0, 1, 2, 3].map(i => {
        if (this.shopLocks[i] && incoming[i]) return incoming[i]
        // Not locked (or locked-but-empty): take fresh and clear the lock.
        this.shopLocks[i] = false
        return fresh[i] ? { ...fresh[i] } : null
      })
    } else {
      this.shopOffer = this.shop.roll()
      this.shopLocks = [false, false, false, false]
    }

    if (this.tutorial && this.stage === 1) {
      const seedIds = pickTutorialSeedIds(this.availableWarriors)
      if (seedIds.length > 0) {
        this.shopOffer = seedIds.map((id) => {
          const proto = this.availableWarriors.find(w => w.id === id)
          return proto ? { ...proto } : null
        })
        this.shopLocks = [false, false, false, false]
        console.log(`[Tutorial] Seeded stage-1 shop: [${seedIds.join(', ')}]`)
      } else {
        console.log('[Tutorial] No tutorial seed available - keeping rolled shop')
      }
    }

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

  _getTeamVisualIndex(slotIndex) {
    return (MAX_BENCH_SLOTS - 1) - slotIndex
  }

  _getTeamAnchor(slotIndex) {
    return this._teamAnchors?.[this._getTeamVisualIndex(slotIndex)] ?? null
  }

  _getTeamAnchorBaseDepth(visualIdx) {
    // Preserve the previous left-to-right stacking deterministically:
    // rightmost anchors sit slightly above leftmost anchors at rest.
    return TEAM_ANCHOR_BASE_DEPTH + visualIdx * 0.001
  }

  _restackTeamAnchors(activeSlot = null) {
    if (!this._teamAnchors) return
    const activeVisualIdx = activeSlot === null ? null : this._getTeamVisualIndex(activeSlot)
    this._teamAnchors.forEach((anchor, visualIdx) => {
      if (!anchor) return
      anchor.setDepth(
        visualIdx === activeVisualIdx
          ? TEAM_ANCHOR_HOVER_DEPTH
          : this._getTeamAnchorBaseDepth(visualIdx),
      )
    })

    // Depth is not enough on its own when sibling containers share the same
    // band; make the display-list order explicit so rightmost team cards sit
    // above left neighbors at rest, and the actively hovered slot wins last.
    this._teamAnchors.forEach((anchor) => {
      if (anchor) this.children.bringToTop(anchor)
    })
    if (activeVisualIdx !== null) {
      const activeAnchor = this._teamAnchors[activeVisualIdx]
      if (activeAnchor) this.children.bringToTop(activeAnchor)
    }
  }

  // Called when a shop slot empties (buy / combine): clear its lock state
  // so the next dealt card is unlocked, and hide the padlock UI until then.
  _clearShopLock(shopIndex) {
    if (!this.shopLocks) return
    if (this.shopLocks[shopIndex]) {
      console.log(`[Shop] slot ${shopIndex} bought — clearing lock`)
      this.shopLocks[shopIndex] = false
    }
    const toggle = this.lockToggles?.[shopIndex]
    if (toggle) {
      toggle.setLocked(false, { animate: false })
      toggle.setVisible(false)
    }
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
    console.log(`[Shop] Creating shop scene — stage ${this.stage}, credits ${this.gold}${freshTurn ? ' (fresh turn, reset to 10)' : ''}, team size ${this.team.length}, tutorial=${this.tutorial}`)
    console.log(`[Shop] Commander: ${this.commander?.name ?? 'none'}`)

    // CRT post-process (softGameplay — interactive scene)
    const crtController = SceneCrt.attach(this, 'softGameplay')
    this._installCrtPointerTransform(crtController)
    // Ambient dust — warm shop haze drifting left
    SceneDust.attach(this, 'shop')

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
      anchor.setDepth(this._getTeamAnchorBaseDepth(visualIdx))
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

    // ── Per-card lock toggles (one tiny 3D padlock above each shop card) ─
    // Low rest alpha so the row of 4 doesn't pull attention from the cards.
    // Clicking a padlock preserves that card across REROLL and round transitions.
    // Hidden when the underlying slot is empty (card bought).
    const LOCK_Y = 292
    this.lockToggles = SHOP_CARD_XS.map((cardX, i) => {
      const toggle = new LockToggle(this, cardX, LOCK_Y, {
        locked: this.shopLocks[i],
        onToggle: (locked) => {
          this.shopLocks[i] = locked
          console.log(`[Shop] shop lock slot ${i} → ${locked ? 'LOCKED' : 'UNLOCKED'}`)
        },
      })
      toggle.setDepth(7)
      if (!this.shopOffer[i]) toggle.setVisible(false)
      LayoutEditor.register(this, `shopLockToggle_${i}`, toggle, cardX, LOCK_Y)
      console.log(`[Layout] Shop.shopLockToggle_${i} at (${cardX}, ${LOCK_Y}) locked=${this.shopLocks[i]}`)
      return toggle
    })

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

    // ── Commander badge (left column, mirrors merchant strip on the right) ─
    const COMMANDER_X = 90
    const COMMANDER_Y = 160
    if (this.commander) {
      const commanderBadge = new CommanderBadge(this, COMMANDER_X, COMMANDER_Y, this.commander)
      commanderBadge.setDepth(0)
      console.log(`[Shop] Commander badge depth=0 (below cards) to avoid alpha-space click blocking`)
      this._commanderBadge = commanderBadge
      LayoutEditor.register(this, 'commanderBadge', commanderBadge, COMMANDER_X, COMMANDER_Y)
      console.log(`[Layout] Shop.commanderBadge at (${COMMANDER_X}, ${COMMANDER_Y}) — ${this.commander.name}`)
    } else {
      console.log('[Shop] No commander in run state — skipping commander badge')
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
      // Out-of-credits path still plays the spin, but crashes into a red
      // "NO FUNDS" pill instead of rolling — the slot machine refuses to pay out.
      // Locked slots are preserved through the roll; unlocked slots refresh.
      if (this._tutorialActive) {
        console.log('[Tutorial] Reroll blocked (tutorial active).')
        const bounds = this._getRerollButtonBounds()
        this._showTutorialHint('Locked during tutorial', bounds
          ? { x: bounds.x + bounds.width / 2, y: bounds.y }
          : null)
        return
      }
      if (this.gold < 1) {
        console.log('[Shop] reroll clicked — no funds, spinning to NO FUNDS')
        SoundManager.shopNoFunds()
        this.rerollBtn.btnBg = Theme.error
        this.rerollBtn._redrawBg(Theme.error)
        this.rerollBtn.spin(() => {
          // If credits returned mid-spin (e.g. user sold a unit while reels
          // were rolling), flip back to REROLL instead of stamping the lie in.
          // Otherwise re-assert red in case hover state crept in.
          if (this.gold >= 1) this._updateRerollButtonState()
          else this.rerollBtn._redrawBg(Theme.error)
        }, { settleLabel: 'NO FUNDS' })
        return
      }
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

    // cornerRadius > 0 routes the fill through drawPill3D (same SNES-Start bump
     // as REROLL/SELL), but a small radius keeps it reading as a rectangle.
    this.fightBtn = new PixelButton(this, 0, 0, 'FIGHT!', () => {
      this._startBattle()
    }, { style: 'filled', scale: 3, bg: Theme.accentDim, width: 160, height: 44, cornerRadius: 4 })
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

    if (this.tutorial && this.stage === 1) {
      this._startStageOneTutorial(livesLabel)
    }

    console.log('[Shop] Scene created successfully')
    finalizeCaptureScene('Shop')
  }

  // ── Fight button urgency (out-of-credits "soft touch" attention) ─────────
  // When credits hit 0, FIGHT! subtly swells, micro-shakes, and a low-alpha
  // shimmer sweeps left → right on loop. Stops the moment credits return.

  _startStageOneTutorial(livesLabel) {
    if (this._tutorialOverlay) return

    this._tutorialOverlay = new TutorialOverlay(this, {
      steps: [
        {
          id: 'welcome',
          anchor: 'center',
          title: 'Welcome to Hired Swords',
          body: 'Build a team. The team fights. Make it to 9 wins before 3 losses.',
          advance: 'click',
        },
        {
          id: 'lives',
          target: () => livesLabel,
          ring: true,
          title: "3 strikes and you're out",
          body: 'Lose 3 battles and your run ends. Win 9 to claim a spot in the Hall of Fame.',
          advance: 'click',
        },
        {
          id: 'drag-buy-1',
          target: () => this._getFirstShopCard(),
          ring: true,
          arrow: 'down',
          pulseHint: () => this._getEmptyBenchSlotBounds(),
          body: 'Buy a warrior by dragging it from the shop to your bench.',
          advance: { event: 'tutorial:bought' },
          condition: () => !!this._getFirstShopCard(),
        },
        {
          id: 'positions',
          bounds: () => this._getBenchRowBounds(),
          ring: true,
          title: 'Position matters',
          body: 'Front units (right side) fight first. Drag bench cards to reorder. Tanks up front, fragile units in back.',
          advance: 'click',
        },
        {
          id: 'drag-buy-2',
          target: () => this._findSameTagNonDuplicateShopCard(),
          ring: true,
          arrow: 'down',
          pulseHint: () => this._getEmptyBenchSlotBounds(),
          title: 'Units have synergies',
          body: 'Buy another and place it on your bench. Units that share a class or faction unlock synergies.',
          advance: { event: 'tutorial:bought' },
          condition: () => !!this._findSameTagNonDuplicateShopCard(),
        },
        {
          id: 'synergy',
          bounds: () => this._getSynergyChipBounds(),
          ring: true,
          arrow: 'up',
          title: 'Synergy active',
          body: 'This chip lit up because 2+ units share a tag. Shared tags often get stronger as you stack them - themed teams beat random ones.',
          advance: 'click',
          condition: () => this._hasActiveSynergy(),
        },
        {
          id: 'combine',
          targets: [
            () => this._findDuplicateShopCard(),
            () => this._findMatchingTeamCardForDuplicateShopCard(),
          ],
          ring: true,
          arrow: 'down',
          title: 'Duplicates -> power spike',
          body: 'drag units ontop of each other to level them up',
          advance: { event: 'tutorial:combined' },
          condition: () => this._hasShopBenchCombinePair(),
          conditionFailureLog: () => {
            if (this.teamSlots.some(u => u && (u.stars ?? 1) > 1)) {
              console.log('[Tutorial] Step "combine" skipped (already combined during step 5)')
            }
          },
        },
        {
          id: 'economy',
          targets: [
            () => this.rerollBtn,
            () => this.lockToggles?.[0],
            () => this.lockToggles?.[1],
            () => this.lockToggles?.[2],
            () => this.lockToggles?.[3],
          ],
          ring: true,
          title: 'Spend it all',
          body: "Spend all your credits every turn - they aren't saved. Reroll and lock the units you may want to buy.",
          advance: 'click',
        },
        {
          id: 'fight',
          target: () => this.fightBtn,
          ring: true,
          title: 'Ready when you are',
          body: "Click FIGHT to battle. Spend your credits - they don't carry over to next round.",
          advance: 'click',
        },
      ],
      onBlockedPointerDown: (pointer) => this._handleTutorialBlockedPointer(pointer),
      onComplete: () => {
        this._tutorialOverlay = null
        this._updateRerollButtonState()
      },
      onSkip: () => {
        this.tutorial = false
        this._tutorialOverlay = null
        this._updateRerollButtonState()
      },
    })
    this._tutorialOverlay.start()
    this._updateRerollButtonState()
  }

  _getFirstShopCard() {
    return this.cards?.find(Boolean) ?? null
  }

  _unitTags(unit) {
    return [unit?.faction, unit?.class].filter(Boolean)
  }

  _sharesAnyTag(a, b) {
    const tags = new Set(this._unitTags(a))
    return this._unitTags(b).some(tag => tags.has(tag))
  }

  _findSameTagNonDuplicateShopCard() {
    const benchUnits = this.teamSlots.filter(Boolean)
    if (benchUnits.length === 0) return null
    const benchIds = new Set(benchUnits.map(u => u.id))
    const index = this.shopOffer.findIndex(w =>
      w
      && !benchIds.has(w.id)
      && benchUnits.some(unit => this._sharesAnyTag(unit, w)))
    return index >= 0 ? this.cards?.[index] ?? null : null
  }

  _findDuplicateShopIndex() {
    return this.shopOffer.findIndex(w =>
      w && this.teamSlots.some(s =>
        s
        && s.id === w.id
        && (s.stars ?? 1) === (w.stars ?? 1)
        && (s.stars ?? 1) < MAX_STARS,
      ))
  }

  _findDuplicateShopCard() {
    const index = this._findDuplicateShopIndex()
    return index >= 0 ? this.cards?.[index] ?? null : null
  }

  _findMatchingTeamCardForDuplicateShopCard() {
    const index = this._findDuplicateShopIndex()
    if (index < 0) return null
    const warrior = this.shopOffer[index]
    const slot = this.teamSlots.findIndex(s =>
      s
      && s.id === warrior.id
      && (s.stars ?? 1) === (warrior.stars ?? 1)
      && (s.stars ?? 1) < MAX_STARS,
    )
    return slot >= 0 ? this._teamCards?.[slot] ?? null : null
  }

  _hasShopBenchCombinePair() {
    return this._findDuplicateShopIndex() >= 0
  }

  _hasActiveSynergy() {
    const counts = {}
    this.teamSlots.filter(Boolean).forEach(u => {
      if (u.faction) counts[u.faction] = (counts[u.faction] || 0) + 1
      if (u.class)   counts[u.class]   = (counts[u.class]   || 0) + 1
    })
    return Object.values(counts).some(n => n >= 2)
  }

  _getEmptyBenchSlotBounds() {
    if (!this._teamAnchors) return []
    return this._teamAnchors
      .map((anchor, visualIdx) => {
        if (!anchor) return null
        const slotIdx = (MAX_BENCH_SLOTS - 1) - visualIdx
        if (this.teamSlots[slotIdx]) return null
        return {
          x: anchor.x - WarriorCard.WIDTH / 2,
          y: anchor.y - WarriorCard.HEIGHT / 2,
          width: WarriorCard.WIDTH,
          height: WarriorCard.HEIGHT,
        }
      })
      .filter(Boolean)
  }

  _getBenchRowBounds() {
    const rects = this._teamAnchors
      .filter(Boolean)
      .map(anchor => ({
        x: anchor.x - WarriorCard.WIDTH / 2,
        y: anchor.y - WarriorCard.HEIGHT / 2,
        width: WarriorCard.WIDTH,
        height: WarriorCard.HEIGHT,
      }))
    if (!rects.length) return null
    const x1 = Math.min(...rects.map(r => r.x))
    const y1 = Math.min(...rects.map(r => r.y))
    const x2 = Math.max(...rects.map(r => r.x + r.width))
    const y2 = Math.max(...rects.map(r => r.y + r.height))
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }

  _getSynergyChipBounds() {
    const chips = this.synergyChips?._activeChips ?? []
    const rects = chips
      .filter(chip => chip.visible)
      .map((chip) => {
        try {
          const b = chip.getBounds()
          if (b && b.width > 0 && b.height > 0) return b
        } catch (e) {
          console.error('[Tutorial] Synergy chip bounds failed:', e)
        }
        return null
      })
      .filter(Boolean)
    if (rects.length) {
      const x1 = Math.min(...rects.map(r => r.x))
      const y1 = Math.min(...rects.map(r => r.y))
      const x2 = Math.max(...rects.map(r => r.x + r.width))
      const y2 = Math.max(...rects.map(r => r.y + r.height))
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
    }
    if (!this.synergyChips) return null
    return {
      x: this.synergyChips.x - 110,
      y: this.synergyChips.y - 25,
      width: 220,
      height: 50,
    }
  }

  _hasUnmergedPairOnBench() {
    const bench = this.teamSlots.filter(Boolean)
    return bench.some((a, i) =>
      bench.slice(i + 1).some(b =>
        a.id === b.id
        && (a.stars ?? 1) === (b.stars ?? 1)
        && (a.stars ?? 1) < MAX_STARS,
      ),
    )
  }

  _showTutorialHint(msg, anchor = null) {
    const benchBounds = this._getBenchRowBounds()
    const point = anchor ?? {
      x: this.cameras.main.width / 2,
      y: benchBounds?.y ?? TEAM_Y,
    }
    const label = new PixelLabel(this, point.x, point.y - 28, msg, {
      scale: 1, color: 'warning', align: 'center',
    })
    label.setDepth(1502)
    label.setAlpha(0)
    this.tweens.add({
      targets: label,
      alpha: 1,
      y: label.y - 8,
      duration: 160,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          duration: 360,
          delay: 1600,
          ease: 'Cubic.easeIn',
          onComplete: () => label.destroy(),
        })
      },
    })
  }

  _handleTutorialBlockedPointer(pointer) {
    if (!this._tutorialActive || !this.rerollBtn) return
    const bounds = this._getRerollButtonBounds()
    if (!bounds) return
    if (pointer.x < bounds.x || pointer.x > bounds.x + bounds.width
        || pointer.y < bounds.y || pointer.y > bounds.y + bounds.height) {
      return
    }
    console.log('[Tutorial] Reroll blocked (tutorial active).')
    this._showTutorialHint('Locked during tutorial', {
      x: bounds.x + bounds.width / 2,
      y: bounds.y,
    })
  }

  _getRerollButtonBounds() {
    const btn = this.rerollBtn
    if (!btn) return null
    let x = btn.x
    let y = btn.y
    let parent = btn.parentContainer
    while (parent) {
      x += parent.x ?? 0
      y += parent.y ?? 0
      parent = parent.parentContainer
    }
    return {
      x: x - (btn.btnW ?? 160) / 2,
      y: y - (btn.btnH ?? 40) / 2,
      width: btn.btnW ?? 160,
      height: btn.btnH ?? 40,
    }
  }

  _updateFightUrgency() {
    if (!this.fightBtn) return
    if (this.gold <= 0) this._startFightUrgency()
    else this._stopFightUrgency()
    this._updateRerollButtonState()
  }

  // Restore REROLL/accentDim once the player can afford a reroll again. The
  // out-of-credits click flips the button to a red "NO FUNDS" pill via spin —
  // this is the inverse, fired any time credits change so the button never
  // lies about its current affordability.
  _updateRerollButtonState() {
    const btn = this.rerollBtn
    if (!btn || btn._spinning) return
    btn.setAlpha(this._tutorialActive ? 0.5 : 1)
    if (this.gold >= 1 && btn.label !== 'REROLL') {
      console.log('[Shop] reroll button reset → REROLL (credits restored)')
      btn.btnBg = Theme.accentDim
      btn._redrawBg(Theme.accentDim)
      btn.setLabel('REROLL')
    }
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
    this._restackTeamAnchors()

    for (let slotIndex = 0; slotIndex < 5; slotIndex++) {
      const unit = this.teamSlots[slotIndex]
      const anchor = this._getTeamAnchor(slotIndex)

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

  // Briefly floats a rejection reason above a shop card, then self-destructs.
  _showRejectionHint(card, msg) {
    const label = new PixelLabel(this, card.x, card.y - 90, msg, {
      scale: 1, color: 'warning', align: 'center',
    })
    label.setDepth(20)
    label.setAlpha(0)
    this.tweens.add({
      targets: label,
      alpha: 1,
      duration: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          duration: 400,
          delay: 700,
          ease: 'Cubic.easeIn',
          onComplete: () => label.destroy(),
        })
      },
    })
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
        this._showRejectionHint(card, !creditsOk ? 'Need more credits' : 'Team full')
        return
      }
      _rejected = false
      SoundManager.dragPickup()
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
      SoundManager.dragInvalid()
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
      this._clearShopLock(shopIndex)
      occupant.stars = (occupant.stars ?? 1) + 1
      occupant.hp  += 1
      occupant.atk += 1
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      // Destroy the dragged shop card — it lives in _dragLayer now and would
      // otherwise float over the newly-drawn team card ("double vision").
      // _drawShopCards() rebuilds the shop row on the next reroll.
      this._dragLayer.remove(card, true)
      this.cards[shopIndex] = null
      const hostCard = this._teamCards[target]
      if (hostCard?.sprite) pulseLevelUp(this, hostCard.sprite)
      if (hostCard) pulseStarLevelUp(this, hostCard)
      hostCard?.playLevelUpWiggle?.()
      SoundManager.shopCombine()
      console.log(`[Shop] drop resolution=buy-combine source=shop from=${shopIndex} to=${target}`)
      console.log(`[Shop] vfx slot=${target} stars=${occupant.stars}`)
      logShopBuy({ scene: this, unit: warrior, cost: warrior.cost, creditsAfter: this.gold, starLevel: occupant.stars })
      logShopCombine({ scene: this, unit: occupant, fromSlot: -1, toSlot: target, hostSlotAfter: target, newStars: occupant.stars })
      this.events.emit('tutorial:bought')
      this.events.emit('tutorial:combined')

    } else if (!occupant) {
      // buy-empty
      this.gold -= warrior.cost
      this.goldLabel.setText(`CREDITS: ${this.gold}`)
      this._updateFightUrgency()
      this.shopOffer[shopIndex] = null
      this._clearShopLock(shopIndex)
      this.teamSlots[target] = { ...warrior, stars: warrior.stars ?? 1 }
      this._syncDenseTeamFromSlots()
      this._drawTeamRow()
      // Destroy the dragged shop card — see buy-combine note above.
      this._dragLayer.remove(card, true)
      this.cards[shopIndex] = null
      SoundManager.shopBuy()
      console.log(`[Shop] drop resolution=buy-empty source=shop from=${shopIndex} to=${target}`)
      logShopBuy({ scene: this, unit: warrior, cost: warrior.cost, creditsAfter: this.gold, starLevel: warrior.stars ?? 1 })
      this.events.emit('tutorial:bought')
      if (this._tutorialActive && this._hasUnmergedPairOnBench()) {
        const benchBounds = this._getBenchRowBounds()
        this._showTutorialHint('Drag them together to combine!', benchBounds
          ? { x: benchBounds.x + benchBounds.width / 2, y: benchBounds.y }
          : null)
      }

    } else {
      // reject-no-match
      this._returnShopCardHome(card)
      card.snapBack(Theme.error)
      console.log(`[Shop] drop resolution=reject-no-match source=shop from=${shopIndex} to=${target}`)
    }
  }

  // ── Team card drag ────────────────────────────────────────────────────────

  _bindTeamCardDrag(card, slotIndex) {
    card.hitZone.on('pointerover', () => {
      if (card._isHeld || card._isCelebrating) return
      this._restackTeamAnchors(slotIndex)
    })

    card.hitZone.on('pointerout', () => {
      if (card._isHeld) return
      this._restackTeamAnchors()
    })

    card.hitZone.on('dragstart', (pointer) => {
      if (this._sellInProgress) { card._sellBlocked = true; return }
      if (card._isCelebrating) { card._sellBlocked = true; return }
      card._sellBlocked = false
      this._restackTeamAnchors()
      SoundManager.dragPickup()
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
      SoundManager.shopCombine()
      console.log(`[Shop] drop resolution=combine source=team from=${fromSlot} to=${target}`)
      console.log(`[Shop] vfx slot=${target} stars=${occupant.stars}`)
      logShopCombine({ scene: this, unit: occupant, fromSlot, toSlot: target, hostSlotAfter: target, newStars: occupant.stars })
      this.events.emit('tutorial:combined')

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
    this._drawPillDoorHalf(this.leftDoor, 'left', W, H, R, Theme.accentDim)
    this.leftDoor.x = -W / 2
    this.sellAnchor.add(this.leftDoor)

    // Right door half — mirror of left, hinge at outer RIGHT edge.
    this.rightDoor = this.add.graphics()
    this._drawPillDoorHalf(this.rightDoor, 'right', W, H, R, Theme.accentDim)
    this.rightDoor.x = W / 2
    this.sellAnchor.add(this.rightDoor)

    // Face label — "SELL" sits on top of the closed pill, fades as doors open.
    // Scale 3 matches REROLL/FIGHT's PixelButton label rendering so the three
    // buttons read as a unified set. y=-10 centres a scale-3 glyph (21px) in
    // the 40-tall pill (label origin is top-left).
    this.sellFaceLabel = new PixelLabel(this, 0, -10, 'SELL', {
      scale: 3, color: 'critical', align: 'center',
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
    this.sellIdleHint = new PixelLabel(this, 0, H / 2 + 10, 'DRAG HERE TO SELL · 1c PER LEVEL', {
      scale: 1, color: 'muted', align: 'center',
    })
    this.sellAnchor.add(this.sellIdleHint)
  }

  /**
   * Pill-half graphics. Origin (0,0) sits at the outer hinge edge so scaleX → 0
   * collapses the half edge-on like a vault door. At rest (scaleX = 1) the two
   * halves tile seamlessly at the seam (parent x = 0) into a single 3D pill —
   * same rim/under/body/highlight/specular ramp as PixelButton's pill bump.
   *
   * Local geometry:
   *   'left'  — spans local x in [0, W/2]; outer cap at x = 0,    seam at x = W/2.
   *   'right' — spans local x in [-W/2, 0]; outer cap at x = 0,   seam at x = -W/2.
   *
   * Each layer is a rounded-rect scoped to the half, with corner radii set to 0
   * on the seam side so the two halves butt together without a visible seam.
   */
  _drawPillDoorHalf(gfx, side, W, H, R, color) {
    gfx.clear()
    const shades = pillShades(color)
    const halfW = W / 2

    const drawHalfLayer = (insetOuter, insetTop, insetBot, fill, customR) => {
      const r = customR ?? Math.max(1, R - insetOuter)
      const rw = halfW - insetOuter
      if (rw <= 0) return
      const ry = -H / 2 + insetTop
      const rh = H - insetTop - insetBot
      if (rh <= 0) return
      gfx.fillStyle(fill, 1)
      if (side === 'left') {
        // Cap on LEFT (local x = 0), seam on RIGHT (local x = halfW).
        gfx.fillRoundedRect(insetOuter, ry, rw, rh,
          { tl: r, bl: r, tr: 0, br: 0 })
      } else {
        // Cap on RIGHT (local x = 0), seam on LEFT (local x = -halfW).
        gfx.fillRoundedRect(-halfW, ry, rw, rh,
          { tl: 0, bl: 0, tr: r, br: r })
      }
    }

    // Layer 1 — outer rim, full half-pill (doubles as outline).
    drawHalfLayer(0, 0, 0, shades.rim)
    // Layer 2 — under-shadow, 4px shorter at bottom → exposes a 4px rim crescent.
    // Matches the taller arcade-pedestal geometry in drawPill3D (rest state).
    drawHalfLayer(1, 1, 4, shades.under)
    // Layer 3 — body cap, 3px shorter than under at bottom → exposes a 3px
    // under-shadow band. Total pedestal visible = 7px, matching REROLL/FIGHT.
    drawHalfLayer(1, 1, 7, shades.body)
    // Layer 4 — top highlight, shallow pill occupying the top ~45%.
    const hlInset = 4
    const hlH = Math.max(4, Math.floor(H * 0.45))
    const hlR = Math.min(Math.max(1, R - hlInset), Math.floor(hlH / 2))
    drawHalfLayer(hlInset, 2, H - 2 - hlH, shades.bright, hlR)
    // Layer 5 — 1px specular streak near the top.
    const specInset = Math.max(hlInset + 4, 10)
    const specW = halfW - specInset
    if (specW > 0) {
      gfx.fillStyle(shades.spec, 1)
      const specX = side === 'left' ? specInset : -halfW
      gfx.fillRect(specX, -H / 2 + 3, specW, 1)
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
    SoundManager.shopSell()
    this._endCardDrag(card)
    // Cancel any in-flight alpha tween from the hover-ghost so the fall tween
    // below owns the alpha channel outright.
    this.tweens.killTweensOf(card)

    const unit = this.teamSlots[fromSlot]
    const refund = Math.max(1, unit?.stars ?? 1)
    console.log(`[Shop] sellVault consume: slot=${fromSlot} unit=${unit?.id} stars=${unit?.stars ?? 1} refund=${refund}`)

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
          this.gold += refund
          this.goldLabel.setText(`CREDITS: ${this.gold}`)
          this._updateFightUrgency()
          this._drawTeamRow()
          this.tweens.killTweensOf(this.sellAnchor)
          this.tweens.add({ targets: this.sellAnchor, alpha: 0.9, duration: 200 })
          this._sellInProgress = false
          logShopSell({ scene: this, unit, refund, creditsAfter: this.gold })
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
    const refund = Math.max(1, warrior.stars ?? 1)
    console.log(`[Shop] _sellWarrior slot=${index} unit=${warrior.id} stars=${warrior.stars ?? 1} refund=${refund}`)
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
    if (this._rerollAnimating) return

    // Which slots actually refresh? Locked-with-card slots stay put; the rest
    // sweep+redeal. If every slot is either locked or already dealt and none
    // would change (pathological case: all 4 locked), refuse with a shake
    // rather than silently charging a credit.
    const slotsToRoll = [0, 1, 2, 3].filter(i => !(this.shopLocks[i] && this.shopOffer[i]))
    if (slotsToRoll.length === 0) {
      console.log('[Shop] reroll refused — all slots locked, nothing to refresh')
      return
    }

    this._rerollAnimating = true
    this.gold -= 1
    this.goldLabel.setText(`CREDITS: ${this.gold}`)
    this._updateFightUrgency()
    SoundManager.shopReroll()
    logShopReroll({ scene: this, cost: 1, creditsAfter: this.gold, rolled: null })
    console.log(`[Shop] reroll — refreshing slots [${slotsToRoll.join(',')}], preserving [${[0,1,2,3].filter(i => !slotsToRoll.includes(i)).join(',') || 'none'}]`)

    // Texas hold'em flop: old cards swept off toward the dealer (muck),
    // new cards tossed from the deck to each slot in succession.
    const OUT_DUR     = 160
    const OUT_STAGGER = 40
    const IN_DUR      = 180
    const IN_STAGGER  = 90
    const GAP         = 30

    // "Deck" origin — reroll button sits at LEFT_COL_X=90, y=360. We deal
    // from just above it so cards skim onto the shelf.
    const DECK_X = LEFT_COL_X - 20
    const DECK_Y = 340

    // Phase 1: sweep ONLY unlocked slot cards off toward the deck (muck).
    const outgoing = slotsToRoll
      .map(i => this.cards[i])
      .filter((c) => c && c.scene)
    outgoing.forEach((card, i) => {
      if (card.hitZone?.scene) card.hitZone.disableInteractive()
      card.setDepth(2)
      this.tweens.killTweensOf(card)
      this.tweens.add({
        targets: card,
        x: DECK_X,
        y: DECK_Y,
        angle: -18,
        alpha: 0,
        scaleX: 0.8, scaleY: 0.8,
        delay: i * OUT_STAGGER,
        duration: OUT_DUR,
        ease: 'Cubic.easeIn',
        onComplete: () => card.destroy(),
      })
    })

    const outTotal = outgoing.length
      ? (outgoing.length - 1) * OUT_STAGGER + OUT_DUR
      : 0

    this.time.delayedCall(outTotal + GAP, () => {
      // Phase 2: deal from the deck into the unlocked slots only. Preserve
      // the locked cards and their lock UI; reset the rest from a fresh roll.
      const fresh = this.shop.roll()
      slotsToRoll.forEach(i => {
        this.shopOffer[i] = fresh[i] ? { ...fresh[i] } : null
        this.cards[i] = null
      })
      let dealt = 0
      slotsToRoll.forEach(i => {
        const warrior = this.shopOffer[i]
        // Keep the lock UI visibility in sync with whether there's a card here.
        const lockToggle = this.lockToggles?.[i]
        if (lockToggle) lockToggle.setVisible(!!warrior)
        if (!warrior) return
        const x = SHOP_CARD_XS[i]
        const y = SHOP_Y

        const card = new WarriorCard(this, x, y, warrior, { draggable: true })
        LayoutEditor.register(this, `card_${i}`, card, x, y)
        card.captureRestPosition()
        // LayoutEditor overrides may have moved rest position — anchor the
        // tween target to that, not the hardcoded SHOP_CARD_XS/SHOP_Y.
        const restX = card.x
        const restY = card.y

        // Start at the deck with a slight in-flight tilt; depth=3 so the
        // flying card rides above already-dealt cards for a clean stack read.
        card.setDepth(3)
        card.x = DECK_X
        card.y = DECK_Y
        card.setAngle(-14)
        card.setAlpha(0.9)
        this.cards[i] = card
        this._bindShopCardDrag(card, i)

        // Suppress hover/drag until the card lands. WarriorCard.pointerover
        // calls killTweensOf(this), which would freeze the deal tween the
        // instant the cursor crossed an in-flight card — sticking it to the
        // pointer. Re-enable in onComplete.
        if (card.hitZone?.scene) card.hitZone.disableInteractive()

        const delay = dealt * IN_STAGGER
        this.time.delayedCall(delay, () => SoundManager.shopRerollCard())
        this.tweens.add({
          targets: card,
          x: restX,
          y: restY,
          angle: 0,
          alpha: 1,
          delay,
          duration: IN_DUR,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            card.setDepth(1)
            if (card.hitZone?.scene) {
              card.hitZone.setInteractive({ useHandCursor: true, draggable: true })
            }
          },
        })
        // Landing tap — quick scale punch as the card hits the felt.
        this.tweens.add({
          targets: card,
          scaleX: 1.05, scaleY: 1.05,
          delay: delay + IN_DUR - 30,
          duration: 70,
          ease: 'Sine.easeOut',
          yoyo: true,
        })
        dealt++
      })

      const inTotal = dealt
        ? (dealt - 1) * IN_STAGGER + IN_DUR
        : 0
      this.time.delayedCall(inTotal + 20, () => {
        this._rerollAnimating = false
        console.log('[Shop] reroll — deal animation complete')
      })

      logShopRound({ scene: this, rolled: this.shopOffer })
    })
  }

  _showUnspentCreditsConfirm() {
    if (this._unspentConfirmOpen) return
    this._unspentConfirmOpen = true

    const { width, height } = this.cameras.main
    const panelW = 440
    const panelH = 200
    const x = Math.round((width - panelW) / 2)
    const y = Math.round((height - panelH) / 2)
    const PAD = 14
    const DEPTH_DIM = 60
    const DEPTH_PANEL = 61
    const DEPTH_CONTENT = 62

    const objects = []

    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive()
    dim.setDepth(DEPTH_DIM)
    objects.push(dim)

    const panel = new PixelPanel(this, x, y, panelW, panelH, {
      bg: Theme.panelBg,
      border: Theme.warning,
    })
    panel.setDepth(DEPTH_PANEL)
    objects.push(panel)

    const title = new PixelLabel(this, width / 2, y + 14, 'UNSPENT CREDITS', {
      scale: 2, color: 'warning', align: 'center',
    })
    title.setDepth(DEPTH_CONTENT)
    objects.push(title)

    const body = new PixelLabel(
      this,
      x + PAD,
      y + 46,
      "Are you sure you want to fight with unspent credits? They will not be saved. It is optimal to reroll and see if there is a unit you should lock.",
      { scale: 1, color: 'primary' },
    )
    body.setLineSpacing(2)
    body.setMaxWidth(panelW - PAD * 2)
    body.setDepth(DEPTH_CONTENT)
    objects.push(body)

    const close = () => {
      this._unspentConfirmOpen = false
      objects.forEach((o) => {
        try { o.destroy() } catch (e) { console.error('[Shop] confirm cleanup:', e) }
      })
    }

    const fight = new PixelButton(this, width / 2 - 78, y + panelH - 28, 'FIGHT', () => {
      console.log('[Shop] Unspent-credits confirm — user chose FIGHT')
      close()
      this._startBattle({ confirmed: true })
    }, { style: 'filled', scale: 2, bg: Theme.error, width: 120, height: 30, cornerRadius: 4 })
    fight.setDepth(DEPTH_CONTENT)
    objects.push(fight)

    const back = new PixelButton(this, width / 2 + 78, y + panelH - 28, 'GO BACK', () => {
      console.log('[Shop] Unspent-credits confirm — user chose GO BACK')
      close()
    }, { style: 'filled', scale: 2, bg: Theme.accentDim, width: 120, height: 30, cornerRadius: 4 })
    back.setDepth(DEPTH_CONTENT)
    objects.push(back)
  }

  async _startBattle(opts = {}) {
    if (this.team.length === 0) return

    if (!opts.confirmed && this.tutorial && this.gold > 0) {
      console.log(`[Tutorial] FIGHT blocked — unspent credits=${this.gold}, prompting confirm`)
      this._showUnspentCreditsConfirm()
      return
    }

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
        tutorial: this.tutorial,
        shopLocks: this.shopLocks.slice(),
        shopOffer: this.shopLocks.some(Boolean) ? this.shopOffer : null,
      })
    } catch (e) {
      console.error('[Shop] Ghost matchmaking failed, using AI opponent:', e)
      const opponent = new BattleEngine().generateEnemyTeam(this.stage)
      this.scene.start('Battle', {
        stage: this.stage, wins: this.wins, losses: this.losses,
        team: this.team, runId: this.runId, commander: this.commander, merchant: this.merchant, opponent,
        tutorial: this.tutorial,
        shopLocks: this.shopLocks.slice(),
        shopOffer: this.shopLocks.some(Boolean) ? this.shopOffer : null,
      })
    }
  }
}
