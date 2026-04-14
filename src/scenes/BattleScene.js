import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelLabel, PixelHealthBar, FloatingBanner, PixelPanel,
} from '../ui/index.js'
import { runAlphaBattle } from '../systems/combat/BattleSceneAdapter.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { ParallaxBackground } from '../rendering/ParallaxBackground.js'
import { pickRandomSets } from '../rendering/FactionPalettes.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { getUnitPortraitRef } from '../rendering/UnitArt.js'
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
      const x = 100 + (this.team.length - 1 - i) * 80
      const y = 320
      const ref = getUnitPortraitRef(this, w, 'battle player')
      const scale = w.art?.displayScale ?? 2.5
      const sprite = this.add.sprite(x, y, ref.key, ref.frame)
        .setScale(scale)
        .setDepth(battleDepth)
      // Enable normal-map lighting on unit sprites only (not labels/health bars)
      if (useLights) sprite.setLighting(true)
      this._wireAlphaAnimations(sprite, w, 'player')
      const light = useLights
        ? this.lights.addPointLight(x, y - 16, 0xffddaa, 90, 0.7)
        : null
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, { width: 50, height: 5 })
      hpBar.setDepth(battleDepth)
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7)
        .setOrigin(0.5)
        .setTint(Theme.accent)
        .setDepth(battleDepth)
      return {
        sprite, hpBar, name, light,
        warrior: { ...w, currentHp: w.hp },
        instanceId: `p${i}`,
      }
    })

    this.enemySprites = this.enemyTeam.map((w, i) => {
      const x = width - 100 - (this.enemyTeam.length - 1 - i) * 80
      const y = 320
      const ref = getUnitPortraitRef(this, w, 'battle enemy')
      const scale = w.art?.displayScale ?? 2.5
      const sprite = this.add.sprite(x, y, ref.key, ref.frame)
        .setScale(scale)
        .setFlipX(true)
        .setDepth(battleDepth)
      if (useLights) sprite.setLighting(true)
      this._wireAlphaAnimations(sprite, w, 'enemy')
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
      return {
        sprite, hpBar, name, light,
        warrior: { ...w, currentHp: w.hp },
        instanceId: `e${i}`,
      }
    })

    // Sprite lookup by stable instance id — adapter emits *InstanceId on
    // every relevant log step, so compaction / death-defy / reanimate no
    // longer desync the visual layer from the logical one.
    this.spriteByInstance = new Map()
    this.playerSprites.forEach((s) => this.spriteByInstance.set(s.instanceId, s))
    this.enemySprites.forEach((s) => this.spriteByInstance.set(s.instanceId, s))
    this._activePopupsByTarget = new Map()

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

  _wireAlphaAnimations(sprite, warrior, side) {
    if (!warrior?.hasPortrait || !warrior.spriteKey) return
    try {
      // Passing `sprite` as 3rd arg routes createFromAseprite to the sprite's
      // LOCAL anim manager — avoids global tag-name collisions across units.
      this.anims.createFromAseprite(warrior.spriteKey, null, sprite)
      const defaultTag = warrior.art?.defaultTag ?? 'idle'
      if (sprite.anims && sprite.anims.exists(defaultTag)) {
        sprite.anims.play({ key: defaultTag, repeat: -1 })
        console.log(`[Battle] ${side} ${warrior.id} playing '${defaultTag}' (${warrior.art?.tags?.length ?? 0} tags available)`)
      } else {
        console.warn(`[Battle] ${side} ${warrior.id}: default tag '${defaultTag}' missing on sprite anim manager`)
      }
    } catch (err) {
      console.error(`[Battle] Failed to wire anims for ${warrior.id}:`, err)
    }
  }

  _playActorAnim(instanceId, tag) {
    if (!instanceId) return
    const entry = this.spriteByInstance?.get(instanceId)
    if (!entry || !entry.sprite?.anims) return
    const warrior = entry.warrior
    if (!warrior?.hasPortrait) return
    if (warrior.currentHp <= 0 && tag !== 'death') return
    const defaultTag = warrior.art?.defaultTag ?? 'idle'
    // Resolve semantic tag → actual Aseprite tag name via per-unit overrides.
    const overrides = warrior.art?.animTagOverrides ?? {}
    const resolvedTag = overrides[tag] ?? tag
    const resolvedAttack = overrides['attack'] ?? 'attack'
    const targetTag = entry.sprite.anims.exists(resolvedTag)
      ? resolvedTag
      : (tag === 'special attack' && entry.sprite.anims.exists(resolvedAttack))
        ? resolvedAttack
        : null
    if (!targetTag) return
    entry.sprite.anims.play({ key: targetTag, repeat: 0 })
    if (targetTag !== 'death') {
      entry.sprite.once('animationcomplete', () => {
        if (entry.warrior.currentHp > 0 && entry.sprite.anims.exists(defaultTag)) {
          entry.sprite.anims.play({ key: defaultTag, repeat: -1 })
        }
      })
    }
  }

  _showDamagePopup(targetInstanceId, damage, blocked) {
    const entry = this.spriteByInstance?.get(targetInstanceId)
    if (!entry?.sprite) {
      console.warn(`[Battle] Damage popup: no sprite for instanceId=${targetInstanceId}`)
      return
    }

    console.log(`[Battle] Damage popup: instanceId=${targetInstanceId} dmg=${damage} blocked=${blocked}`)

    const slot = this._activePopupsByTarget.get(targetInstanceId) ?? 0
    this._activePopupsByTarget.set(targetInstanceId, slot + 1)

    const jitterX = ((slot % 3) - 1) * 10
    const startX = entry.sprite.x + jitterX
    const startY = entry.sprite.y - 30

    const text = blocked ? 'BLOCK' : `${damage}`
    const tint = blocked ? Theme.mutedText : Theme.warning
    const fontSize = 16

    const label = this.add.bitmapText(startX, startY, FONT_KEY, text, fontSize)
      .setOrigin(0.5, 1)
      .setTint(tint)
      .setDepth(1000)
      .setAlpha(0)

    this.tweens.add({
      targets: label,
      alpha: 1,
      duration: 80,
      ease: 'Linear',
    })
    this.tweens.add({
      targets: label,
      y: startY - 24,
      alpha: 0,
      duration: 370,
      delay: 80,
      ease: 'Cubic.Out',
      onComplete: () => {
        label.destroy()
        const remaining = (this._activePopupsByTarget.get(targetInstanceId) ?? 1) - 1
        if (remaining <= 0) {
          this._activePopupsByTarget.delete(targetInstanceId)
        } else {
          this._activePopupsByTarget.set(targetInstanceId, remaining)
        }
      },
    })
  }

  _runBattle() {
    const result = runAlphaBattle(
      this.playerSprites.map(s => s.warrior),
      this.enemySprites.map(s => s.warrior),
    )
    console.log(`[Battle] engine=alpha, ${result.log.length} steps, won=${result.won}`)

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
        this.logText.setText(step.message ?? '')
        console.log(`[Battle] step ${stepIndex}: ${step.message ?? ''}${step.actorInstanceId ? ` actor=${step.actorInstanceId}` : ''}${step.targetInstanceId ? ` target=${step.targetInstanceId}` : ''}${step.animTag ? ` anim=${step.animTag}` : ''}`)

        // Per-step actor/target animations — only plays on sprites with a
        // real aseprite atlas; placeholders silently skip.
        if (step.animTag === 'attack' && step.actorInstanceId) {
          this._playActorAnim(step.actorInstanceId, 'attack')
        } else if (step.animTag === 'death' && step.targetInstanceId) {
          this._playActorAnim(step.targetInstanceId, 'death')
        }

        if (step.animTag === 'attack' && step.targetInstanceId && typeof step.damage === 'number') {
          this._showDamagePopup(step.targetInstanceId, step.damage, step.blocked === true)
        }

        // HP bars follow shadow HP directly. Sprite dimming is decoupled
        // from HP — between a lethal blow and faint_final, a unit may be
        // saved by Death-Defy or Monster reanimate. Visual death only
        // commits when the adapter emits `diedInstanceId`.
        if (step.playerHp) {
          this.playerSprites.forEach((s, i) => {
            if (step.playerHp[i] !== undefined) {
              s.warrior.currentHp = step.playerHp[i]
              s.hpBar.setHp(s.warrior.currentHp)
            }
          })
        }

        if (step.enemyHp) {
          this.enemySprites.forEach((s, i) => {
            if (step.enemyHp[i] !== undefined) {
              s.warrior.currentHp = step.enemyHp[i]
              s.hpBar.setHp(s.warrior.currentHp)
            }
          })
        }

        if (step.diedInstanceId) {
          const died = this.spriteByInstance?.get(step.diedInstanceId)
          if (died) {
            died.sprite.setAlpha(0.2)
            died.name.setAlpha(0.3)
            if (died.light) {
              died.light.setActive(false)
              died.light.setVisible(false)
            }
            console.log(`[Battle] committed death: ${step.diedInstanceId}`)
          }
        }

        // Defensive revive path. In the current model the adapter never
        // dims a sprite before a revive (death only commits at faint_final),
        // so this branch is a no-op for Death-Defy / Monster reanimate.
        // It exists so any future post-commit resurrection or mid-battle
        // revive mechanic doesn't leave the sprite stuck at 20% alpha.
        if (step.revivedInstanceId) {
          const revived = this.spriteByInstance?.get(step.revivedInstanceId)
          if (revived) {
            revived.sprite.setAlpha(1)
            revived.name.setAlpha(1)
            if (revived.light) {
              revived.light.setActive(true)
              revived.light.setVisible(true)
            }
            const defaultTag = revived.warrior.art?.defaultTag ?? 'idle'
            if (revived.warrior.hasPortrait
              && revived.sprite.anims?.exists?.(defaultTag)) {
              revived.sprite.anims.play({ key: defaultTag, repeat: -1 })
            }
            console.log(`[Battle] revived: ${step.revivedInstanceId}`)
          }
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
