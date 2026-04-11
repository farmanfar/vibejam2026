import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelLabel, PixelHealthBar, FloatingBanner, PixelPanel,
} from '../ui/index.js'
import { BattleEngine } from '../systems/BattleEngine.js'
import { ParallaxBackground } from '../rendering/ParallaxBackground.js'
import { pickRandomSets } from '../rendering/FactionPalettes.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { getUnitTextureKey } from '../rendering/UnitArt.js'

export class BattleScene extends Scene {
  constructor() {
    super('Battle')
  }

  init(data) {
    this.stage = data.stage || 1
    this.gold = data.gold || 10
    this.wins = data.wins || 0
    this.losses = data.losses || 0
    this.runId = data.runId
    this.team = data.team || []
    this.opponent = data.opponent || []
  }

  create() {
    const { width, height } = this.cameras.main

    // Split parallax backgrounds — two random PENUSBMIC sets
    const { left, right } = pickRandomSets()
    this.parallax = new ParallaxBackground({
      scene: this, width, height: 360,
      leftSet: left, rightSet: right, scrollSpeed: 15,
    })
    this.parallax.create()

    // Debug overlay: show which parallax sets are active
    this.add.bitmapText(4, 4, FONT_KEY, `L: ${left}`, 7 * 1)
      .setTint(0xffff00).setDepth(50).setAlpha(0.8)
    this.add.bitmapText(width - 4, 4, FONT_KEY, `R: ${right}`, 7 * 1)
      .setOrigin(1, 0).setTint(0xffff00).setDepth(50).setAlpha(0.8)

    // Ground + grid — separate Graphics object so depth doesn't conflict with parallax
    const groundGfx = this.add.graphics()
    groundGfx.fillStyle(Theme.panelBg, 1)
    groundGfx.fillRect(0, 360, width, 180)
    groundGfx.lineStyle(1, Theme.panelBorder, 0.3)
    for (let x = 0; x < width; x += 32) groundGfx.lineBetween(x, 360, x, 540)
    for (let y = 360; y < 540; y += 32) groundGfx.lineBetween(0, y, width, y)
    groundGfx.setDepth(15)

    this.enemyTeam = this.opponent

    // Battle content depth: above parallax (depth 1-10) and ground (depth 15)
    const BATTLE_DEPTH = 20

    this.playerSprites = this.team.map((w, i) => {
      const x = 100 + i * 80
      const y = 320
      const sprite = this.add.image(x, y, getUnitTextureKey(this, w, 'battle player')).setScale(2.5).setDepth(BATTLE_DEPTH)
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, { width: 50, height: 5 })
      hpBar.setDepth(BATTLE_DEPTH)
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7 * 1)
        .setOrigin(0.5).setTint(Theme.accent).setDepth(BATTLE_DEPTH)
      return { sprite, hpBar, name, warrior: { ...w, currentHp: w.hp } }
    })

    this.enemySprites = this.enemyTeam.map((w, i) => {
      const x = width - 100 - i * 80
      const y = 320
      const sprite = this.add.image(x, y, getUnitTextureKey(this, w, 'battle enemy'))
        .setScale(2.5).setFlipX(true).setDepth(BATTLE_DEPTH)
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, {
        width: 50, height: 5, isEnemy: true,
      })
      hpBar.setDepth(BATTLE_DEPTH)
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7 * 1)
        .setOrigin(0.5).setTint(Theme.error).setDepth(BATTLE_DEPTH)
      return { sprite, hpBar, name, warrior: { ...w, currentHp: w.hp } }
    })

    const yourTeamLabel = new PixelLabel(this, 100, 240, 'YOUR TEAM', { scale: 2, color: 'accent', align: 'center' })
    yourTeamLabel.setDepth(BATTLE_DEPTH)
    LayoutEditor.register(this, 'yourTeamLabel', yourTeamLabel, 100, 240)

    const enemyLabel = new PixelLabel(this, width - 100, 240, 'ENEMY', { scale: 2, color: 'error', align: 'center' })
    enemyLabel.setDepth(BATTLE_DEPTH)
    LayoutEditor.register(this, 'enemyLabel', enemyLabel, width - 100, 240)

    const vsText = this.add.bitmapText(width / 2, 300, FONT_KEY, 'VS', 7 * 5)
      .setOrigin(0.5).setTint(Theme.criticalText).setDepth(BATTLE_DEPTH)
    LayoutEditor.register(this, 'vsText', vsText, width / 2, 300)

    this.logText = this.add.bitmapText(width / 2, 500, FONT_KEY, '', 7 * 2)
      .setOrigin(0.5).setTint(Theme.mutedText).setDepth(BATTLE_DEPTH)
    LayoutEditor.register(this, 'logText', this.logText, width / 2, 500)

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[Battle] Shutdown — cleaning up')
      LayoutEditor.unregisterScene('Battle')
    })

    console.log(`[Battle] Scene created — ${this.team.length} vs ${this.opponent.length}`)

    FloatingBanner.show(this, `STAGE ${this.stage}`, {
      color: Theme.accent, hold: 600, scale: 6,
    }).then(() => this._runBattle())
  }

  update(time, delta) {
    if (this.parallax) this.parallax.update(time, delta)
  }

  _runBattle() {
    const engine = new BattleEngine()
    const result = engine.resolve(
      this.playerSprites.map(s => s.warrior),
      this.enemySprites.map(s => s.warrior),
    )

    let stepIndex = 0
    const stepTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        if (stepIndex >= result.log.length) {
          stepTimer.remove()
          this.time.delayedCall(800, () => this._endBattle(result.won))
          return
        }

        const step = result.log[stepIndex]
        this.logText.setText(step.message)

        if (step.playerHp) {
          this.playerSprites.forEach((s, i) => {
            if (step.playerHp[i] !== undefined) {
              s.warrior.currentHp = step.playerHp[i]
              s.hpBar.setHp(s.warrior.currentHp)
              if (s.warrior.currentHp <= 0) {
                s.sprite.setAlpha(0.2)
                s.name.setAlpha(0.3)
              }
            }
          })
        }

        if (step.enemyHp) {
          this.enemySprites.forEach((s, i) => {
            if (step.enemyHp[i] !== undefined) {
              s.warrior.currentHp = step.enemyHp[i]
              s.hpBar.setHp(s.warrior.currentHp)
              if (s.warrior.currentHp <= 0) {
                s.sprite.setAlpha(0.2)
                s.name.setAlpha(0.3)
              }
            }
          })
        }

        this.cameras.main.shake(80, 0.004)
        stepIndex++
      },
      loop: true,
    })
  }

  _endBattle(won) {
    const goldEarned = won ? 3 + this.stage : 2

    const bannerText = won ? 'VICTORY!' : 'DEFEAT'
    const bannerColor = won ? Theme.success : Theme.error
    const subtitle = `+${goldEarned} gold`

    FloatingBanner.show(this, bannerText, {
      color: bannerColor, subtitle, hold: 1500,
    }).then(() => {
      if (won) {
        const newWins = this.wins + 1
        if (newWins === 9) {
          this.scene.start('HallOfFame', {
            wins: newWins, losses: this.losses, team: this.team, runId: this.runId,
          })
          return
        }
        const survivors = this.team.filter((_, i) =>
          this.playerSprites[i].warrior.currentHp > 0
        )
        this.scene.start('Shop', {
          stage: this.stage + 1,
          gold: this.gold + goldEarned,
          wins: newWins,
          losses: this.losses,
          team: survivors,
          runId: this.runId,
        })
      } else {
        const newLosses = this.losses + 1
        if (newLosses >= 3) {
          this.scene.start('GameOver', { wins: this.wins, losses: newLosses })
          return
        }
        const survivors = this.team.filter((_, i) =>
          this.playerSprites[i].warrior.currentHp > 0
        )
        this.scene.start('Shop', {
          stage: this.stage + 1,
          gold: this.gold + goldEarned,
          wins: this.wins,
          losses: newLosses,
          team: survivors,
          runId: this.runId,
        })
      }
    })
  }
}
