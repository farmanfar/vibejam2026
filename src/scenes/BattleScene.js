import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelLabel, PixelHealthBar, FloatingBanner, PixelPanel,
} from '../ui/index.js'
import { BattleEngine } from '../systems/BattleEngine.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { ParallaxBackground } from '../rendering/ParallaxBackground.js'
import { pickRandomSets } from '../rendering/FactionPalettes.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { getUnitTextureKey } from '../rendering/UnitArt.js'
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js'

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
    this.commander = data.commander ?? null
    this.leftSet = data.leftSet ?? null
    this.rightSet = data.rightSet ?? null
    this.captureFreeze = data.captureFreeze === true
  }

  create() {
    console.log(`[Battle] Commander: ${this.commander?.name ?? 'none'}`)
    const { width, height } = this.cameras.main

    // CRT post-process (softGameplay — lighter curvature preserves pointer accuracy)
    SceneCrt.attach(this, 'softGameplay')

    // Native lighting (WebGL only) — dim warm-blue ambient, unit sprites lit individually
    if (this.sys.renderer.gl) {
      this.lights.enable().setAmbientColor(0x1a1a2e)
      console.log('[Battle] Lighting enabled — ambient 0x1a1a2e, maxLights 12')
    }

    const { left, right } = (this.leftSet && this.rightSet)
      ? { left: this.leftSet, right: this.rightSet }
      : pickRandomSets()

    this.parallax = new ParallaxBackground({
      scene: this, width, height: 360,
      leftSet: left, rightSet: right, scrollSpeed: 15,
    })
    this.parallax.create()

    this.add.bitmapText(4, 4, FONT_KEY, `L: ${left}`, 7)
      .setTint(0xffff00).setDepth(50).setAlpha(0.8)
    this.add.bitmapText(width - 4, 4, FONT_KEY, `R: ${right}`, 7)
      .setOrigin(1, 0).setTint(0xffff00).setDepth(50).setAlpha(0.8)

    const groundGfx = this.add.graphics()
    groundGfx.fillStyle(Theme.panelBg, 1)
    groundGfx.fillRect(0, 360, width, 180)
    groundGfx.lineStyle(1, Theme.panelBorder, 0.3)
    for (let x = 0; x < width; x += 32) groundGfx.lineBetween(x, 360, x, 540)
    for (let y = 360; y < 540; y += 32) groundGfx.lineBetween(0, y, width, y)
    groundGfx.setDepth(15)

    this.enemyTeam = this.opponent
    const battleDepth = 20

    const useLights = !!this.sys.renderer.gl

    this.playerSprites = this.team.map((w, i) => {
      const x = 100 + i * 80
      const y = 320
      const sprite = this.add.image(x, y, getUnitTextureKey(this, w, 'battle player'))
        .setScale(2.5)
        .setDepth(battleDepth)
      // Enable normal-map lighting on unit sprites only (not labels/health bars)
      if (useLights) sprite.setLighting(true)
      const light = useLights
        ? this.lights.addPointLight(x, y - 16, 0xffddaa, 90, 0.7)
        : null
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, { width: 50, height: 5 })
      hpBar.setDepth(battleDepth)
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7)
        .setOrigin(0.5)
        .setTint(Theme.accent)
        .setDepth(battleDepth)
      return { sprite, hpBar, name, light, warrior: { ...w, currentHp: w.hp } }
    })

    this.enemySprites = this.enemyTeam.map((w, i) => {
      const x = width - 100 - i * 80
      const y = 320
      const sprite = this.add.image(x, y, getUnitTextureKey(this, w, 'battle enemy'))
        .setScale(2.5)
        .setFlipX(true)
        .setDepth(battleDepth)
      if (useLights) sprite.setLighting(true)
      const light = useLights
        ? this.lights.addPointLight(x, y - 16, 0xffddaa, 90, 0.7)
        : null
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, {
        width: 50, height: 5, isEnemy: true,
      })
      hpBar.setDepth(battleDepth)
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7)
        .setOrigin(0.5)
        .setTint(Theme.error)
        .setDepth(battleDepth)
      return { sprite, hpBar, name, light, warrior: { ...w, currentHp: w.hp } }
    })

    const yourTeamLabel = new PixelLabel(this, 100, 240, 'YOUR TEAM', {
      scale: 2, color: 'accent', align: 'center',
    })
    yourTeamLabel.setDepth(battleDepth)
    LayoutEditor.register(this, 'yourTeamLabel', yourTeamLabel, 100, 240)

    const enemyLabel = new PixelLabel(this, width - 100, 240, 'ENEMY', {
      scale: 2, color: 'error', align: 'center',
    })
    enemyLabel.setDepth(battleDepth)
    LayoutEditor.register(this, 'enemyLabel', enemyLabel, width - 100, 240)

    const vsText = this.add.bitmapText(width / 2, 300, FONT_KEY, 'VS', 35)
      .setOrigin(0.5)
      .setTint(Theme.criticalText)
      .setDepth(battleDepth)
    LayoutEditor.register(this, 'vsText', vsText, width / 2, 300)

    this.logText = this.add.bitmapText(width / 2, 500, FONT_KEY, '', 14)
      .setOrigin(0.5)
      .setTint(Theme.mutedText)
      .setDepth(battleDepth)
    LayoutEditor.register(this, 'logText', this.logText, width / 2, 500)

    this.events.once('shutdown', () => {
      console.log('[Battle] Shutdown - cleaning up')
      LayoutEditor.unregisterScene('Battle')
    })

    console.log(`[Battle] Scene created - ${this.team.length} vs ${this.opponent.length}`)

    if (this.captureFreeze) {
      finalizeCaptureScene('Battle')
      return
    }

    FloatingBanner.show(this, `STAGE ${this.stage}`, {
      color: Theme.accent, hold: 600, scale: 6,
    }).then(() => this._runBattle())
  }

  update(time, delta) {
    if (this.captureFreeze) return
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
                if (s.light) { s.light.setActive(false); s.light.setVisible(false) }
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
                if (s.light) { s.light.setActive(false); s.light.setVisible(false) }
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
          // Champion flow — power-off transition to HallOfFame
          startSceneWithCrtPolicy(this, 'HallOfFame', {
            wins: newWins, losses: this.losses, team: this.team, runId: this.runId,
            commander: this.commander,
          })
          return
        }
        const survivors = this.team.filter((_, i) =>
          this.playerSprites[i].warrior.currentHp > 0
        )
        // Battle → Shop is immediate (no power-off)
        this.scene.start('Shop', {
          stage: this.stage + 1,
          gold: this.gold + goldEarned,
          wins: newWins,
          losses: this.losses,
          team: survivors,
          runId: this.runId,
          commander: this.commander,
        })
      } else {
        const newLosses = this.losses + 1
        if (newLosses >= 3) {
          // 3 losses — power-off transition to GameOver
          startSceneWithCrtPolicy(this, 'GameOver', { wins: this.wins, losses: newLosses, commander: this.commander })
          return
        }
        const survivors = this.team.filter((_, i) =>
          this.playerSprites[i].warrior.currentHp > 0
        )
        // Battle → Shop is immediate (no power-off)
        this.scene.start('Shop', {
          stage: this.stage + 1,
          gold: this.gold + goldEarned,
          wins: this.wins,
          losses: newLosses,
          team: survivors,
          runId: this.runId,
          commander: this.commander,
        })
      }
    })
  }
}
