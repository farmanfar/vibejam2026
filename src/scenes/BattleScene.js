import { Scene } from 'phaser'
import {
  Theme, FONT_KEY, PixelLabel, FloatingBanner, PixelPanel, UnitStatBadge,
} from '../ui/index.js'
import { runAlphaBattle } from '../systems/combat/BattleSceneAdapter.js'
import { logBattle } from '../systems/PlaytestLogger.js'
import { finalizeCaptureScene } from '../systems/CaptureSupport.js'
import { ParallaxBackground } from '../rendering/ParallaxBackground.js'
import { pickMountainCitySets } from '../rendering/FactionPalettes.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { getUnitPortraitRef } from '../rendering/UnitArt.js'
import { getAsepriteTagConfigs } from '../rendering/AsepriteAnimations.js'
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js'
import { SceneDust } from '../rendering/SceneDust.js'
import { attachOutlineToSprite } from '../rendering/OutlineController.js'
import { fitSpriteToPortraitBounds } from '../rendering/SpriteFit.js'
import { CommanderBadge } from '../widgets/CommanderBadge.js'
import { TutorialOverlay } from '../widgets/TutorialOverlay.js'
import { getCommanderRule, pickRandomCommanders } from '../config/commanders.js'

// Minimum on-screen height (in display px) for battle-sprite characters.
// PENUSBMIC atlases vary wildly in how much of the 192x192 frame is actually
// character pixels — some units (dagger_mush, electrocutioner) have 18-24px
// tight bounds, so the shared displayScale=2.5 paints them at 45-60px while
// a normal unit renders at 150-200px. This floor ensures small characters
// stay readable in the lineup without shrinking larger ones.
const MIN_BATTLE_SPRITE_H = 80

// Global boost on per-unit art.displayScale. 0.9 shrinks sprites ~10% so
// the row sits more comfortably in the middle of the canvas without
// bumping neighbours. Do not raise back above ~1.0 without widening
// _slotSpacing — many units have tight bounds ~50px wide which render
// 125px+ at full displayScale and would collide at 5-per-side.
const BATTLE_SCALE_BOOST = 0.9

const FLOAT_TEXT_STYLES = {
  damage: { color: Theme.error, fontSize: 36, prefix: '-' },
  // damageStamp = oversized rotating "−N" used by chip-bump beat. Played
  // through _showFloatText's `motion: 'stamp'` branch.
  damageStamp: { color: Theme.error, fontSize: 44, prefix: '-', motion: 'stamp' },
  block: { color: Theme.mutedText, fontSize: 28, defaultText: 'BLOCK' },
  heal: { color: Theme.success, fontSize: 32 },
  buff: { color: Theme.warning, fontSize: 28 },
  debuff: { color: 0xc678dd, fontSize: 28 },
  poison: { color: 0xc678dd, fontSize: 28 },
  armor: { color: Theme.accent, fontSize: 28, defaultText: 'ARMORED' },
  resonance: { color: Theme.fantasyGoldBright, fontSize: 28 },
}

// Clash timing constants. Both attackers swing simultaneously, damage
// resolves after the swing peak, then defenders react. Badges stay anchored
// to their unit — no chip sliding, just in-place shake + tick-down.
const SWING_LEAD_MS = 220   // wait after triggering attack anim before damage lands
const HIT_HOLD_MS   = 260   // hold so badge tick-down + stamp can read
const REACT_MS      = 240   // window for defender hit anim before frame ends

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
    this.tutorial = data.tutorial === true
    this.leftSet = data.leftSet ?? null
    this.rightSet = data.rightSet ?? null
    this.captureFreeze = data.captureFreeze === true
    this.shopLocks = Array.isArray(data.shopLocks)
      ? [0, 1, 2, 3].map(i => !!data.shopLocks[i])
      : [false, false, false, false]
    this.shopOffer = Array.isArray(data.shopOffer)
      ? data.shopOffer.map(w => (w ? { ...w } : null))
      : null
    console.log(`[Battle] init tutorial=${this.tutorial} stage=${this.stage}`)
  }

  create() {
    console.log(`[Battle] Commander: ${this.commander?.name ?? 'none'}`)
    const { width, height } = this.cameras.main

    // CRT post-process (softGameplay — lighter curvature preserves pointer accuracy)
    SceneCrt.attach(this, 'softGameplay')
    // Ambient dust — windswept arena grit blowing right-to-left
    SceneDust.attach(this, 'battle')

    // TEMP: flat tan background for layout review — swap back to parallax when ready
    const tempBg = this.add.graphics()
    tempBg.fillStyle(0xC4A882, 1)
    tempBg.fillRect(0, 0, width, height)
    tempBg.setDepth(0)
    this.parallax = null

    this.enemyTeam = this.opponent
    const battleDepth = 20

    // Front units sit 110px off center (220px gap between front fighters
    // for the clash) and teammates are spaced 95px apart. With 5 units per
    // side and BATTLE_SCALE_BOOST=0.9 this puts the backmost at x=-10 /
    // x=970 — the shrunken sprites leave enough slack that the character
    // pixels still read on-canvas. Bumping either value further risks
    // clipping. Keep this invariant consistent with _reflowTeam below.
    const centerX = width / 2
    this._frontOffset = 110
    this._slotSpacing = 95

    // Each team lives in its own Phaser Container so F2 can drag the whole
    // lineup as a single object. Containers start at (0, 0), so child
    // sprites — whose x/y are absolute world coords from the formulas
    // below — render at the same screen position they would if they were
    // scene-direct. Moving a container offsets every sprite & badge in it
    // uniformly, which is what the user wants. Combat math below (clash,
    // solo, float-text) uses _spriteWorldX/_spriteWorldY helpers to keep
    // the clash meeting point visually centered even when the containers
    // are offset asymmetrically.
    this.playerTeamContainer = this.add.container(0, 0)
    this.playerTeamContainer.setDepth(battleDepth)
    this.enemyTeamContainer = this.add.container(0, 0)
    this.enemyTeamContainer.setDepth(battleDepth)

    this.playerSprites = this.team.map((w, i) => {
      const x = centerX - this._frontOffset - i * this._slotSpacing
      const y = 320
      const ref = getUnitPortraitRef(this, w, 'battle player')
      const scale = w.art?.displayScale ?? 2.5
      const sprite = this.add.sprite(x, y, ref.key, ref.frame)
        .setScale(scale)
        .setDepth(battleDepth)
      this._adjustBattleSprite(sprite, w, ref, 'player')
      attachOutlineToSprite(sprite)
      this._wireAlphaAnimations(sprite, w, 'player')
      const badge = new UnitStatBadge(this, x, y + 55, {
        atk: w.atk,
        hp: w.hp,
      })
      badge.setDepth(battleDepth)
      this.playerTeamContainer.add([sprite, badge])
      return {
        sprite, badge,
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
      attachOutlineToSprite(sprite)
      this._wireAlphaAnimations(sprite, w, 'enemy')
      const badge = new UnitStatBadge(this, x, y + 55, {
        atk: w.atk,
        hp: w.hp,
        isEnemy: true,
      })
      badge.setDepth(battleDepth)
      this.enemyTeamContainer.add([sprite, badge])
      return {
        sprite, badge,
        warrior: { ...w, currentHp: w.hp },
        instanceId: `e${i}`,
      }
    })

    // Register team containers with the F2 editor so the user can drag each
    // whole lineup as one object. Default position is (0, 0) because sprite
    // children already hold absolute world coords.
    LayoutEditor.register(this, 'playerTeamContainer', this.playerTeamContainer, 0, 0)
    LayoutEditor.register(this, 'enemyTeamContainer', this.enemyTeamContainer, 0, 0)

    // Sprite lookup by stable instance id — adapter emits *InstanceId on
    // every relevant log step, so compaction / death-defy / reanimate no
    // longer desync the visual layer from the logical one.
    this.spriteByInstance = new Map()
    this.playerSprites.forEach((s) => this.spriteByInstance.set(s.instanceId, s))
    this.enemySprites.forEach((s) => this.spriteByInstance.set(s.instanceId, s))
    this._activePopupsByTarget = new Map()

    /*
    const yourTeamLabel = new PixelLabel(this, 100, 320, 'YOUR TEAM', {
      scale: 2, color: 'accent', align: 'center',
    })
    yourTeamLabel.setDepth(battleDepth)
    LayoutEditor.register(this, 'yourTeamLabel', yourTeamLabel, 100, 320)

    const enemyLabel = new PixelLabel(this, width - 100, 320, 'ENEMY', {
      scale: 2, color: 'error', align: 'center',
    })
    enemyLabel.setDepth(battleDepth)
    LayoutEditor.register(this, 'enemyLabel', enemyLabel, width - 100, 320)
    */

    const vsText = this.add.bitmapText(width / 2, 300, FONT_KEY, 'VS', 35)
      .setOrigin(0.5)
      .setTint(Theme.criticalText)
      .setDepth(battleDepth)
    LayoutEditor.register(this, 'vsText', vsText, width / 2, 300)

    // ── Commander badge — anchored near the bottom so the commander stands
    // partially off-screen (feet cut by canvas edge), framing the fight.
    const COMMANDER_X = 80
    const COMMANDER_Y = 460
    if (this.commander) {
      const commanderBadge = new CommanderBadge(this, COMMANDER_X, COMMANDER_Y, this.commander)
      commanderBadge.setDepth(battleDepth)
      this._commanderBadge = commanderBadge
      LayoutEditor.register(this, 'commanderBadge', commanderBadge, COMMANDER_X, COMMANDER_Y)
      console.log(`[Layout] Battle.commanderBadge at (${COMMANDER_X}, ${COMMANDER_Y}) — ${this.commander.name}`)
    } else {
      console.log('[Battle] No commander in run state — skipping commander badge')
    }

    // ── Enemy commander — assigned at create() time so the badge renders on
    // scene entry (GhostManager doesn't persist commanders; the opponent
    // object is an array coming from ShopScene, so we stamp .commander on it).
    if (!this.opponent) this.opponent = []
    if (!this.opponent.commander) {
      this.opponent.commander = pickRandomCommanders(1)[0]
      console.log(`[Battle] Enemy commander assigned: ${this.opponent.commander.name} (${this.opponent.commander.rule.description})`)
    }

    const ENEMY_COMMANDER_X = width - 80
    const ENEMY_COMMANDER_Y = 460
    const enemyCommanderBadge = new CommanderBadge(
      this, ENEMY_COMMANDER_X, ENEMY_COMMANDER_Y, this.opponent.commander,
    )
    enemyCommanderBadge.setDepth(battleDepth)
    this._enemyCommanderBadge = enemyCommanderBadge
    LayoutEditor.register(this, 'enemyCommanderBadge', enemyCommanderBadge, ENEMY_COMMANDER_X, ENEMY_COMMANDER_Y)
    console.log(`[Layout] Battle.enemyCommanderBadge at (${ENEMY_COMMANDER_X}, ${ENEMY_COMMANDER_Y}) — ${this.opponent.commander.name}`)

    // Ghost nickname label — only renders when the opponent came from a
    // real Supabase snapshot. Synthetic-AI fallback opponents have no
    // nickname and stay anonymous.
    if (this.opponent.nickname) {
      const ENEMY_NICK_X = ENEMY_COMMANDER_X
      const ENEMY_NICK_Y = 514
      const enemyNicknameLabel = new PixelLabel(
        this, ENEMY_NICK_X, ENEMY_NICK_Y, `vs. ${this.opponent.nickname}`,
        { scale: 1, color: 'muted', align: 'center' },
      )
      enemyNicknameLabel.setDepth(battleDepth)
      this._enemyNicknameLabel = enemyNicknameLabel
      LayoutEditor.register(this, 'enemyNicknameLabel', enemyNicknameLabel, ENEMY_NICK_X, ENEMY_NICK_Y)
      console.log(`[Battle] Enemy nickname: "${this.opponent.nickname}"`)
    }

    // Event log state kept so _addLogEntry / _renderLog remain safe no-ops
    // while the visual box is commented out below.
    this._logHistory = []
    this._logScrollOffset = 0 // lines from bottom (0 = pinned to newest)

    /*
    // Scrollable event log — mirrors HammerTime/UI/GameLog.cs style:
    // uppercase entries, muted tint, small m5x7 text, header + divider,
    // mouse-wheel scrollback with a scrollbar thumb.
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
    */

    this.events.once('shutdown', () => {
      console.log('[Battle] Shutdown - cleaning up')
      LayoutEditor.unregisterScene('Battle')
    })

    console.log(`[Battle] Scene created - ${this.team.length} vs ${this.opponent.length}`)

    if (this.captureFreeze) {
      finalizeCaptureScene('Battle')
      return
    }

    const banner = FloatingBanner.show(this, `STAGE ${this.stage}`, {
      color: Theme.accent, hold: 600, scale: 6,
    })
    const tutorialGate = (this.tutorial && this.stage === 1)
      ? banner.then(() => this._showAutoBattleTutorial())
      : banner
    tutorialGate.then(() => this._runBattle())
  }

  _showAutoBattleTutorial() {
    return new Promise((resolve) => {
      const overlay = new TutorialOverlay(this, {
        steps: [
          {
            id: 'auto-battle',
            anchor: 'center',
            title: 'Battles play themselves',
            body: "Sit back. Watch what works and what doesn't. The next shop arrives when it's over.",
            advance: 'click',
          },
        ],
        onComplete: () => {
          console.log('[Tutorial] Auto-battle modal complete')
          resolve()
        },
        onSkip: () => {
          console.log('[Tutorial] Auto-battle modal skipped')
          this.tutorial = false
          resolve()
        },
      })
      overlay.start()
    })
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
  // Sprite world/local helpers. When a sprite lives inside a team
  // container, sprite.x/.y are LOCAL to the container; world position is
  // sprite.x + container.x. Combat math (clash, solo meet points, float
  // text anchors) must operate in world space to stay visually correct
  // when the user drags a team container via F2.
  _spriteWorldX(sprite) {
    return sprite.x + (sprite.parentContainer?.x ?? 0)
  }
  _spriteWorldY(sprite) {
    return sprite.y + (sprite.parentContainer?.y ?? 0)
  }
  _worldToLocalX(sprite, worldX) {
    return worldX - (sprite.parentContainer?.x ?? 0)
  }

  _adjustBattleSprite(sprite, warrior, ref, side) {
    // Enemy sprites get setFlipX(true) before this call — flipXInvert tells
    // the helper to mirror the origin.x so the anchor lands on the mirrored
    // character instead of the empty right half of the flipped frame.
    fitSpriteToPortraitBounds(this, sprite, ref, {
      configScale: (warrior.art?.displayScale ?? 2.5) * BATTLE_SCALE_BOOST,
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
        // Bake a reversed-death anim for Monster reanimate rise VFX.
        const deathKey = warrior.art?.animTagOverrides?.death ?? 'death'
        const deathConfig = configs.find(c => c.key === deathKey)
        if (deathConfig?.frames?.length) {
          sprite.anims.create({
            key: deathKey + '_reverse',
            frames: [...deathConfig.frames].reverse(),
            duration: deathConfig.duration,
          })
        }
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
      const targets = [s.sprite, s.badge].filter(Boolean)
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

    // anchor: 'top' makes the text grow DOWNWARD from posOverride.y (used
    // for damage numbers anchored under the badge so they sit beneath the
    // unit's feet). Default 'bottom' grows upward from the anchor.
    const dropMode = posOverride?.anchor === 'top'
    console.log(`[Battle] float text: instanceId=${targetInstanceId ?? 'NONE'} style=${style} text=${resolvedText}${posOverride ? ` override=(${posOverride.x},${posOverride.y})${dropMode ? ' drop' : ''}` : ''}`)

    const slot = this._activePopupsByTarget.get(slotKey) ?? 0
    this._activePopupsByTarget.set(slotKey, slot + 1)

    const jitterX = ((slot % 3) - 1) * 10
    // Default popup anchor is above the sprite's head in WORLD space — the
    // float text itself is a scene-level bitmapText (not parented to a
    // container), so it must be positioned in world coords even when the
    // sprite lives inside a team container that may be offset by F2.
    const startX = posOverride
      ? (posOverride.x + jitterX)
      : (this._spriteWorldX(entry.sprite) + jitterX)
    const startY = posOverride
      ? posOverride.y
      : (this._spriteWorldY(entry.sprite) + 70)
    const dir = dropMode ? 1 : -1

    const label = this.add.bitmapText(startX, startY, FONT_KEY, resolvedText, config.fontSize)
      .setOrigin(0.5, dropMode ? 0 : 1)
      .setTint(config.color)
      .setDepth(1000)
      .setAlpha(0)
      .setScale(0.4)

    const releaseSlot = () => {
      const remaining = (this._activePopupsByTarget.get(slotKey) ?? 1) - 1
      if (remaining <= 0) this._activePopupsByTarget.delete(slotKey)
      else this._activePopupsByTarget.set(slotKey, remaining)
    }

    if (config.motion === 'stamp') {
      // Oversized rotating "−N" stamp ported from the SAP-readability mock.
      // Lands BIG and tilted, settles, holds, drifts + fades. Total ~700ms.
      // dir = -1 drifts upward (default head-anchored), +1 drifts downward
      // (drop mode anchored beneath the unit's badge / feet).
      label.setScale(2.0)
      label.setRotation(-0.10) // ≈ -6deg
      label.setY(startY + 14 * dir)
      this.tweens.chain({
        targets: label,
        tweens: [
          { alpha: 1, scaleX: 1.45, scaleY: 1.45, rotation: -0.05, y: startY + 24 * dir, duration: 80,  ease: 'Quad.Out' },
          { scaleX: 1.15, scaleY: 1.15, rotation: 0,               y: startY + 26 * dir, duration: 110, ease: 'Quad.Out' },
          { rotation: 0.035,                                                              duration: 320, ease: 'Sine.InOut' },
          { alpha: 0, scaleX: 0.95, scaleY: 0.95, rotation: 0.075, y: startY + 44 * dir, duration: 200, ease: 'Cubic.In' },
        ],
        onComplete: () => {
          label.destroy()
          releaseSlot()
        },
      })
      return
    }

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
        releaseSlot()
      },
    })
  }

  _runBattle() {
    // Clone defs so commander buffs don't mutate the sprite's source warrior
    // objects (which are held by Shop/ghost snapshots and next-round rebuilds).
    const playerDefs = this.playerSprites.map(s => ({ ...s.warrior }))
    const enemyDefs = this.enemySprites.map(s => ({ ...s.warrior }))

    // Enemy commander was assigned in create() so the badge could render; the
    // rule is read straight off this.opponent.commander here.
    const applyCommanderBuff = (defs, rule, teamLabel) => {
      if (!rule || (!rule.atk && !rule.hp)) return
      for (const w of defs) {
        w.atk = (w.atk ?? 0) + (rule.atk ?? 0)
        w.hp  = (w.hp  ?? 0) + (rule.hp  ?? 0)
      }
      console.log(`[Battle] Commander buff (${teamLabel}) +${rule.atk ?? 0}/+${rule.hp ?? 0} applied to ${defs.length} units`)
    }
    applyCommanderBuff(playerDefs, getCommanderRule(this.commander),          'player')
    applyCommanderBuff(enemyDefs,  getCommanderRule(this.opponent.commander), 'enemy')

    const result = runAlphaBattle(playerDefs, enemyDefs, undefined, {
      playerMerchant: this.merchant,
      enemyMerchant:  this.opponent?.merchant ?? null,
    })
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
      if (step.revivedInstanceId) {
        frames.push({ type: 'revive', step })
        flavorCount++
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
      case 'revive': return this._playRevive(frame.step)
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

  // ─── Simultaneous-swing clash ──────────────────────────────────────────
  // Both attackers play their attack animation at the same time, damage
  // resolves at the swing peak, defenders play hit (or fall to death_batch
  // for kills). Badges stay anchored to their unit — on damage they shake
  // in place and the HP digit ticks down with a per-tick red flash.
  async _playClash(a, b, frame) {
    const aEntry = this.spriteByInstance?.get(a.actorInstanceId)
    const aTarget = this.spriteByInstance?.get(a.targetInstanceId)
    const bEntry = this.spriteByInstance?.get(b.actorInstanceId)
    const bTarget = this.spriteByInstance?.get(b.targetInstanceId)

    if (!aEntry?.sprite || !aTarget?.sprite || !bEntry?.sprite || !bTarget?.sprite) {
      console.warn(`[Battle] clash aborted — missing sprite (aSrc=${!!aEntry?.sprite} aTgt=${!!aTarget?.sprite} bSrc=${!!bEntry?.sprite} bTgt=${!!bTarget?.sprite}); falling back to solos`)
      await this._playSoloAttack(a)
      await this._playSoloAttack(b)
      return
    }

    const flavor = frame?.flavorMessages ?? []
    const headLine = `${a.message}. ${b.message}`
    const flavorLine = flavor.length ? `  [${flavor.join(' | ')}]` : ''
    this._addLogEntry(headLine + flavorLine)
    console.log(`[Battle] clash: ${a.actorInstanceId} <-> ${b.actorInstanceId} (dmg ${a.damage} / ${b.damage})`)

    // Both attackers swing at once.
    this._playActorAnim(a.actorInstanceId, a.animTag ?? 'attack')
    this._playActorAnim(b.actorInstanceId, b.animTag ?? 'attack')
    this.cameras.main.shake(180, 0.006)

    await this._wait(SWING_LEAD_MS)

    // Damage lands on both defenders simultaneously.
    this._resolveHit(aTarget, a.damage, a.blocked, a.targetInstanceId)
    this._resolveHit(bTarget, b.damage, b.blocked, b.targetInstanceId)
    // Reconcile to engine snapshot (catches flavor-driven HP/ATK we didn't
    // model in _resolveHit — armor procs, resonance, etc.). Idempotent
    // because setHp/setAtk early-out on equality.
    this._applyStatSnapshot(a)
    this._applyStatSnapshot(b)
    this._spawnFlavorPops(frame?.flavorEvents)

    await this._wait(HIT_HOLD_MS)

    // React: surviving defenders play hit anim or hit-pop. Fallen units stay
    // static — death_batch frame fires next and owns death anim/cleanup.
    this._playDefenderReact(aTarget)
    this._playDefenderReact(bTarget)

    await this._wait(REACT_MS)
  }

  async _playSoloAttack(step) {
    const attackerEntry = this.spriteByInstance?.get(step.actorInstanceId)
    const targetEntry = this.spriteByInstance?.get(step.targetInstanceId)
    if (!attackerEntry?.sprite || !targetEntry?.sprite) {
      console.warn(`[Battle] solo aborted — missing sprite actor=${step.actorInstanceId} target=${step.targetInstanceId}`)
      this._applyStatSnapshot(step)
      this._addLogEntry(step.message ?? '')
      this._spawnFlavorPops(step.flavorEvents)
      return
    }

    this._addLogEntry(step.message ?? '')
    console.log(`[Battle] solo: ${step.actorInstanceId} -> ${step.targetInstanceId} (dmg ${step.damage})`)

    this._playActorAnim(step.actorInstanceId, step.animTag ?? 'attack')
    this.cameras.main.shake(140, 0.005)

    await this._wait(SWING_LEAD_MS)

    this._resolveHit(targetEntry, step.damage, step.blocked, step.targetInstanceId)
    this._applyStatSnapshot(step)
    this._spawnFlavorPops(step.flavorEvents)

    await this._wait(HIT_HOLD_MS)

    this._playDefenderReact(targetEntry)

    await this._wait(REACT_MS)
  }

  // Apply damage to a defender: shake the badge, drop a "−N" stamp above
  // the HP chip, tick the HP number down digit-by-digit. Updates running
  // currentHp so the death_batch frame can detect kills.
  _resolveHit(defenderEntry, dmg, blocked, targetInstanceId) {
    if (!defenderEntry?.badge) return
    if (typeof dmg !== 'number') return

    if (blocked) {
      this._showFloatText(targetInstanceId ?? null, 'BLOCK', 'block')
      defenderEntry.badge.shake(2, 200)
      return
    }

    const prevHp = defenderEntry.warrior?.currentHp ?? defenderEntry.warrior?.hp ?? 0
    const newHp = Math.max(0, prevHp - dmg)
    defenderEntry.warrior.currentHp = newHp
    console.log(`[Battle] hit ${defenderEntry.instanceId} hp ${prevHp} -> ${newHp} (-${dmg})`)

    // Anchor the "−N" stamp BELOW the badge so it appears beneath the
    // unit's feet (the badge already sits below the sprite at +55). Badge
    // preset 'small' is 22px tall; +15 = half-height (11) + ~4px padding
    // clears the chip border. anchor: 'top' makes the text grow + drift
    // downward from this point so it never overlaps the unit or the badge.
    const hpWorld = defenderEntry.badge.getWorldTransformMatrix()
    this._showFloatText(
      targetInstanceId ?? null,
      `${dmg}`, 'damageStamp',
      { x: hpWorld.tx + 8, y: hpWorld.ty + 15, anchor: 'top' },
    )
    defenderEntry.badge.shake(3, 240)
    defenderEntry.badge.tickDownHp(prevHp, newHp, 420)
  }

  // Defender's own animation reaction. If their atlas has a 'hit' tag,
  // play it; otherwise do a small scale pop. Fallen units (hp=0) stay
  // static — death_batch fires immediately after this clash and plays the
  // 'death' anim with proper cleanup.
  _playDefenderReact(defenderEntry) {
    if (!defenderEntry?.sprite || defenderEntry.died) return
    const hp = defenderEntry.warrior?.currentHp ?? defenderEntry.warrior?.hp ?? 0
    if (hp <= 0) {
      console.log(`[Battle] react: ${defenderEntry.instanceId} fell — leaving for death_batch`)
      return
    }
    const playedTag = this._playActorAnim(defenderEntry.instanceId, 'hit')
    if (!playedTag) {
      // No hit animation defined — fall back to scale pop so SOMETHING
      // confirms they got hit.
      this._hitPop(defenderEntry.sprite)
    }
  }

  _hitPop(sprite) {
    if (!sprite) return
    const baseX = sprite.scaleX
    const baseY = sprite.scaleY
    this.tweens.add({
      targets: sprite,
      scaleX: baseX * 1.15,
      scaleY: baseY * 1.15,
      yoyo: true,
      duration: 90,
      ease: 'Quad.Out',
      onComplete: () => sprite.setScale(baseX, baseY),
    })
  }

  _wait(ms) {
    return new Promise(r => this.time.delayedCall(ms, r))
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
        entry.sprite = null
        entry.badge = null
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
          entry.sprite = null
          entry.badge = null
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

  _playRevive(step) {
    return new Promise((resolve) => {
      const id = step.revivedInstanceId
      this._addLogEntry(step.message ?? '')

      const side = id?.startsWith('p') ? 'player' : 'enemy'
      const arr = side === 'player' ? this.playerSprites : this.enemySprites
      const entry = this.spriteByInstance?.get(id)

      if (!entry || entry.died) {
        console.warn(`[Battle] revive: entry missing or died for ${id} — skipping reorder`)
        this._applyStatSnapshot(step)
        this._spawnFlavorPops(step.flavorEvents)
        this.time.delayedCall(200, resolve)
        return
      }

      const spliceToBack = () => {
        const idx = arr.indexOf(entry)
        if (idx === -1) { console.warn(`[Battle] revive: ${id} not found in ${side}Sprites`); return }
        arr.splice(idx, 1)
        arr.push(entry)
        console.log(`[Battle] revive: moved ${id} to back of ${side}Sprites (new index ${arr.length - 1})`)
      }

      // ── Death-Defy: quick slide to back + popup ──
      if (step.reviveKind !== 'reanimate') {
        spliceToBack()
        this._applyStatSnapshot(step)
        this._spawnFlavorPops(step.flavorEvents)
        this._reflowTeam(side)
        this.time.delayedCall(450, () => {
          console.log(`[Battle] revive (death-defy) resolved for ${id}`)
          resolve()
        })
        return
      }

      // ── Monster Reanimate: die → slide to back → rise → REANIMATED popup ──
      const warrior = entry.warrior
      const deathKey = warrior.art?.animTagOverrides?.death ?? 'death'
      const reverseKey = deathKey + '_reverse'
      const defaultTag = warrior.art?.defaultTag ?? 'idle'

      // 1. Play death anim (don't destroy sprite — unit survived)
      const hasDeath = entry.sprite.anims.exists(deathKey)
      if (hasDeath) entry.sprite.anims.play({ key: deathKey, repeat: 0 })
      console.log(`[Battle] reanimate ${id}: death anim=${hasDeath ? deathKey : 'NONE'}`)

      // 2. After death anim (or short pause), splice to back and slide
      let deathDone = false
      const onDeathComplete = () => {
        if (deathDone) return
        deathDone = true
        spliceToBack()
        this._reflowTeam(side)

        // 3. After slide settles: apply HP snapshot, play rise anim, spawn popup
        this.time.delayedCall(450, () => {
          this._applyStatSnapshot(step)
          const hasReverse = entry.sprite.anims.exists(reverseKey)
          console.log(`[Battle] reanimate ${id}: rise anim=${hasReverse ? reverseKey : 'NONE'}`)
          if (hasReverse) {
            entry.sprite.anims.play({ key: reverseKey, repeat: 0 })
            let riseDone = false
            const onRiseComplete = () => {
              if (riseDone) return
              riseDone = true
              if (entry.sprite.anims.exists(defaultTag)) {
                entry.sprite.anims.play({ key: defaultTag, repeat: -1 })
              }
              this._spawnFlavorPops(step.flavorEvents)
              console.log(`[Battle] reanimate resolved for ${id}`)
              resolve()
            }
            entry.sprite.once('animationcomplete', onRiseComplete)
            this.time.delayedCall(1200, onRiseComplete)
          } else {
            if (entry.sprite.anims.exists(defaultTag)) {
              entry.sprite.anims.play({ key: defaultTag, repeat: -1 })
            }
            this._spawnFlavorPops(step.flavorEvents)
            this.time.delayedCall(200, () => {
              console.log(`[Battle] reanimate resolved for ${id} (no rise anim)`)
              resolve()
            })
          }
        })
      }

      if (hasDeath) {
        entry.sprite.once('animationcomplete', onDeathComplete)
        this.time.delayedCall(1200, onDeathComplete) // watchdog if anim event misfires
      } else {
        this.time.delayedCall(300, onDeathComplete)
      }
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
            tutorial: this.tutorial,
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
            tutorial: this.tutorial,
            shopLocks: this.shopLocks.slice(),
            shopOffer: this.shopLocks.some(Boolean) ? this.shopOffer : null,
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
          tutorial: this.tutorial,
          shopLocks: this.shopLocks.slice(),
          shopOffer: this.shopLocks.some(Boolean) ? this.shopOffer : null,
        })
      } else {
        const newLosses = this.losses + 1
        if (newLosses >= 3) {
          // 3 losses — power-off transition to GameOver
          startSceneWithCrtPolicy(this, 'GameOver', {
            wins: this.wins, losses: newLosses,
            commander: this.commander,
            merchant: this.merchant,
            tutorial: this.tutorial,
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
          tutorial: this.tutorial,
          shopLocks: this.shopLocks.slice(),
          shopOffer: this.shopLocks.some(Boolean) ? this.shopOffer : null,
        })
      }
    })
  }
}
