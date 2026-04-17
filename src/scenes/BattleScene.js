import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelLabel, FloatingBanner, PixelPanel, UnitStatBadge,
} from '../ui/index.js'
import { runAlphaBattle } from '../systems/combat/BattleSceneAdapter.js'
import { logBattle } from '../systems/PlaytestLogger.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { ParallaxBackground } from '../rendering/ParallaxBackground.js'
import { pickRandomSets } from '../rendering/FactionPalettes.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { getUnitPortraitRef } from '../rendering/UnitArt.js'
import { getAsepriteTagConfigs } from '../rendering/AsepriteAnimations.js'
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js'
import { attachOutlineToSprite } from '../rendering/OutlineController.js'
import { fitSpriteToPortraitBounds } from '../rendering/SpriteFit.js'

// Minimum on-screen height (in display px) for battle-sprite characters.
// PENUSBMIC atlases vary wildly in how much of the 192x192 frame is actually
// character pixels — some units (dagger_mush, electrocutioner) have 18-24px
// tight bounds, so the shared displayScale=2.5 paints them at 45-60px while
// a normal unit renders at 150-200px. This floor ensures small characters
// stay readable in the lineup without shrinking larger ones.
const MIN_BATTLE_SPRITE_H = 72

const FLOAT_TEXT_STYLES = {
  damage: { color: Theme.error, fontSize: 36, prefix: '-' },
  block: { color: Theme.mutedText, fontSize: 28, defaultText: 'BLOCK' },
  heal: { color: Theme.success, fontSize: 32 },
  buff: { color: Theme.warning, fontSize: 28 },
  debuff: { color: 0xc678dd, fontSize: 28 },
  poison: { color: 0xc678dd, fontSize: 28 },
  armor: { color: Theme.accent, fontSize: 28, defaultText: 'ARMORED' },
  resonance: { color: Theme.fantasyGoldBright, fontSize: 28 },
}

export class BattleScene extends Scene {
  constructor() {
    super('Battle')
  }

  init(data) {
    this.stage = data.stage || 1
    this.wins = data.wins || 0
    this.losses = data.losses || 0
    this.runId = data.runId
    this.team = data.team || []
    this.opponent = data.opponent || []
    this.commander = data.commander ?? null
    this.merchant = data.merchant ?? null
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
      this.lights.enable().setAmbientColor(0xffffff)
      console.log('[Battle] Lighting enabled — ambient 0xffffff (full bright), maxLights 12')
    }

    const { left, right } = (this.leftSet && this.rightSet)
      ? { left: this.leftSet, right: this.rightSet }
      : pickRandomSets()

    this.parallax = new ParallaxBackground({
      scene: this, width, height: 360,
      leftSet: left, rightSet: right, scrollSpeed: 3.375,
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

    // Front units plant ~one sprite-length (96px) from the center line so
    // the SAP clash actually has room to breathe. Whole team shifts inward
    // 124px compared to the old formula. `i=0` is the frontmost unit on
    // both sides — keep this invariant consistent with _reflowTeam below.
    const centerX = width / 2
    this._frontOffset = 96
    this._slotSpacing = 80

    this.playerSprites = this.team.map((w, i) => {
      const x = centerX - this._frontOffset - i * this._slotSpacing
      const y = 320
      const ref = getUnitPortraitRef(this, w, 'battle player')
      const scale = w.art?.displayScale ?? 2.5
      const sprite = this.add.sprite(x, y, ref.key, ref.frame)
        .setScale(scale)
        .setDepth(battleDepth)
      this._adjustBattleSprite(sprite, w, ref, 'player')
      // Enable normal-map lighting on unit sprites only (not labels/health bars)
      if (useLights) sprite.setLighting(true)
      attachOutlineToSprite(sprite)
      this._wireAlphaAnimations(sprite, w, 'player')
      const light = useLights
        ? this.lights.addPointLight(x, y - 16, 0xffddaa, 90, 0.7)
        : null
      const badge = new UnitStatBadge(this, x, y + 55, {
        atk: w.atk,
        hp: w.hp,
      })
      badge.setDepth(battleDepth)
      return {
        sprite, badge, light,
        warrior: { ...w, currentHp: w.hp },
        instanceId: `p${i}`,
      }
    })

    this.enemySprites = this.enemyTeam.map((w, i) => {
      const x = centerX + this._frontOffset + i * this._slotSpacing
      const y = 320
      const ref = getUnitPortraitRef(this, w, 'battle enemy')
      const scale = w.art?.displayScale ?? 2.5
      const sprite = this.add.sprite(x, y, ref.key, ref.frame)
        .setScale(scale)
        .setFlipX(true)
        .setDepth(battleDepth)
      this._adjustBattleSprite(sprite, w, ref, 'enemy')
      if (useLights) sprite.setLighting(true)
      attachOutlineToSprite(sprite)
      this._wireAlphaAnimations(sprite, w, 'enemy')
      const light = useLights
        ? this.lights.addPointLight(x, y - 16, 0xffddaa, 90, 0.7)
        : null
      const badge = new UnitStatBadge(this, x, y + 55, {
        atk: w.atk,
        hp: w.hp,
        isEnemy: true,
      })
      badge.setDepth(battleDepth)
      return {
        sprite, badge, light,
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

    // Scrollable event log — mirrors HammerTime/UI/GameLog.cs style:
    // uppercase entries, muted tint, small m5x7 text, header + divider,
    // mouse-wheel scrollback with a scrollbar thumb.
    this._logHistory = []
    this._logScrollOffset = 0 // lines from bottom (0 = pinned to newest)

    const logBoxW = 900
    const logBoxH = 100
    const logBoxX = width / 2 - logBoxW / 2
    const logBoxY = 430
    const logPad = 6
    const logHeaderH = 16
    const logDivY = logBoxY + 2 + logHeaderH
    const logTextY = logDivY + 2
    const logTextH = logBoxY + logBoxH - logTextY - 2

    const logBg = this.add.graphics()
    logBg.fillStyle(Theme.panelBg, 0.82)
    logBg.fillRect(logBoxX, logBoxY, logBoxW, logBoxH)
    logBg.lineStyle(1, Theme.panelBorder, 0.4)
    logBg.strokeRect(logBoxX, logBoxY, logBoxW, logBoxH)
    logBg.lineStyle(1, Theme.panelBorder, 0.5)
    logBg.lineBetween(logBoxX + 2, logDivY, logBoxX + logBoxW - 2, logDivY)
    logBg.setDepth(battleDepth - 1)

    this.add.bitmapText(logBoxX + logPad, logBoxY + 2, FONT_KEY, 'EVENT LOG', 14)
      .setTint(Theme.mutedText)
      .setAlpha(0.55)
      .setDepth(battleDepth)

    this.logText = this.add.bitmapText(logBoxX + logPad, logTextY, FONT_KEY, '', 14)
      .setOrigin(0, 0)
      .setTint(Theme.mutedText)
      .setDepth(battleDepth)
      .setAlpha(0.9)

    // Measure actual glyph advance from the bitmap font rather than trusting
    // a hardcoded charW — Phaser's RetroFont advance depends on CELL_W vs
    // GLYPH_H ratio in a way that doesn't always match PixelFont.measure().
    // Using getTextBounds on a probe string is authoritative.
    let measuredCharW = 12
    let measuredLineH = 16
    try {
      this.logText.setText('MMMMMMMMMMMMMMMM')
      const b = this.logText.getTextBounds(false).local
      if (b.width > 0) measuredCharW = b.width / 16
      if (b.height > 0) measuredLineH = b.height
      this.logText.setText('')
      console.log(`[Battle] log font measured charW=${measuredCharW.toFixed(2)} lineH=${measuredLineH.toFixed(2)}`)
    } catch (e) {
      console.error('[Battle] log font measurement failed, using fallback:', e)
    }

    this._logScrollbar = this.add.graphics().setDepth(battleDepth + 1)
    this._logLayout = {
      x: logBoxX, y: logBoxY, w: logBoxW, h: logBoxH,
      pad: logPad, textY: logTextY, textH: logTextH,
      charW: measuredCharW, lineH: Math.max(measuredLineH, 14) + 2,
    }

    this.input.on('wheel', (pointer, _objs, _dx, dy) => {
      const L = this._logLayout
      if (!L) return
      if (pointer.x < L.x || pointer.x > L.x + L.w) return
      if (pointer.y < L.y || pointer.y > L.y + L.h) return
      if (dy < 0) this._logScrollOffset += 2
      else if (dy > 0) this._logScrollOffset = Math.max(0, this._logScrollOffset - 2)
      this._renderLog()
    })

    LayoutEditor.register(this, 'logText', this.logText, logBoxX + logPad, logTextY)

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

  // Re-center the battle sprite on the character's actual pixels and floor
  // tiny atlases to MIN_BATTLE_SPRITE_H so they aren't dwarfed by units
  // whose character art happens to fill more of the 192x192 frame.
  //
  // Why this is needed: PENUSBMIC atlases pack characters at wildly different
  // sizes and positions inside each frame. dagger_mush lives at (39,72) with
  // tight bounds 24x24 — with default origin (0.5, 0.5) the visible character
  // lands ~112px left and 30px above the sprite's (x,y), so the name label,
  // stat badge, and point light (all placed at x,y) end up nowhere near it.
  // Shifting origin to the tight-bounds center puts the character back under
  // its UI, the same trick WarriorCard already uses for shop portraits.
  _adjustBattleSprite(sprite, warrior, ref, side) {
    // Enemy sprites get setFlipX(true) before this call — flipXInvert tells
    // the helper to mirror the origin.x so the anchor lands on the mirrored
    // character instead of the empty right half of the flipped frame.
    fitSpriteToPortraitBounds(this, sprite, ref, {
      configScale: warrior.art?.displayScale ?? 2.5,
      minHeightPx: MIN_BATTLE_SPRITE_H,
      flipXInvert: true,
      logTag: '[Battle]',
      warriorId: warrior.id,
      side,
    })
  }

  _wireAlphaAnimations(sprite, warrior, side) {
    if (!warrior?.hasPortrait || !warrior.spriteKey) return
    try {
      const asepriteData = this.cache.json.get(warrior.spriteKey)
      const configs = getAsepriteTagConfigs(warrior.spriteKey, asepriteData)
      if (configs.length > 0) {
        configs.forEach((config) => sprite.anims.create(config))
      } else {
        // Fallback for atlases whose cached data is missing or malformed.
        // Passing `sprite` as 3rd arg routes createFromAseprite to the
        // sprite's LOCAL anim manager — avoids global tag-name collisions.
        this.anims.createFromAseprite(warrior.spriteKey, null, sprite)
      }
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
    if (!instanceId) return null
    const entry = this.spriteByInstance?.get(instanceId)
    if (!entry || !entry.sprite?.anims) return null
    const warrior = entry.warrior
    if (!warrior?.hasPortrait) return null
    if (warrior.currentHp <= 0 && tag !== 'death') return null
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
    if (!targetTag) return null
    entry.sprite.anims.play({ key: targetTag, repeat: 0 })
    if (tag !== 'death') {
      entry.sprite.once('animationcomplete', () => {
        if (entry.warrior.currentHp > 0 && entry.sprite.anims.exists(defaultTag)) {
          entry.sprite.anims.play({ key: defaultTag, repeat: -1 })
        }
      })
    }
    return targetTag
  }

  _reflowTeam(side) {
    const all = side === 'player' ? this.playerSprites : this.enemySprites
    const survivors = all.filter(s => !s.died)
    const width = this.scale.width
    const centerX = width / 2
    const frontOffset = this._frontOffset ?? 96
    const spacing = this._slotSpacing ?? 80
    const positions = []
    survivors.forEach((s, i) => {
      // i=0 is the frontmost survivor. Mirror the create()-time formula
      // so reflow lands on the same positions a fresh layout would.
      const newX = side === 'player'
        ? centerX - frontOffset - i * spacing
        : centerX + frontOffset + i * spacing
      positions.push(newX)
      const targets = [s.sprite, s.badge, s.light].filter(Boolean)
      if (targets.length === 0) return
      this.tweens.add({
        targets,
        x: newX,
        duration: 400,
        ease: 'Cubic.Out',
      })
    })
    console.log(`[Battle] Reflowed ${side} team: ${survivors.length} survivors at [${positions.join(', ')}]`)
  }

  _showFloatText(targetInstanceId, text, style, posOverride) {
    // posOverride lets the clash/solo choreography pop numbers at a fixed
    // world point (mid-screen strike point) instead of above the target's
    // head. When omitted we preserve the original above-head behaviour.
    const entry = this.spriteByInstance?.get(targetInstanceId)
    if (!posOverride && !entry?.sprite) {
      console.warn(`[Battle] Float text: no sprite for instanceId=${targetInstanceId}`)
      return
    }

    const config = FLOAT_TEXT_STYLES[style] ?? FLOAT_TEXT_STYLES.damage
    const baseText = config.defaultText ?? text ?? ''
    const slotKey = targetInstanceId ?? `${style}:${baseText}`
    const rawText = `${baseText}`
    const resolvedText = config.prefix && /^[+-]?\d+$/.test(rawText)
      ? `${config.prefix}${rawText.replace(/^[+-]/, '')}`
      : rawText

    console.log(`[Battle] float text: instanceId=${targetInstanceId ?? 'NONE'} style=${style} text=${resolvedText}${posOverride ? ` override=(${posOverride.x},${posOverride.y})` : ''}`)

    const slot = this._activePopupsByTarget.get(slotKey) ?? 0
    this._activePopupsByTarget.set(slotKey, slot + 1)

    const jitterX = ((slot % 3) - 1) * 10
    const startX = posOverride ? (posOverride.x + jitterX) : (entry.sprite.x + jitterX)
    const startY = posOverride ? posOverride.y : (entry.sprite.y + 70)

    const label = this.add.bitmapText(startX, startY, FONT_KEY, resolvedText, config.fontSize)
      .setOrigin(0.5, 1)
      .setTint(config.color)
      .setDepth(1000)
      .setAlpha(0)
      .setScale(0.4)

    this.tweens.add({
      targets: label,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 140,
      ease: 'Back.Out',
    })
    this.tweens.add({
      targets: label,
      y: startY + 30,
      alpha: 0,
      duration: 420,
      delay: 70,
      ease: 'Cubic.Out',
      onComplete: () => {
        label.destroy()
        const remaining = (this._activePopupsByTarget.get(slotKey) ?? 1) - 1
        if (remaining <= 0) {
          this._activePopupsByTarget.delete(slotKey)
        } else {
          this._activePopupsByTarget.set(slotKey, remaining)
        }
      },
    })
  }

  _runBattle() {
    const playerDefs = this.playerSprites.map(s => s.warrior)
    const enemyDefs = this.enemySprites.map(s => s.warrior)
    const result = runAlphaBattle(playerDefs, enemyDefs)
    console.log(`[Battle] engine=alpha, ${result.log.length} steps, won=${result.won}`)

    this._battleResult = result
    logBattle({ scene: this, result, playerTeam: playerDefs, enemyTeam: enemyDefs })
    const frames = this._buildVisualScript(result.log)
    this._runFrames(frames)
  }

  _addLogEntry(msg) {
    if (!msg) return
    this._logHistory.push(String(msg).toUpperCase())
    if (this._logHistory.length > 200) this._logHistory.shift()
    this._logScrollOffset = 0 // auto-scroll to bottom on new entry
    this._renderLog()
  }

  _wrapLogLine(text, maxChars) {
    if (!text) return ['']
    const out = []
    for (const paragraph of String(text).split('\n')) {
      const words = paragraph.split(' ')
      let current = ''
      for (const word of words) {
        if (!current) {
          current = word
        } else if (current.length + 1 + word.length <= maxChars) {
          current += ' ' + word
        } else {
          out.push(current)
          current = word
        }
      }
      if (current) out.push(current)
      else if (paragraph === '') out.push('')
    }
    // Hard-break any single token longer than the line width.
    const final = []
    for (const line of out) {
      if (line.length <= maxChars) final.push(line)
      else for (let i = 0; i < line.length; i += maxChars) final.push(line.slice(i, i + maxChars))
    }
    return final.length ? final : ['']
  }

  _renderLog() {
    const L = this._logLayout
    if (!L || !this.logText) return

    const contentW = L.w - L.pad * 2 - 6 // 6px reserved for scrollbar
    const maxChars = Math.max(8, Math.floor(contentW / L.charW))
    const visibleLines = Math.max(1, Math.floor(L.textH / L.lineH))

    const displayLines = []
    for (const entry of this._logHistory) {
      for (const line of this._wrapLogLine(entry, maxChars)) displayLines.push(line)
    }

    const maxScroll = Math.max(0, displayLines.length - visibleLines)
    if (this._logScrollOffset > maxScroll) this._logScrollOffset = maxScroll

    const endIdx = displayLines.length - this._logScrollOffset
    const startIdx = Math.max(0, endIdx - visibleLines)
    this.logText.setText(displayLines.slice(startIdx, endIdx).join('\n'))

    const sb = this._logScrollbar
    if (!sb) return
    sb.clear()
    if (displayLines.length > visibleLines) {
      const trackH = L.textH - 2
      const thumbH = Math.max(6, Math.floor(trackH * visibleLines / displayLines.length))
      const scrollFrac = maxScroll === 0 ? 0 : this._logScrollOffset / maxScroll
      const thumbY = L.textY + 1 + Math.floor((trackH - thumbH) * (1 - scrollFrac))
      sb.fillStyle(Theme.mutedText, 0.6)
      sb.fillRect(L.x + L.w - 5, thumbY, 3, thumbH)
    }
  }

  // ---------- visual script preprocessing ----------

  _buildVisualScript(log) {
    // The adapter now emits pre-shaped tick steps: `{ type: 'tick', tickId,
    // playerAttack, enemyAttack, flavorMessages, ... }`. We just translate
    // each step to the corresponding frame type. No reordering, no pair
    // detection — the engine produces exactly one front-vs-front exchange
    // per tick and the adapter already grouped them.
    const frames = []
    let clashCount = 0
    let soloCount = 0
    let flavorCount = 0
    let deathCount = 0

    for (const step of log) {
      if (step.type === 'tick') {
        if (step.playerAttack && step.enemyAttack) {
          frames.push({
            type: 'clash',
            a: {
              ...step.playerAttack,
              playerHp: step.playerHp,
              enemyHp: step.enemyHp,
              playerAtk: step.playerAtk,
              enemyAtk: step.enemyAtk,
            },
            b: {
              ...step.enemyAttack,
              playerHp: step.playerHp,
              enemyHp: step.enemyHp,
              playerAtk: step.playerAtk,
              enemyAtk: step.enemyAtk,
            },
            flavorMessages: step.flavorMessages ?? [],
            flavorEvents: step.flavorEvents ?? [],
          })
          clashCount++
        } else if (step.playerAttack || step.enemyAttack) {
          const only = step.playerAttack ?? step.enemyAttack
          frames.push({
            type: 'solo_attack',
            step: {
              ...only,
              playerHp: step.playerHp,
              enemyHp: step.enemyHp,
              playerAtk: step.playerAtk,
              enemyAtk: step.enemyAtk,
              flavorMessages: step.flavorMessages ?? [],
              flavorEvents: step.flavorEvents ?? [],
            },
          })
          soloCount++
        } else {
          // Pure flavor tick (both sides skipBasicAttack, or just passive
          // synergy messages).
          frames.push({
            type: 'flavor',
            step: {
              message: (step.flavorMessages ?? []).join(' | ') || step.message,
              playerHp: step.playerHp,
              enemyHp: step.enemyHp,
              playerAtk: step.playerAtk,
              enemyAtk: step.enemyAtk,
              flavorEvents: step.flavorEvents ?? [],
            },
          })
          flavorCount++
        }
        continue
      }
      if (step.type === 'death_batch') {
        frames.push({ type: 'death_batch', step })
        deathCount += (step.deaths?.length ?? 0)
        continue
      }
      if (step.diedInstanceId) {
        frames.push({ type: 'death', step })
        deathCount++
        continue
      }
      frames.push({
        type: 'flavor',
        step: {
          ...step,
          flavorEvents: step.flavorEvents ?? [],
        },
      })
      flavorCount++
    }

    console.log(
      `[Battle] script: ${frames.length} frames (${clashCount} clashes, ${soloCount} solos, ${flavorCount} flavor, ${deathCount} deaths)`,
    )
    return frames
  }

  // ---------- promise-chained driver ----------

  async _runFrames(frames) {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      console.log(`[Battle] frame ${i + 1}/${frames.length}: ${frame.type}`)
      await this._playFrameWithWatchdog(frame, i)
    }
    this.time.delayedCall(800, () => this._endBattle(this._battleResult.won))
  }

  _playFrameWithWatchdog(frame, index) {
    // Safety net: if a tween/anim event doesn't fire for any reason, the
    // watchdog resolves the frame after 3s so the battle can't stall.
    return new Promise((resolve) => {
      let settled = false
      const settle = (reason) => {
        if (settled) return
        settled = true
        if (reason === 'watchdog') {
          console.warn(`[Battle] frame watchdog tripped at i=${index} type=${frame.type}`)
        }
        resolve()
      }
      const framePromise = this._playFrame(frame)
      framePromise.then(() => settle('normal'), (err) => {
        console.error(`[Battle] frame ${index} (${frame.type}) errored:`, err)
        settle('error')
      })
      this.time.delayedCall(3000, () => settle('watchdog'))
    })
  }

  _playFrame(frame) {
    switch (frame.type) {
      case 'clash': return this._playClash(frame.a, frame.b, frame)
      case 'solo_attack': return this._playSoloAttack(frame.step)
      case 'flavor': return this._playFlavor(frame.step)
      case 'death': return this._playDeath(frame.step)
      case 'death_batch': return this._playDeathBatch(frame.step)
      default:
        console.warn(`[Battle] unknown frame type: ${frame.type}`)
        return Promise.resolve()
    }
  }

  // ---------- frame helpers ----------

  _applyStatSnapshot(step) {
    if (step.playerHp) {
      this.playerSprites.forEach((s, i) => {
        if (s.died) return
        if (step.playerHp[i] !== undefined) {
          s.warrior.currentHp = step.playerHp[i]
          if (s.badge) s.badge.setHp(s.warrior.currentHp)
        }
        if (step.playerAtk?.[i] !== undefined) {
          s.warrior.atk = step.playerAtk[i]
          if (s.badge) s.badge.setAtk(s.warrior.atk)
        }
      })
    }
    if (step.enemyHp) {
      this.enemySprites.forEach((s, i) => {
        if (s.died) return
        if (step.enemyHp[i] !== undefined) {
          s.warrior.currentHp = step.enemyHp[i]
          if (s.badge) s.badge.setHp(s.warrior.currentHp)
        }
        if (step.enemyAtk?.[i] !== undefined) {
          s.warrior.atk = step.enemyAtk[i]
          if (s.badge) s.badge.setAtk(s.warrior.atk)
        }
      })
    }
  }

  _spawnFlavorPops(events) {
    ;(events ?? []).forEach((fe, i) => {
      this.time.delayedCall(60 * i, () => {
        const text = fe?.text ?? (fe?.amount != null ? `${fe.amount}` : '')
        this._showFloatText(fe?.targetInstanceId ?? null, text, fe?.type ?? 'buff')
      })
    })
  }

  _playClash(a, b, frame) {
    return new Promise((resolve) => {
      const pEntry = this.spriteByInstance?.get(a.actorInstanceId)
      const eEntry = this.spriteByInstance?.get(b.actorInstanceId)
      if (!pEntry?.sprite || !eEntry?.sprite) {
        console.warn(`[Battle] clash aborted — missing sprite (p=${!!pEntry?.sprite} e=${!!eEntry?.sprite}), falling back to solos`)
        // Fallback: play both as solo attacks sequentially.
        this._playSoloAttack(a)
          .then(() => this._playSoloAttack(b))
          .then(resolve)
        return
      }

      const flavor = frame?.flavorMessages ?? []
      const headLine = `${a.message}. ${b.message}`
      const flavorLine = flavor.length ? `  [${flavor.join(' | ')}]` : ''
      this._addLogEntry(headLine + flavorLine)

      const pSprite = pEntry.sprite
      const eSprite = eEntry.sprite
      const homePX = pSprite.x
      const homeEX = eSprite.x
      const clashX = Math.round((homePX + homeEX) / 2)
      const pMeet = clashX - 30
      const eMeet = clashX + 30
      const prevPDepth = pSprite.depth
      const prevEDepth = eSprite.depth
      pSprite.setDepth(prevPDepth + 1)
      eSprite.setDepth(prevEDepth + 1)

      console.log(`[Battle] clash: ${a.actorInstanceId} (home=${homePX}) <-> ${b.actorInstanceId} (home=${homeEX}) clashX=${clashX}`)

      let advanceDone = 0
      const onAdvance = () => {
        advanceDone++
        if (advanceDone < 2) return
        // Both arrived. Swing.
        this._playActorAnim(a.actorInstanceId, 'attack')
        this._playActorAnim(b.actorInstanceId, 'attack')
        this._applyStatSnapshot(a)
        this._applyStatSnapshot(b)

        if (typeof a.damage === 'number') {
          this._showFloatText(a.targetInstanceId, `${a.damage}`, a.blocked === true ? 'block' : 'damage', { x: clashX, y: 385 })
        }
        if (typeof b.damage === 'number') {
          this._showFloatText(b.targetInstanceId, `${b.damage}`, b.blocked === true ? 'block' : 'damage', { x: clashX, y: 403 })
        }
        this._spawnFlavorPops(frame?.flavorEvents)

        this.cameras.main.shake(120, 0.006)

        this.time.delayedCall(240, () => {
          let retreatDone = 0
          const onRetreat = () => {
            retreatDone++
            if (retreatDone < 2) return
            pSprite.setDepth(prevPDepth)
            eSprite.setDepth(prevEDepth)
            resolve()
          }
          this.tweens.add({
            targets: pSprite,
            x: homePX,
            duration: 150,
            ease: 'Cubic.In',
            onComplete: onRetreat,
          })
          this.tweens.add({
            targets: eSprite,
            x: homeEX,
            duration: 150,
            ease: 'Cubic.In',
            onComplete: onRetreat,
          })
        })
      }

      this.tweens.add({
        targets: pSprite,
        x: pMeet,
        duration: 130,
        ease: 'Cubic.Out',
        onComplete: onAdvance,
      })
      this.tweens.add({
        targets: eSprite,
        x: eMeet,
        duration: 130,
        ease: 'Cubic.Out',
        onComplete: onAdvance,
      })
    })
  }

  _playSoloAttack(step) {
    return new Promise((resolve) => {
      const attackerEntry = this.spriteByInstance?.get(step.actorInstanceId)
      const targetEntry = this.spriteByInstance?.get(step.targetInstanceId)
      if (!attackerEntry?.sprite || !targetEntry?.sprite) {
        console.warn(`[Battle] solo aborted — missing sprite actor=${step.actorInstanceId} target=${step.targetInstanceId}`)
        this._applyStatSnapshot(step)
        this._addLogEntry(step.message ?? '')
        this._spawnFlavorPops(step.flavorEvents)
        resolve()
        return
      }

      this._addLogEntry(step.message ?? '')

      const sprite = attackerEntry.sprite
      const targetSprite = targetEntry.sprite
      const homeX = sprite.x
      const isPlayerAttacker = step.actorInstanceId.startsWith('p')
      const strikeX = isPlayerAttacker ? (targetSprite.x - 30) : (targetSprite.x + 30)
      const popupX = Math.round((homeX + targetSprite.x) / 2)
      const prevDepth = sprite.depth
      sprite.setDepth(prevDepth + 1)

      console.log(`[Battle] solo: ${step.actorInstanceId} -> ${step.targetInstanceId} strike=${strikeX} home=${homeX}`)

      this.tweens.add({
        targets: sprite,
        x: strikeX,
        duration: 130,
        ease: 'Cubic.Out',
        onComplete: () => {
          this._playActorAnim(step.actorInstanceId, 'attack')
          this._applyStatSnapshot(step)
          if (typeof step.damage === 'number') {
            this._showFloatText(step.targetInstanceId, `${step.damage}`, step.blocked === true ? 'block' : 'damage', { x: popupX, y: 390 })
          }
          this._spawnFlavorPops(step.flavorEvents)
          this.cameras.main.shake(100, 0.005)

          this.time.delayedCall(200, () => {
            this.tweens.add({
              targets: sprite,
              x: homeX,
              duration: 150,
              ease: 'Cubic.In',
              onComplete: () => {
                sprite.setDepth(prevDepth)
                resolve()
              },
            })
          })
        },
      })
    })
  }

  _playFlavor(step) {
    return new Promise((resolve) => {
      this._addLogEntry(step.message ?? '')
      this._applyStatSnapshot(step)
      this._spawnFlavorPops(step.flavorEvents)
      this.time.delayedCall(200, resolve)
    })
  }

  _playDeath(step) {
    return new Promise((resolve) => {
      const diedId = step.diedInstanceId
      this._addLogEntry(step.message ?? '')
      this._applyStatSnapshot(step)

      const entry = this.spriteByInstance?.get(diedId)
      if (!entry || entry.died) {
        console.log(`[Battle] death frame: ${diedId} already resolved or missing, skipping`)
        resolve()
        return
      }

      entry.died = true
      const side = diedId.startsWith('p') ? 'player' : 'enemy'
      const playedTag = this._playActorAnim(diedId, 'death')
      this.spriteByInstance.delete(diedId)
      console.log(`[Battle] death frame waiting on cleanup for ${diedId} (tag=${playedTag ?? 'NONE'})`)

      let cleanedUp = false
      const cleanup = () => {
        if (cleanedUp) return
        cleanedUp = true
        if (entry.sprite) entry.sprite.destroy()
        if (entry.badge) entry.badge.destroy()
        if (entry.light) {
          entry.light.setActive(false)
          entry.light.setVisible(false)
        }
        entry.sprite = null
        entry.badge = null
        entry.light = null
        this._reflowTeam(side)
        // Wait one reflow duration (_reflowTeam uses 400ms Cubic.Out at
        // L248) before resolving, so the next clash frame captures the
        // *settled* homeX, not a mid-tween position.
        this.time.delayedCall(450, () => {
          console.log(`[Battle] death frame resolved for ${diedId}`)
          resolve()
        })
      }

      if (playedTag) {
        entry.sprite.once('animationcomplete', cleanup)
        this.time.delayedCall(1200, cleanup)
      } else {
        console.log(`[Battle] death ${diedId}: no death anim, fallback cleanup in 400ms`)
        this.time.delayedCall(400, cleanup)
      }
    })
  }

  _playDeathBatch(step) {
    return new Promise((resolve) => {
      const deaths = step.deaths ?? []
      this._applyStatSnapshot(step)
      this._addLogEntry(step.message ?? '')

      if (deaths.length === 0) {
        resolve()
        return
      }

      console.log(`[Battle] death_batch: ${deaths.length} deaths starting in parallel`)
      const sidesToReflow = new Set()
      const animPromises = deaths.map((d) => new Promise((resolveAnim) => {
        const diedId = d.diedInstanceId
        const entry = this.spriteByInstance?.get(diedId)
        if (!entry || entry.died) {
          console.log(`[Battle] death_batch: ${diedId} already resolved or missing, skipping`)
          resolveAnim()
          return
        }
        entry.died = true
        const side = diedId.startsWith('p') ? 'player' : 'enemy'
        sidesToReflow.add(side)
        const playedTag = this._playActorAnim(diedId, 'death')
        this.spriteByInstance.delete(diedId)
        console.log(`[Battle] death_batch: ${diedId} anim=${playedTag ?? 'NONE'}`)

        let cleanedUp = false
        const cleanup = () => {
          if (cleanedUp) return
          cleanedUp = true
          if (entry.sprite) entry.sprite.destroy()
          if (entry.badge) entry.badge.destroy()
          if (entry.light) {
            entry.light.setActive(false)
            entry.light.setVisible(false)
          }
          entry.sprite = null
          entry.badge = null
          entry.light = null
          resolveAnim()
        }

        if (playedTag) {
          entry.sprite.once('animationcomplete', cleanup)
          this.time.delayedCall(1200, cleanup)
        } else {
          this.time.delayedCall(400, cleanup)
        }
      }))

      Promise.all(animPromises).then(() => {
        for (const side of sidesToReflow) this._reflowTeam(side)
        // Wait for reflow tween to settle (matches _playDeath's 450ms) so
        // the next clash frame captures settled homeX positions.
        this.time.delayedCall(450, () => {
          console.log(`[Battle] death_batch resolved (${deaths.length} deaths)`)
          resolve()
        })
      })
    })
  }

  _endBattle(won) {
    console.log(`[Battle] end: won=${won}, credits unchanged (shop will reset to 10)`)

    const bannerText = won ? 'VICTORY!' : 'DEFEAT'
    const bannerColor = won ? Theme.success : Theme.error

    FloatingBanner.show(this, bannerText, {
      color: bannerColor, hold: 1500,
    }).then(() => {
      if (won) {
        const newWins = this.wins + 1
        if (newWins === 9) {
          // Champion flow — power-off transition to HallOfFame
          startSceneWithCrtPolicy(this, 'HallOfFame', {
            wins: newWins, losses: this.losses, team: this.team, runId: this.runId,
            commander: this.commander,
            merchant: this.merchant,
          })
          return
        }
        // First merchant selection — fires exactly once per run at win 3.
        // The `!this.merchant` guard is belt-and-suspenders for capture tooling
        // or dev hot reloads that might replay win 3.
        if (newWins === 3 && !this.merchant) {
          console.log(`[Battle] First merchant selection — launching MerchantSelect`)
          this.scene.start('MerchantSelect', {
            stage: this.stage + 1,
            wins: newWins,
            losses: this.losses,
            team: this.team,
            runId: this.runId,
            commander: this.commander,
          })
          return
        }
        console.log(`[Battle] Round ended (win) — ${this.team.length} units persist (no permadeath). Full HP next round.`)
        // Battle → Shop is immediate (no power-off). Omit `gold` so ShopScene.init() defaults to 10.
        this.scene.start('Shop', {
          stage: this.stage + 1,
          wins: newWins,
          losses: this.losses,
          team: this.team,
          runId: this.runId,
          commander: this.commander,
          merchant: this.merchant,
        })
      } else {
        const newLosses = this.losses + 1
        if (newLosses >= 3) {
          // 3 losses — power-off transition to GameOver
          startSceneWithCrtPolicy(this, 'GameOver', {
            wins: this.wins, losses: newLosses,
            commander: this.commander,
            merchant: this.merchant,
          })
          return
        }
        console.log(`[Battle] Round ended (loss) — ${this.team.length} units persist (no permadeath). Full HP next round.`)
        // Battle → Shop is immediate (no power-off). Omit `gold` so ShopScene.init() defaults to 10.
        this.scene.start('Shop', {
          stage: this.stage + 1,
          wins: this.wins,
          losses: newLosses,
          team: this.team,
          runId: this.runId,
          commander: this.commander,
          merchant: this.merchant,
        })
      }
    })
  }
}
