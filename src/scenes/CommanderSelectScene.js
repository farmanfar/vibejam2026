import { Scene } from 'phaser';
import { Theme, FONT_KEY } from '../ui/index.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { getCommanders, pickRandomCommanders } from '../config/commanders.js';
import { SelectionMenuWidget } from '../widgets/SelectionMenuWidget.js';
import { SceneCrt, startSceneWithCrtPolicy } from '../rendering/SceneCrt.js';
import { SceneDust } from '../rendering/SceneDust.js';
import { attachOutlineToSprite } from '../rendering/OutlineController.js';
import { GhostManager } from '../systems/GhostManager.js';
import { attachGeneratedNormalMap } from '../rendering/NormalMapGenerator.js';
import { TutorialOverlay } from '../widgets/TutorialOverlay.js';
import { AchievementManager } from '../systems/AchievementManager.js';

// Commander normal maps are generated once per page-load on first visit.
// Guard prevents redundant canvas work on re-entry (swap-every-3-wins flow).
let _commanderNormalsAttached = false;

// Translate legacy capture --view names to current widget view IDs
const LEGACY_VIEW_MAP = {
  leftWall:     'left',
  rightWall:    'right',
  tvClose:      'previewClose',
  center:       'center',
  featuredClose: 'featuredClose',
}

export class CommanderSelectScene extends Scene {
  constructor() {
    super('CommanderSelect')
  }

  preload() {
    for (const cmd of getCommanders()) {
      const key = `commander-sprite-${cmd.spriteIndex}`
      if (!this.textures.exists(key)) {
        this.load.image(key, `assets/commanders/sprites/Sprite${cmd.spriteIndex}.png`)
      }
    }
  }

  init(data) {
    this._runId            = data.runId
    this._tutorial         = data.tutorial === true
    this._fixedCommanders  = data.commanders ?? null
    this._captureView      = data.captureView ?? null
    this._widget           = null
    // Hover-light state (Light2D port of HammerTime grandma lighting).
    // _lightState is a plain object used as a Phaser tween target — scenes
    // themselves are NOT reliable tween targets (verified: tween on `this`
    // with numeric property never animated).
    this._hoverLight       = null
    this._litSprite        = null
    this._lightState       = { baseIntensity: 0, flickerTime: 0 }
    this._archiveText      = null
    this._archiveScrollBar = null
    this._archiveRows      = null
    this._archiveScroll    = 0
    this._archiveViewMode  = 'center'
    this._archiveLayout    = null
    this._archiveWheelHandler = null
    console.log(`[Commander] Init - runId: ${this._runId}, tutorial: ${this._tutorial}, fixed: ${!!this._fixedCommanders}`)
  }

  create() {
    this.cameras.main.setBackgroundColor(Theme.screenBg)

    // CRT post-process (softGameplay — interactive scene, lighter curvature)
    SceneCrt.attach(this, 'softGameplay')
    // Ambient dust — cool blue embers rising from below
    SceneDust.attach(this, 'commanderSelect')

    // Phaser 4 Light2D — moderate ambient so resting commanders remain
    // readable while leaving ~60% dynamic range for the hover point light
    // to sculpt individual pixels on hover. Only objects with
    // setLighting(true) are affected — non-lit UI renders at full
    // brightness unchanged.
    if (this.sys.renderer.gl) {
      // Ambient ~28% brightness (pass-two value after pass-one read as
      // "real subtle"): leaves ~72% headroom so the warm hover light lifts
      // per-pixel normals into clearly distinct shading rather than a flat
      // wash. Resting commanders are visibly dim but still legible.
      this.lights.enable().setAmbientColor(0x5a5862)
      console.log('[Commander] Lighting enabled — ambient 0x5a5862')

      // Floor receiver: tall enough to cover feet in BOTH views:
      //   - center view: feet at y~378
      //   - featuredClose view: feet at y~505
      // y=445 center, height 220 → spans y=335..555 (covers both).
      // Without this, the light center lands below the plane in featuredClose
      // and almost none of the halo renders.

      // Generate commander normal maps on first visit. Deferred from BootScene
      // because only this scene uses Lights2D against these textures.
      if (!_commanderNormalsAttached) {
        _commanderNormalsAttached = true
        const commanders = getCommanders()
        let generated = 0, skipped = 0
        for (const cmd of commanders) {
          const key = `commander-sprite-${cmd.spriteIndex}`
          if (attachGeneratedNormalMap(this, key, { bumpStrength: 3.5 })) generated++
          else skipped++
        }
        console.log(`[Commander] Normal maps: ${generated} generated, ${skipped} skipped (bumpStrength 3.5)`)
      }
    }

    // Per-frame shimmer: two-sine torch flicker on the hover light intensity.
    // Reads _lightState.baseIntensity (tween-animated) and writes the live
    // light intensity. Keeps the tween and render side independent.
    this._frameCounter = 0
    this.events.on('update', (_t, delta) => {
      if (!this._hoverLight) return
      this._lightState.flickerTime += delta * 0.001
      const t       = this._lightState.flickerTime
      const shimmer = 1 + 0.04 * (Math.sin(t * 6.7) * 0.55 + Math.sin(t * 11.3) * 0.45)
      this._hoverLight.intensity = this._lightState.baseIntensity * shimmer
      // DEBUG (keep until visually dialed-in): log once per second while light is active
      this._frameCounter++
      if (this._frameCounter % 60 === 0) {
        console.log(`[Commander] light tick base=${this._lightState.baseIntensity.toFixed(2)} ` +
                    `rendered=${this._hoverLight.intensity.toFixed(2)} ` +
                    `xy=(${this._hoverLight.x.toFixed(0)}, ${this._hoverLight.y.toFixed(0)}) ` +
                    `r=${this._hoverLight.radius} lightsActive=${this.lights.active} ` +
                    `lightsCount=${this.lights.lights?.length ?? '?'}`)
      }
    })

    // Scene teardown: cancel tweens, destroy the hover light and floor.
    // `this.lights` is scene-scoped and torn down by Phaser automatically;
    // the 'update' listener is cleaned up by the scene emitter lifecycle.
    this.events.once('shutdown', () => {
      this.tweens.killTweensOf(this._lightState)
      if (this._hoverLight) {
        // Light objects are removed via LightsManager.removeLight (not destroy).
        try { this.lights?.removeLight?.(this._hoverLight) } catch (_) { /* scene tearing down */ }
        this._hoverLight = null
      }
      if (this._litSprite) {
        try { this._litSprite.setLighting(false) } catch (_) { /* sprite already gone */ }
        this._litSprite = null
      }
      this._lightState.baseIntensity = 0
      this._lightState.flickerTime   = 0
      console.log('[Commander] Lighting teardown complete')
    })

    // Battle Archive teardown: drop wheel/keyboard listeners. The text and
    // scrollbar GameObjects belong to the widget's preview container, which
    // Phaser destroys when the scene shuts down.
    this.events.once('shutdown', () => {
      if (this._archiveWheelHandler) {
        this.input.off('wheel', this._archiveWheelHandler)
        this._archiveWheelHandler = null
      }
      this._archiveText      = null
      this._archiveScrollBar = null
      this._archiveLayout    = null
      this._archiveRows      = null
      console.log('[Archive] Teardown complete')
    })

    const choices   = this._fixedCommanders ?? pickRandomCommanders(3)
    const remaining = getCommanders().filter(c => !choices.some(ch => ch.id === c.id))
    const initialView = LEGACY_VIEW_MAP[this._captureView] ?? this._captureView ?? 'center'

    console.log(`[Commander] Featured: ${choices.map(c => c.name).join(', ')}`)
    console.log(`[Commander] Trophy walls: left=${Math.min(remaining.length, 11)}, right=${Math.min(Math.max(remaining.length - 11, 0), 11)}`)
    console.log(`[Commander] Sprite scale multiplier: 2x`)

    this._widget = new SelectionMenuWidget(this, {
      items: {
        featured:   choices,
        leftPanel:  remaining.slice(0, 11),
        rightPanel: remaining.slice(11, 22),
        preview:    choices.slice(0, 2),
      },
      text: {
        headerTitle: 'SELECT A COMMANDER',
        actionLabels: {
          back:           'BACK',
          confirm:        'EMBARK',
          primary:        'MOVE IN',
          secondaryLeft:  'PREV',
          secondaryRight: 'NEXT',
        },
        regionTitles: {
          leftPanel:     'WEST WING',
          rightPanel:    'EAST WING',
          preview:       'BATTLE ARCHIVE',
          previewFooter: 'TOP 10 RUNS',
        },
      },
      visuals: {
        textureKeyForItem: (item) => `commander-sprite-${item.spriteIndex}`,
        labelForItem:      (item) => item.name.toUpperCase(),
        subtitleForItem:   (item) => `#${item.spriteIndex}`,
        abilityForItem:    (item) => item.rule?.description ?? '',
        spriteScale:       2,
        onSpriteCreated:   (sprite) => attachOutlineToSprite(sprite),
        // Featured-only: enable Light2D shading on the three featured
        // commanders so the hover point light can sculpt them dimensionally.
        // Panel + preview sprites stay flat (no lighting) to avoid ambient
        // affecting trophy-wall art that the user isn't interacting with.
        onFeaturedSpriteCreated: (sprite, item) => {
          if (!this.sys.renderer.gl) return
          // Featured sprites switch into Light2D on hover. Their outline filter
          // path fights that render path, so keep outlines on panel/preview art
          // only and clear them on the featured trio.
          sprite.filters?.internal?.clear?.()
          const hasNormal = !!(sprite.texture?.dataSource && sprite.texture.dataSource[0])
          console.log(`[Commander] featured sprite ${item?.name}: lighting=${sprite.lighting} ` +
                      `hasNormalMap=${hasNormal} texKey=${sprite.texture?.key}`)
        },
        previewContentBuilder: (scene, container, { screenX, screenY, screenW, screenH, floorY }) => {
          // Inner padding inside the screen rect — text never draws into the
          // bezel/casing. Names are truncated per-mode so each entry stays a
          // single line (m5x7 char advance ≈ fontSize * 6/7); the rendered
          // slice is windowed by scroll offset so we never exit the rect.
          const padX     = 4
          const padY     = 6
          const innerW   = screenW - padX * 2
          const innerTop = screenY - screenH / 2 + padY
          // Bottom edge clips above the visual TV floor line so list rows
          // never appear to spill onto the lower panel below the screen.
          const screenBottom = screenY + screenH / 2 - padY
          const innerBottom  = floorY != null ? Math.min(screenBottom, floorY - 2) : screenBottom
          const innerH       = innerBottom - innerTop
          const innerLeft    = screenX - innerW / 2

          this._archiveLayout = {
            screenX, screenY, screenW, screenH,
            innerW, innerH, innerTop, innerLeft, padX, padY,
            container,
          }

          this._archiveText = scene.add.bitmapText(screenX, innerTop, FONT_KEY, 'LOADING ARCHIVE...', 8)
            .setOrigin(0.5, 0)
            .setTint(Theme.mutedText)
          container.add(this._archiveText)

          // Scrollbar thumb — drawn against the right inner edge of the screen.
          // Hidden by default; shown only when the active view's line count
          // exceeds the visible window.
          this._archiveScrollBar = scene.add.rectangle(
            innerLeft + innerW - 1, innerTop, 2, 8, Theme.accent, 0.7,
          ).setOrigin(0.5, 0).setVisible(false)
          container.add(this._archiveScrollBar)

          console.log('[Archive] Preview content built — fetching top ghosts')
          GhostManager.fetchTopGhosts().then(rows => {
            if (!this.scene.isActive() || !this._archiveText) {
              console.log('[Archive] Fetch resolved after scene shutdown — discarding')
              return
            }
            if (rows === null) {
              this._archiveRows = null
              this._archiveText.setText('ARCHIVE OFFLINE')
              this._archiveScrollBar?.setVisible(false)
              console.warn('[Archive] Fetch failed — showing offline state')
              return
            }
            if (rows.length === 0) {
              this._archiveRows = []
              this._archiveText.setText('NO RUNS YET')
              this._archiveScrollBar?.setVisible(false)
              console.log('[Archive] No ghost entries yet')
              return
            }
            this._archiveRows   = rows.slice(0, 10)
            this._archiveScroll = 0
            this._renderArchive()
          })

          // Mouse wheel — only acts while the Battle Archive is the focused
          // (zoomed) view. Scrolls one entry per notch. Keyboard arrows are
          // reserved by SelectionMenuWidget for view navigation, so wheel is
          // the sole input here.
          this._archiveWheelHandler = (_pointer, _objs, _dx, dy) => {
            if (this._archiveViewMode !== 'previewClose') return
            if (!this._archiveRows || this._archiveRows.length === 0) return
            const dir = dy > 0 ? 1 : -1
            this._scrollArchive(dir, 'wheel')
          }
          scene.input.on('wheel', this._archiveWheelHandler)
        },
      },
      actions: {
        onSelectionChange: (_item) => {
          // Selection state is reflected by panel gold border + EMBARK button enablement
        },
        onViewChange: (viewId) => {
          this._archiveViewMode = viewId
          // Reset scroll when leaving the zoomed view so the user always
          // re-enters at the top of the list.
          if (viewId !== 'previewClose') this._archiveScroll = 0
          if (this._archiveText) this._renderArchive()
          console.log(`[Archive] View → ${viewId}`)
        },
        onFeaturedHoverEnter: (_i, item, sprite) => {
          if (!sprite || !this.sys.renderer.gl) return
          if (this._litSprite && this._litSprite !== sprite) {
            this._litSprite.setLighting(false)
          }
          this._litSprite = sprite
          sprite.setLighting(true)
          // Transform the sprite's LOCAL torso point (40% down from top)
          // through its full world matrix. Walks parent container scale,
          // view tweens, and origin offsets automatically. Torso anchor
          // puts the whole silhouette inside the hot spot instead of just
          // the feet.
          const m          = sprite.getWorldTransformMatrix()
          const localTorsoX = (sprite.width  ?? 0) * (0.5 - (sprite.originX ?? 0.5))
          const localTorsoY = (sprite.height ?? 0) * (0.4 - (sprite.originY ?? 0.5))
          const torso       = m.transformPoint(localTorsoX, localTorsoY, { x: 0, y: 0 })

          // TEMP debug: remove after visual calibration.
          console.log(`[Commander] hover ${item?.name} torso=${torso.x.toFixed(0)},${torso.y.toFixed(0)} ` +
                      `light=${this._hoverLight ? 'reposition' : 'create'}`)

          if (!this._hoverLight) {
            // lights.addLight(x, y, radius, rgbInt, intensity, z)
            // Warm firelight (less saturated than pure orange), radius 270
            // (covers full commander silhouette from torso anchor on
            // normally-proportioned sprites). z=28 keeps a grazing angle
            // so per-pixel normals cast distinct shading instead of a
            // flat top-down wash.
            this._hoverLight = this.lights.addLight(torso.x, torso.y, 270, 0xffb060, 0, 28)
            console.log(`[Commander] addLight OK: obj=${!!this._hoverLight} ` +
                        `color=${JSON.stringify(this._hoverLight?.color)} ` +
                        `radius=${this._hoverLight?.radius}`)
          } else {
            this._hoverLight.x = torso.x
            this._hoverLight.y = torso.y
          }

          // Tween the BASE intensity on the plain _lightState object.
          // Target 1.7 — clearly sculpted warm accent against 0x606068
          // ambient without clipping highlights to white.
          this.tweens.killTweensOf(this._lightState)
          this.tweens.add({
            targets:       this._lightState,
            baseIntensity: 1.9,
            duration:      220,
            ease:          'Sine.easeOut',
          })
        },
        onFeaturedHoverLeave: () => {
          if (!this._hoverLight) return
          const spriteToDisable = this._litSprite
          this.tweens.killTweensOf(this._lightState)
          this.tweens.add({
            targets:       this._lightState,
            baseIntensity: 0,
            duration:      220,
            ease:          'Sine.easeIn',
            onComplete:    () => {
              if (this._litSprite === spriteToDisable) {
                try { spriteToDisable?.setLighting(false) } catch (_) { /* sprite already gone */ }
                this._litSprite = null
              }
            },
          })
        },
        onConfirm: (item) => {
          console.log(`[Commander] Embarking with ${item.name} (${item.id})`)
          AchievementManager.onRunStart({ runId: this._runId, mode: this._tutorial ? 'tutorial' : 'standard' })
          // Power-off plays on run start (CommanderSelect → Shop)
          startSceneWithCrtPolicy(this, 'Shop', {
            stage: 1, gold: 10, wins: 0, losses: 0, team: [],
            runId: this._runId,
            commander: item,
            tutorial: this._tutorial,
          })
        },
        onBack: () => {
          console.log('[Commander] Returning to menu')
          this.scene.start('Menu')
        },
      },
      options: {
        initialView,
        initialFocus:   'featured',
        enableKeyboard: true,
        showLeftPanel:  true,
        showRightPanel: true,
        showPreview:    true,
      },
    })

    // Widget self-registers its own shutdown cleanup (LayoutEditor + keyboard)
    finalizeCaptureScene('CommanderSelect')

    if (this._tutorial) this._startCommanderTutorial()
  }

  _startCommanderTutorial() {
    if (this._tutorialOverlay) return
    console.log('[Tutorial] CommanderSelect overlay starting (tutorial mode)')

    this._tutorialOverlay = new TutorialOverlay(this, {
      steps: [
        {
          id: 'pick-commander',
          anchor: 'center',
          body: 'just pick a dude',
          advance: 'click',
        },
      ],
      onComplete: () => {
        this._tutorialOverlay = null
        console.log('[Tutorial] CommanderSelect overlay complete')
      },
      onSkip: () => {
        this._tutorialOverlay = null
        console.log('[Tutorial] CommanderSelect overlay skipped')
      },
    })
    this._tutorialOverlay.start()
  }

  // ---------------------------------------------------------------------------
  // Battle Archive — windowed scrollable list
  // ---------------------------------------------------------------------------
  // Lines render only inside the screen rect (innerW × innerH in container-
  // local coords). We compute how many lines fit at the active font size and
  // render only that slice — no overflow can leak into the bezel/casing.
  // The container's view-driven scale (1.62× in previewClose) propagates to
  // the text and scrollbar automatically since they're container children.

  _scrollArchive(direction, reason) {
    if (!this._archiveRows || this._archiveRows.length === 0) return
    const before = this._archiveScroll
    this._archiveScroll = before + direction
    this._renderArchive()
    if (this._archiveScroll !== before) {
      console.log(`[Archive] Scroll ${before} → ${this._archiveScroll} (${reason})`)
    }
  }

  _renderArchive() {
    const text = this._archiveText
    const bar  = this._archiveScrollBar
    const L    = this._archiveLayout
    if (!text || !L) return

    const zoomed   = this._archiveViewMode === 'previewClose'
    const fontSize = zoomed ? 10 : 8

    // Awaiting fetch / status messages — keep current text, just resize and
    // re-center it so loading / offline / empty placeholders match the view.
    if (!this._archiveRows || this._archiveRows.length === 0) {
      text.setFontSize(fontSize)
      text.setOrigin(0.5, 0)
      text.setX(L.screenX)
      text.setY(L.innerTop)
      bar?.setVisible(false)
      return
    }
    // RetroFont line spacing = (CELL_H / GLYPH_H) * fontSize = (8/7) * fontSize.
    const lineH    = (8 / 7) * fontSize
    // Char advance ≈ (CELL_W / GLYPH_H) * fontSize = (6/7) * fontSize.
    const charW    = (6 / 7) * fontSize
    const maxChars = Math.max(8, Math.floor(L.innerW / charW))
    // Reserve right-edge column for the scrollbar so text never sits under it.
    const lineCharBudget = maxChars - 2

    // Center view shows a teaser (top 5); zoomed view shows the full top 10.
    // Scrolling is meaningful only when the dataset exceeds what fits in the
    // visible window — typically in the zoomed view.
    const dataset      = zoomed ? this._archiveRows : this._archiveRows.slice(0, 5)
    const visibleLines = Math.max(1, Math.floor(L.innerH / lineH))
    const total        = dataset.length
    const maxOffset    = Math.max(0, total - visibleLines)
    if (this._archiveScroll > maxOffset) this._archiveScroll = maxOffset
    if (this._archiveScroll < 0)         this._archiveScroll = 0

    const slice = dataset
      .slice(this._archiveScroll, this._archiveScroll + visibleLines)
      .map((r, idx) => {
        const i      = this._archiveScroll + idx + 1
        const num    = `${i}.`.padEnd(3) // "1. " through "10."
        const tail   = ` ${r.wins}W-${r.losses}L`
        const nameBudget = Math.max(3, lineCharBudget - num.length - tail.length)
        const name   = (r.nickname || 'ANON').slice(0, nameBudget)
        return `${num}${name}${tail}`
      })

    text.setFontSize(fontSize)
    text.setText(slice.join('\n'))
    text.setOrigin(0, 0)
    text.setX(L.innerLeft)
    text.setY(L.innerTop)

    // Scrollbar — only when overflow exists in the active mode.
    const overflowing = total > visibleLines
    if (overflowing) {
      const trackH = L.innerH
      const thumbH = Math.max(8, Math.floor(trackH * (visibleLines / total)))
      const travel = trackH - thumbH
      const t      = maxOffset === 0 ? 0 : this._archiveScroll / maxOffset
      bar.setVisible(true)
      bar.setSize(2, thumbH)
      bar.setX(L.innerLeft + L.innerW - 1)
      bar.setY(L.innerTop + travel * t)
    } else {
      bar.setVisible(false)
    }
  }
}
