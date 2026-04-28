import { Theme, PixelButton, PixelLabel, PixelPanel } from '../ui/index.js'

const DEPTH_DIM = 998
const DEPTH_BLOCKER = 999
const DEPTH_HIGHLIGHT = 1500
const DEPTH_PANEL = 1501
const SCREEN_MARGIN = 10
const TARGET_PAD = 8
const PANEL_W = 430
const PANEL_PAD = 14

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function unionRects(rects) {
  if (!rects.length) return null
  const x1 = Math.min(...rects.map(r => r.x))
  const y1 = Math.min(...rects.map(r => r.y))
  const x2 = Math.max(...rects.map(r => r.x + r.width))
  const y2 = Math.max(...rects.map(r => r.y + r.height))
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

function padRect(rect, pad) {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }
}

export class TutorialOverlay {
  constructor(scene, config = {}) {
    this.scene = scene
    this.steps = config.steps ?? []
    this.onComplete = config.onComplete ?? null
    this.onSkip = config.onSkip ?? null
    this.onBlockedPointerDown = config.onBlockedPointerDown ?? null
    this._index = 0
    this._objects = []
    this._listeners = []
    this._currentStep = null
    this._destroyed = false
    this._shutdownHandler = () => this.destroy()
  }

  start() {
    if (this._destroyed) return
    this.scene._tutorialActive = true
    this.scene.events.once('shutdown', this._shutdownHandler)
    this._buildNextEligibleStep()
  }

  destroy() {
    if (this._destroyed) return
    this._destroyed = true
    this._clearStep()
    this._removeListeners()
    if (this.scene) {
      this.scene._tutorialActive = false
      this.scene.events?.off?.('shutdown', this._shutdownHandler)
    }
  }

  _buildNextEligibleStep() {
    if (this._destroyed) return

    while (this._index < this.steps.length) {
      const step = this.steps[this._index]
      if (step.condition && !step.condition()) {
        console.log(`[Tutorial] Step "${step.id}" condition not met - skipping`)
        step.conditionFailureLog?.()
        console.log(`[Tutorial] Step "${step.id}" advanced (reason=condition)`)
        this._index += 1
        continue
      }
      this._currentStep = step
      this._buildStep(step)
      return
    }

    console.log('[Tutorial] Complete after final step')
    const onComplete = this.onComplete
    this.destroy()
    onComplete?.()
  }

  _buildStep(step) {
    const cam = this.scene.cameras.main
    const targetRects = this._resolveStepRects(step)
    const holeRect = unionRects(targetRects.map(r => padRect(r, TARGET_PAD)))
    const isEventAdvance = typeof step.advance === 'object' && step.advance?.event

    this._addDim(cam.width, cam.height)
    if (isEventAdvance && holeRect) {
      this._addInputBlockersAround(holeRect, cam.width, cam.height)
    } else {
      this._addFullInputBlocker(cam.width, cam.height)
    }

    if (step.ring && targetRects.length) this._addRings(targetRects)
    if (step.arrow && targetRects.length) this._addArrows(targetRects, step.arrow)
    if (step.pulseHint) {
      const hintRects = step.pulseHint() ?? []
      if (hintRects.length) this._addPulseHints(hintRects)
    }

    this._addPanel(step, targetRects)

    if (isEventAdvance) {
      const eventName = step.advance.event
      const handler = () => {
        this._advance('event')
      }
      this.scene.events.once(eventName, handler)
      this._listeners.push({ eventName, handler })
    }
  }

  _advance(reason) {
    if (this._destroyed || !this._currentStep) return
    console.log(`[Tutorial] Step "${this._currentStep.id}" advanced (reason=${reason})`)
    this._index += 1
    this._clearStep()
    this._buildNextEligibleStep()
  }

  _skip() {
    if (this._destroyed) return
    const stepId = this._currentStep?.id ?? 'unknown'
    console.log(`[Tutorial] Skipped at step "${stepId}"`)
    const onSkip = this.onSkip
    this.destroy()
    onSkip?.()
  }

  _clearStep() {
    this._removeListeners()
    const scene = this.scene
    this._objects.forEach((obj) => {
      try {
        scene?.tweens?.killTweensOf(obj)
        obj?.destroy?.()
      } catch (e) {
        console.error('[Tutorial] Failed to destroy overlay object:', e)
      }
    })
    this._objects = []
  }

  _removeListeners() {
    if (!this.scene?.events) return
    this._listeners.forEach(({ eventName, handler }) => {
      this.scene.events.off(eventName, handler)
    })
    this._listeners = []
  }

  _track(obj, depth = null) {
    if (depth !== null && obj?.setDepth) obj.setDepth(depth)
    this._objects.push(obj)
    return obj
  }

  _addDim(width, height) {
    const dim = this.scene.add.graphics()
    dim.fillStyle(0x000000, 0.58)
    dim.fillRect(0, 0, width, height)
    this._track(dim, DEPTH_DIM)
  }

  _addFullInputBlocker(width, height) {
    const blocker = this.scene.add.rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0)
      .setInteractive()
    blocker.on('pointerdown', (pointer) => this.onBlockedPointerDown?.(pointer))
    this._track(blocker, DEPTH_BLOCKER)
  }

  _addInputBlockersAround(hole, width, height) {
    const x1 = clamp(hole.x, 0, width)
    const y1 = clamp(hole.y, 0, height)
    const x2 = clamp(hole.x + hole.width, 0, width)
    const y2 = clamp(hole.y + hole.height, 0, height)
    const rects = [
      { x: 0, y: 0, width, height: y1 },
      { x: 0, y: y2, width, height: height - y2 },
      { x: 0, y: y1, width: x1, height: y2 - y1 },
      { x: x2, y: y1, width: width - x2, height: y2 - y1 },
    ]

    rects
      .filter(r => r.width > 0 && r.height > 0)
      .forEach((r) => {
        const blocker = this.scene.add.rectangle(r.x, r.y, r.width, r.height, 0x000000, 0)
          .setOrigin(0)
          .setInteractive()
        blocker.on('pointerdown', (pointer) => this.onBlockedPointerDown?.(pointer))
        this._track(blocker, DEPTH_BLOCKER)
      })
  }

  _addRings(rects) {
    const ring = this.scene.add.graphics()
    ring.lineStyle(2, Theme.accent, 1)
    rects.forEach((rect) => {
      const r = padRect(rect, TARGET_PAD)
      ring.strokeRoundedRect(r.x, r.y, r.width, r.height, 6)
    })
    this._track(ring, DEPTH_HIGHLIGHT)
    this.scene.tweens.add({
      targets: ring,
      alpha: { from: 0.45, to: 1 },
      duration: 750,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    })
  }

  _addPulseHints(rects) {
    const hint = this.scene.add.graphics()
    hint.lineStyle(1, Theme.accent, 1)
    rects.forEach((rect) => {
      hint.strokeRoundedRect(rect.x, rect.y, rect.width, rect.height, 6)
    })
    hint.setAlpha(0.18)
    this._track(hint, DEPTH_HIGHLIGHT - 1)
    this.scene.tweens.add({
      targets: hint,
      alpha: { from: 0.18, to: 0.55 },
      duration: 1100,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    })
  }

  _addArrows(rects, direction) {
    const arrow = this.scene.add.graphics()
    arrow.fillStyle(Theme.warning, 1)

    rects.forEach((rect) => {
      const cx = rect.x + rect.width / 2
      const cy = rect.y + rect.height / 2
      if (direction === 'up') {
        const y = rect.y + rect.height + TARGET_PAD
        arrow.fillTriangle(cx, y, cx - 9, y + 18, cx + 9, y + 18)
      } else if (direction === 'left') {
        const x = rect.x + rect.width + TARGET_PAD
        arrow.fillTriangle(x, cy, x + 18, cy - 9, x + 18, cy + 9)
      } else if (direction === 'right') {
        const x = rect.x - TARGET_PAD
        arrow.fillTriangle(x, cy, x - 18, cy - 9, x - 18, cy + 9)
      } else {
        const y = rect.y - TARGET_PAD
        arrow.fillTriangle(cx, y, cx - 9, y - 18, cx + 9, y - 18)
      }
    })

    this._track(arrow, DEPTH_HIGHLIGHT)
  }

  _addPanel(step, targetRects) {
    const { width, height } = this.scene.cameras.main
    const titleText = step.title ?? ''
    const bodyText = step.body ?? ''
    const hasTitle = titleText.length > 0
    const contentMaxW = PANEL_W - PANEL_PAD * 2

    // Pre-build body off-screen so Phaser wraps with real m5x7 char advance
    // (manual scale-based math underestimates width — see RulesScene comment).
    // Use getTextBounds().local.height — Phaser 4 BitmapText `.height` returns
    // 0 / pre-wrap height before first render, so a title-less step would
    // collapse the panel and the body would never appear (regression seen in
    // the stage-1 tutorial after the "lives" step).
    const body = new PixelLabel(this.scene, -10000, -10000, bodyText, {
      scale: 1, color: 'primary',
    })
    body.setLineSpacing(2)
    body.setMaxWidth(contentMaxW)
    const measuredBodyH = body.getTextBounds(false)?.local?.height ?? 0
    const bodyHeight = Math.max(10, measuredBodyH || body.height || 0)
    const bodyTopOffset = hasTitle ? 38 : 14
    const panelH = (hasTitle ? 76 : 52) + bodyHeight + 14
    const anchorRect = unionRects(targetRects)
    const isCenter = step.anchor === 'center' || !anchorRect
    const pos = isCenter
      ? { x: Math.round((width - PANEL_W) / 2), y: Math.round((height - panelH) / 2) }
      : this._positionPanelNear(anchorRect, PANEL_W, panelH, width, height)

    const panel = new PixelPanel(this.scene, pos.x, pos.y, PANEL_W, panelH, {
      bg: Theme.panelBg,
      border: Theme.panelBorder,
    })
    this._track(panel, DEPTH_PANEL)

    if (hasTitle) {
      const title = new PixelLabel(this.scene, pos.x + PANEL_PAD, pos.y + 12, titleText, {
        scale: 2, color: 'critical',
      })
      this._track(title, DEPTH_PANEL)
    }

    body.setPosition(pos.x + PANEL_PAD, pos.y + bodyTopOffset)
    this._track(body, DEPTH_PANEL)

    const singleStep = this.steps.length === 1
    const isClickAdvance = step.advance === 'click' || !step.advance
    if (isClickAdvance) {
      const label = singleStep ? 'OK' : 'NEXT >'
      const next = new PixelButton(this.scene, pos.x + PANEL_W - 68, pos.y + panelH - 28, label, () => {
        this._advance('click')
      }, { style: 'filled', scale: 2, bg: Theme.accent, width: 94, height: 30, cornerRadius: 4 })
      this._track(next, DEPTH_PANEL)
    }

    const skipLabel = singleStep ? 'STOP' : 'SKIP'
    const skip = new PixelButton(this.scene, pos.x + PANEL_W - 62, pos.y + 10, skipLabel, () => {
      if (singleStep) {
        this._skip()
      } else {
        this._showSkipConfirm()
      }
    }, { style: 'text', scale: 1 })
    this._track(skip, DEPTH_PANEL)
  }

  _showSkipConfirm() {
    if (this._confirmOpen) return
    this._confirmOpen = true
    const { width, height } = this.scene.cameras.main
    const panelW = 310
    const panelH = 110
    const x = Math.round((width - panelW) / 2)
    const y = Math.round((height - panelH) / 2)

    const panel = new PixelPanel(this.scene, x, y, panelW, panelH, {
      bg: Theme.panelBg,
      border: Theme.warning,
    })
    this._track(panel, DEPTH_PANEL + 1)

    const label = new PixelLabel(this.scene, width / 2, y + 18, 'SKIP TUTORIAL?', {
      scale: 2, color: 'warning', align: 'center',
    })
    this._track(label, DEPTH_PANEL + 1)

    const copy = new PixelLabel(this.scene, width / 2, y + 44, 'YOU CAN REPLAY IT NEXT RUN.', {
      scale: 1, color: 'muted', align: 'center',
    })
    this._track(copy, DEPTH_PANEL + 1)

    const yes = new PixelButton(this.scene, width / 2 - 56, y + 82, 'YES', () => {
      this._skip()
    }, { style: 'filled', scale: 2, bg: Theme.error, width: 78, height: 30, cornerRadius: 4 })
    this._track(yes, DEPTH_PANEL + 1)

    const no = new PixelButton(this.scene, width / 2 + 56, y + 82, 'NO', () => {
      this._confirmOpen = false
      ;[panel, label, copy, yes, no].forEach((obj) => {
        const idx = this._objects.indexOf(obj)
        if (idx >= 0) this._objects.splice(idx, 1)
        obj.destroy()
      })
    }, { style: 'filled', scale: 2, bg: Theme.accentDim, width: 78, height: 30, cornerRadius: 4 })
    this._track(no, DEPTH_PANEL + 1)
  }

  _positionPanelNear(rect, panelW, panelH, screenW, screenH) {
    const cx = rect.x + rect.width / 2
    const targetAboveCenter = rect.y + rect.height / 2 < screenH / 2
    const x = clamp(Math.round(cx - panelW / 2), SCREEN_MARGIN, screenW - panelW - SCREEN_MARGIN)
    const yBelow = Math.round(rect.y + rect.height + 28)
    const yAbove = Math.round(rect.y - panelH - 28)
    const preferredY = targetAboveCenter ? yBelow : yAbove
    const fallbackY = targetAboveCenter ? yAbove : yBelow
    const y = preferredY >= SCREEN_MARGIN && preferredY + panelH <= screenH - SCREEN_MARGIN
      ? preferredY
      : fallbackY
    return {
      x,
      y: clamp(y, SCREEN_MARGIN, screenH - panelH - SCREEN_MARGIN),
    }
  }

  _resolveStepRects(step) {
    if (step.anchor === 'center') return []
    if (step.bounds) {
      const rect = step.bounds()
      return rect ? [rect] : []
    }
    if (Array.isArray(step.targets)) {
      return step.targets
        .map(fn => this._boundsForObject(fn?.()))
        .filter(Boolean)
    }
    if (step.target) {
      const rect = this._boundsForObject(step.target())
      return rect ? [rect] : []
    }
    return []
  }

  _boundsForObject(obj) {
    if (!obj) return null

    try {
      const b = obj.getBounds?.()
      if (b && b.width > 0 && b.height > 0) {
        return { x: b.x, y: b.y, width: b.width, height: b.height }
      }
    } catch (e) {
      console.error('[Tutorial] getBounds failed:', e)
    }

    const p = this._worldPos(obj)
    if (obj.cardW && obj.cardH) {
      return {
        x: p.x - obj.cardW * Math.abs(obj.scaleX ?? 1) / 2,
        y: p.y - obj.cardH * Math.abs(obj.scaleY ?? 1) / 2,
        width: obj.cardW * Math.abs(obj.scaleX ?? 1),
        height: obj.cardH * Math.abs(obj.scaleY ?? 1),
      }
    }
    if (obj.btnW && obj.btnH) {
      return {
        x: p.x - obj.btnW * Math.abs(obj.scaleX ?? 1) / 2,
        y: p.y - obj.btnH * Math.abs(obj.scaleY ?? 1) / 2,
        width: obj.btnW * Math.abs(obj.scaleX ?? 1),
        height: obj.btnH * Math.abs(obj.scaleY ?? 1),
      }
    }
    if (obj.width > 0 && obj.height > 0) {
      const sx = Math.abs(obj.scaleX ?? 1)
      const sy = Math.abs(obj.scaleY ?? 1)
      return {
        x: p.x - obj.width * sx * (obj.originX ?? 0),
        y: p.y - obj.height * sy * (obj.originY ?? 0),
        width: obj.width * sx,
        height: obj.height * sy,
      }
    }
    return null
  }

  _worldPos(obj) {
    try {
      const matrix = obj.getWorldTransformMatrix?.()
      const point = matrix?.transformPoint?.(0, 0, { x: 0, y: 0 })
      if (point) return point
    } catch (e) {
      console.error('[Tutorial] world transform failed:', e)
    }

    let x = obj.x ?? 0
    let y = obj.y ?? 0
    let parent = obj.parentContainer
    while (parent) {
      x += parent.x ?? 0
      y += parent.y ?? 0
      parent = parent.parentContainer
    }
    return { x, y }
  }

}
