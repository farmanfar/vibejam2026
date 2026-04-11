import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelButton, PixelLabel, PixelPanel, WarriorCard,
} from '../ui/index.js'
import { ShopManager } from '../systems/ShopManager.js'
import { GhostManager } from '../systems/GhostManager.js'
import { BattleEngine } from '../systems/BattleEngine.js'
import { WARRIORS } from '../config/warriors.js'

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
    this.team = data.team || []
    this.shop = new ShopManager(WARRIORS, this.stage)
    this.shopOffer = this.shop.roll()

    this.teamCountLabel = null
    this.goldLabel = null
    this.benchGroup = null
    this.cards = null
  }

  create() {
    const { width, height } = this.cameras.main

    const headerPanel = new PixelPanel(this, 0, 0, width, 32, {
      bg: Theme.panelBg, border: Theme.panelBorder,
    })

    new PixelLabel(this, 12, 8, `STAGE ${this.stage}`, { scale: 2, color: 'accent' })
    this.goldLabel = new PixelLabel(this, width / 2, 8, `GOLD: ${this.gold}`, {
      scale: 2, tint: Theme.warning, align: 'center',
    })
    new PixelLabel(this, width - 12, 8, `LIVES: ${3 - this.losses}`, {
      scale: 2, color: 'error', align: 'right',
    })

    this.add.image(width / 2, 72, 'merchant_placeholder').setScale(1.5)
    new PixelLabel(this, width / 2, 115, '"Choose your warriors wisely..."', {
      scale: 2, color: 'muted', align: 'center',
    })

    this.cardGroup = this.add.group()
    this._drawShopCards()

    new PixelPanel(this, 16, 340, width - 32, 100, { title: 'YOUR TEAM' })
    this._drawTeamBench()

    this.rerollBtn = new PixelButton(this, width / 2 - 130, 475, 'REROLL (1g)', () => {
      this._reroll()
    }, { style: 'filled', scale: 2, bg: Theme.accentDim, width: 140, height: 32 })

    this.fightBtn = new PixelButton(this, width / 2 + 130, 475, 'FIGHT!', () => {
      this._startBattle()
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 160, height: 40 })

    this.teamCountLabel = new PixelLabel(this, width / 2, 475, `${this.team.length}/5`, {
      scale: 2, color: 'muted', align: 'center',
    })
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
        const tier = w.tier ?? 0
        const sprite = this.add.image(x, y - 6, `warrior_placeholder_${tier}`).setScale(1.3)
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
      team: this.team, runId: this.runId,
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
        team: this.team, runId: this.runId, opponent,
      })
    } catch (_) {
      const opponent = new BattleEngine().generateEnemyTeam(this.stage)
      this.scene.start('Battle', {
        stage: this.stage, gold: this.gold, wins: this.wins, losses: this.losses,
        team: this.team, runId: this.runId, opponent,
      })
    }
  }
}
