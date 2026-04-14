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
import { getUnitPortraitRef } from '../rendering/UnitArt.js'
import { SceneCrt } from '../rendering/SceneCrt.js'

export class ShopScene extends Scene {
  constructor() {
    super('Shop')
  }

  init(data) {
    this.stage = data.stage || 1
    this.gold = data.gold || 10
    this.wins = data.wins || 0
    this.losses = data.losses || 0
    this.runId = data.runId
    this.commander = data.commander ?? null
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
  }

  create() {
    const { width, height } = this.cameras.main

    console.log(`[Shop] Creating shop scene — stage ${this.stage}, gold ${this.gold}, team size ${this.team.length}`)
    console.log(`[Shop] Commander: ${this.commander?.name ?? 'none'}`)

    // CRT post-process (softGameplay — interactive scene)
    SceneCrt.attach(this, 'softGameplay')

    const headerPanel = new PixelPanel(this, 0, 0, width, 32, {
      bg: Theme.panelBg, border: Theme.panelBorder,
    })
    LayoutEditor.register(this, 'headerPanel', headerPanel, 0, 0)

    const stageLabel = new PixelLabel(this, 12, 8, `STAGE ${this.stage}`, { scale: 2, color: 'accent' })
    LayoutEditor.register(this, 'stageLabel', stageLabel, 12, 8)

    this.goldLabel = new PixelLabel(this, width / 2, 8, `GOLD: ${this.gold}`, {
      scale: 2, tint: Theme.warning, align: 'center',
    })
    LayoutEditor.register(this, 'goldLabel', this.goldLabel, width / 2, 8)

    const livesLabel = new PixelLabel(this, width - 12, 8, `LIVES: ${3 - this.losses}`, {
      scale: 2, color: 'error', align: 'right',
    })
    LayoutEditor.register(this, 'livesLabel', livesLabel, width - 12, 8)

    const merchantKey = this.textures.exists('merchant') ? 'merchant' : 'merchant_placeholder'
    const merchant = this.add.image(width / 2, 72, merchantKey).setScale(1.5)
    LayoutEditor.register(this, 'merchant', merchant, width / 2, 72)

    const merchantQuote = new PixelLabel(this, width / 2, 115, '"Choose your warriors wisely..."', {
      scale: 2, color: 'muted', align: 'center',
    })
    LayoutEditor.register(this, 'merchantQuote', merchantQuote, width / 2, 115)

    this.cardGroup = this.add.group()
    this._drawShopCards()

    const teamPanel = new PixelPanel(this, 16, 340, width - 32, 100, { title: 'YOUR TEAM' })
    LayoutEditor.register(this, 'teamPanel', teamPanel, 16, 340)

    this._drawTeamBench()

    this.rerollBtn = new PixelButton(this, width / 2 - 130, 475, 'REROLL (1g)', () => {
      this._reroll()
    }, { style: 'filled', scale: 2, bg: Theme.accentDim, width: 140, height: 32 })
    LayoutEditor.register(this, 'rerollBtn', this.rerollBtn, width / 2 - 130, 475)

    this.fightBtn = new PixelButton(this, width / 2 + 130, 475, 'FIGHT!', () => {
      this._startBattle()
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 160, height: 40 })
    LayoutEditor.register(this, 'fightBtn', this.fightBtn, width / 2 + 130, 475)

    this.teamCountLabel = new PixelLabel(this, width / 2, 475, `${this.team.length}/5`, {
      scale: 2, color: 'muted', align: 'center',
    })
    LayoutEditor.register(this, 'teamCount', this.teamCountLabel, width / 2, 475)

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[Shop] Shutdown — cleaning up')
      LayoutEditor.unregisterScene('Shop')
    })

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
      this.cards.push(card)
    })
  }

  _drawTeamBench() {
    if (this.benchGroup) this.benchGroup.destroy(true)
    this.benchGroup = this.add.group()

    const startX = 50
    const y = 390

    for (let i = 0; i < 5; i++) {
      const x = startX + i * 72

      const slot = this.add.rectangle(x, y, 56, 56, Theme.screenBg)
        .setStrokeStyle(1, Theme.panelBorder)
      this.benchGroup.add(slot)

      if (this.team[i]) {
        const w = this.team[i]
        const ref = getUnitPortraitRef(this, w, 'shop bench')
        const sprite = this.add.image(x, y - 6, ref.key, ref.frame).setScale(1.3)
        const name = this.add.bitmapText(x, y + 22, FONT_KEY, w.name, 7 * 1)
          .setOrigin(0.5).setTint(Theme.primaryText)
        this.benchGroup.add(sprite)
        this.benchGroup.add(name)

        slot.setInteractive({ useHandCursor: true })
        slot.on('pointerdown', () => this._sellWarrior(i))
        slot.on('pointerover', () => slot.setStrokeStyle(1, Theme.error))
        slot.on('pointerout', () => slot.setStrokeStyle(1, Theme.panelBorder))
      }
    }

    if (this.teamCountLabel) {
      this.teamCountLabel.setText(`${this.team.length}/5`)
    }
  }

  _buyWarrior(index) {
    const warrior = this.shopOffer[index]
    if (!warrior) return
    if (this.gold < warrior.cost) return
    if (this.team.length >= 5) return

    this.gold -= warrior.cost
    this.team.push({ ...warrior })
    this.shopOffer[index] = null
    this.goldLabel.setText(`GOLD: ${this.gold}`)

    if (this.cards[index]) {
      this.cards[index].setDisabled()
    }

    this._drawTeamBench()
  }

  _sellWarrior(index) {
    const warrior = this.team[index]
    if (!warrior) return
    this.gold += 1
    this.team.splice(index, 1)
    this.goldLabel.setText(`GOLD: ${this.gold}`)
    this._drawTeamBench()
  }

  _reroll() {
    if (this.gold < 1) return
    this.gold -= 1
    this.shopOffer = this.shop.roll()
    this.scene.restart({
      stage: this.stage, gold: this.gold, wins: this.wins, losses: this.losses,
      team: this.team, runId: this.runId, commander: this.commander,
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
        stage: this.stage, gold: this.gold, wins: this.wins, losses: this.losses,
        team: this.team, runId: this.runId, commander: this.commander, opponent,
      })
    } catch (e) {
      console.error('[Shop] Ghost matchmaking failed, using AI opponent:', e)
      const opponent = new BattleEngine().generateEnemyTeam(this.stage)
      this.scene.start('Battle', {
        stage: this.stage, gold: this.gold, wins: this.wins, losses: this.losses,
        team: this.team, runId: this.runId, commander: this.commander, opponent,
      })
    }
  }
}
