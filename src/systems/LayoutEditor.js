import { FONT_KEY } from '../ui/index.js'
import layoutOverrides from '../config/layout-overrides.json'

const STORAGE_PREFIX = 'layout_'
const GAME_W = 960
const GAME_H = 540
const GRID_SIZES = [0, 8, 16, 32]  // 0 = off
const SCALE_FACTOR = 1.1            // 10% per step

/**
 * F2 Layout Editor — runtime debug tool for repositioning and scaling UI elements.
 *
 * Usage:
 *   LayoutEditor.init(game)           — call once from main.js
 *   LayoutEditor.register(scene, id, element, defaultX, defaultY) — in each scene's create()
 *   LayoutEditor.unregisterScene(key) — on scene shutdown
 *
 * Edit mode hotkeys:
 *   F2        — toggle edit mode
 *   [ / ]     — scale selected element down / up (10% per step)
 *   G         — cycle grid snap: OFF → 8px → 16px → 32px → OFF
 *   R         — reset selected element to default position + scale
 *   Escape    — deselect current element
 *
 * Positions + scale persist in localStorage.
 * Use LayoutEditor.exportJSON() in console to dump for layout-overrides.json.
 *
 * Priority: localStorage > layout-overrides.json > hardcoded defaults
 */
export class LayoutEditor {
  static _game = null
  static _enabled = false
  static _registry = new Map()   // 'Scene.elementId' -> { element, defaultX, defaultY, defaultScale, scene }
  static _overlays = []          // { key, text } — BitmapText position labels
  static _dragState = null       // { key, element, offsetX, offsetY, startX, startY }
  static _selectedKey = null     // persists after drag for hotkey targeting
  static _gridSize = 0           // 0 = off, 8, 16, 32
  static _gridOverlay = null     // Phaser Graphics object for grid lines
  static _selectionRect = null   // Phaser Graphics object for selection highlight
  static _bannerEl = null        // DOM element for edit mode banner
  static _onDown = null
  static _onMove = null
  static _onUp = null
  static _onKey = null

  /**
   * Initialize the layout editor. Call once after new Game().
   * @param {Phaser.Game} game
   */
  static init(game) {
    this._game = game

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault()
        this.toggle()
      }
    })

    // Expose to browser console for export/clear commands
    window.LayoutEditor = this

    console.log('[Editor] LayoutEditor initialized. Press F2 to toggle edit mode.')
    console.log('[Editor] Console commands: LayoutEditor.exportJSON(), LayoutEditor.clearAll()')
  }

  // ── Registration ──────────────────────────────────────────────────────

  /**
   * Register a UI element for layout editing.
   * Applies any saved overrides (position + scale) immediately.
   */
  static register(scene, elementId, element, defaultX, defaultY) {
    const key = `${scene.scene.key}.${elementId}`
    const defaultScale = element.scaleX ?? 1

    // Resolve overrides: localStorage > JSON > default
    const overrides = this._resolveOverrides(scene.scene.key, elementId, defaultX, defaultY, defaultScale)
    element.x = overrides.x
    element.y = overrides.y
    if (overrides.scale !== defaultScale) {
      element.setScale(overrides.scale)
      console.log(`[Layout] ${key} scale override: ${defaultScale} → ${overrides.scale}`)
    }

    this._registry.set(key, { element, defaultX, defaultY, defaultScale, scene })

    const s = Math.round(element.scaleX * 100) / 100
    console.log(`[Layout] ${key} at (${Math.round(overrides.x)}, ${Math.round(overrides.y)}) scale=${s}`)

    // If edit mode is already active, show overlay for this element
    if (this._enabled) {
      this._showOverlay(key, element, scene)
    }
  }

  /**
   * Resolve position + scale overrides using three-tier priority.
   * @returns {{ x: number, y: number, scale: number }}
   */
  static _resolveOverrides(sceneKey, elementId, defaultX, defaultY, defaultScale) {
    const fullKey = `${sceneKey}.${elementId}`
    const storageKey = `${STORAGE_PREFIX}${fullKey}`

    // Priority 1: localStorage
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        const scale = data.scale ?? defaultScale
        console.log(`[Layout] ${fullKey} override (localStorage): (${data.x}, ${data.y}) scale=${scale}`)
        return { x: data.x, y: data.y, scale }
      } catch (e) {
        console.error(`[Layout] Bad localStorage data for ${storageKey}:`, e)
      }
    }

    // Priority 2: layout-overrides.json (build-time baked)
    if (layoutOverrides && layoutOverrides[fullKey]) {
      const data = layoutOverrides[fullKey]
      const scale = data.scale ?? defaultScale
      console.log(`[Layout] ${fullKey} override (JSON): (${data.x}, ${data.y}) scale=${scale}`)
      return { x: data.x, y: data.y, scale }
    }

    // Priority 3: hardcoded default
    return { x: defaultX, y: defaultY, scale: defaultScale }
  }

  /**
   * Unregister all elements for a scene. Call on scene 'shutdown'.
   */
  static unregisterScene(sceneKey) {
    const prefix = `${sceneKey}.`
    let count = 0

    for (const key of [...this._registry.keys()]) {
      if (key.startsWith(prefix)) {
        this._registry.delete(key)
        count++
      }
    }

    // Destroy overlays belonging to this scene
    this._overlays = this._overlays.filter(o => {
      if (o.key.startsWith(prefix)) {
        if (o.text && o.text.scene) o.text.destroy()
        return false
      }
      return true
    })

    // Clear selection if it was in this scene
    if (this._selectedKey && this._selectedKey.startsWith(prefix)) {
      this._selectedKey = null
    }

    console.log(`[Layout] ${sceneKey} shutdown — unregistered ${count} elements`)
  }

  // ── Edit Mode Toggle ──────────────────────────────────────────────────

  static toggle() {
    this._enabled = !this._enabled
    if (this._enabled) {
      this._enterEditMode()
    } else {
      this._exitEditMode()
    }
  }

  static _enterEditMode() {
    const scene = this._getActiveScene()
    if (!scene) {
      console.warn('[Editor] No active scene — cannot enter edit mode')
      this._enabled = false
      return
    }

    console.log(`[Editor] ═══ EDIT MODE ON ═══ ${this._registry.size} elements editable`)

    // Disable all normal game input (prevents buy/sell/reroll/fight while editing)
    scene.input.enabled = false
    console.log(`[Editor] Scene '${scene.scene.key}' input DISABLED`)

    // Show position overlays on all registered elements
    for (const [key, entry] of this._registry) {
      this._showOverlay(key, entry.element, entry.scene)
    }

    // Show grid if it was on
    if (this._gridSize > 0) {
      this._showGrid(scene)
    }

    // Show DOM banner
    this._showBanner()
    this._selectedKey = null

    // Attach window-level pointer handlers (bypasses disabled scene input)
    this._onDown = (e) => this._handlePointerDown(e)
    this._onMove = (e) => this._handlePointerMove(e)
    this._onUp = (e) => this._handlePointerUp(e)
    this._onKey = (e) => this._handleKeyDown(e)
    window.addEventListener('pointerdown', this._onDown)
    window.addEventListener('pointermove', this._onMove)
    window.addEventListener('pointerup', this._onUp)
    window.addEventListener('keydown', this._onKey)
  }

  static _exitEditMode() {
    console.log('[Editor] ═══ EDIT MODE OFF ═══')

    // Re-enable scene input
    const scene = this._getActiveScene()
    if (scene) {
      scene.input.enabled = true
      console.log(`[Editor] Scene '${scene.scene.key}' input ENABLED`)
    }

    // Destroy all overlays
    for (const o of this._overlays) {
      if (o.text && o.text.scene) o.text.destroy()
    }
    this._overlays = []

    // Destroy grid + selection visuals
    this._hideGrid()
    this._hideSelection()

    // Remove DOM banner
    this._hideBanner()

    // Remove window handlers
    if (this._onDown) window.removeEventListener('pointerdown', this._onDown)
    if (this._onMove) window.removeEventListener('pointermove', this._onMove)
    if (this._onUp) window.removeEventListener('pointerup', this._onUp)
    if (this._onKey) window.removeEventListener('keydown', this._onKey)
    this._onDown = null
    this._onMove = null
    this._onUp = null
    this._onKey = null
    this._dragState = null
    this._selectedKey = null
  }

  // ── Pointer Handling (window-level, works with scene input disabled) ──

  static _handlePointerDown(e) {
    if (!this._enabled) return

    const pos = this._windowToGame(e.clientX, e.clientY)
    if (!pos) return

    // Find the topmost registered element under the pointer
    const entries = [...this._registry.entries()].reverse()
    for (const [key, entry] of entries) {
      const bounds = this._getElementBounds(entry.element)
      if (pos.x >= bounds.x && pos.x <= bounds.x + bounds.width &&
          pos.y >= bounds.y && pos.y <= bounds.y + bounds.height) {
        this._selectedKey = key
        this._dragState = {
          key,
          element: entry.element,
          offsetX: pos.x - entry.element.x,
          offsetY: pos.y - entry.element.y,
          startX: entry.element.x,
          startY: entry.element.y,
        }
        this._showSelection(entry.element, entry.scene)
        this._updateBannerInfo()
        console.log(`[Editor] Selected: ${key} at (${Math.round(entry.element.x)}, ${Math.round(entry.element.y)}) scale=${Math.round(entry.element.scaleX * 100) / 100}`)
        return
      }
    }

    // Clicked empty space — deselect
    this._selectedKey = null
    this._hideSelection()
    this._updateBannerInfo()
  }

  static _handlePointerMove(e) {
    if (!this._enabled || !this._dragState) return

    const pos = this._windowToGame(e.clientX, e.clientY)
    if (!pos) return

    const ds = this._dragState
    let newX = Math.round(pos.x - ds.offsetX)
    let newY = Math.round(pos.y - ds.offsetY)

    // Snap to grid
    if (this._gridSize > 0) {
      newX = Math.round(newX / this._gridSize) * this._gridSize
      newY = Math.round(newY / this._gridSize) * this._gridSize
    }

    ds.element.x = newX
    ds.element.y = newY

    // Update overlay label
    this._updateOverlayForKey(ds.key)

    // Update selection highlight position
    const entry = this._registry.get(ds.key)
    if (entry) this._showSelection(entry.element, entry.scene)

    // Update banner info
    this._updateBannerInfo()
  }

  static _handlePointerUp(e) {
    if (!this._enabled || !this._dragState) return

    const ds = this._dragState
    const storageKey = `${STORAGE_PREFIX}${ds.key}`

    // Only save if actually moved
    if (ds.element.x !== ds.startX || ds.element.y !== ds.startY) {
      this._saveElement(ds.key, ds.element)
      console.log(`[Editor] Moved ${ds.key}: (${ds.startX}, ${ds.startY}) → (${ds.element.x}, ${ds.element.y}) [saved]`)
    }

    this._dragState = null
  }

  // ── Keyboard Handling ─────────────────────────────────────────────────

  static _handleKeyDown(e) {
    if (!this._enabled) return

    // F2 handled by init listener
    if (e.key === 'F2') return

    // G — cycle grid snap
    if (e.key === 'g' || e.key === 'G') {
      e.preventDefault()
      this._cycleGrid()
      return
    }

    // Escape — deselect
    if (e.key === 'Escape') {
      e.preventDefault()
      this._selectedKey = null
      this._hideSelection()
      this._updateBannerInfo()
      console.log('[Editor] Deselected')
      return
    }

    // R — reset selected element to default
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      this._resetSelected()
      return
    }

    // ] — scale up selected element
    if (e.key === ']') {
      e.preventDefault()
      this._scaleSelected(SCALE_FACTOR)
      return
    }

    // [ — scale down selected element
    if (e.key === '[') {
      e.preventDefault()
      this._scaleSelected(1 / SCALE_FACTOR)
      return
    }
  }

  // ── Scale ─────────────────────────────────────────────────────────────

  static _scaleSelected(factor) {
    if (!this._selectedKey) {
      console.log('[Editor] No element selected — click one first')
      return
    }

    const entry = this._registry.get(this._selectedKey)
    if (!entry) return

    const oldScale = entry.element.scaleX
    const newScale = Math.round(oldScale * factor * 100) / 100

    // Clamp: don't go below 0.1 or above 20
    if (newScale < 0.1 || newScale > 20) {
      console.log(`[Editor] Scale ${newScale} out of range (0.1–20), clamped`)
      return
    }

    entry.element.setScale(newScale)
    this._saveElement(this._selectedKey, entry.element)
    this._updateOverlayForKey(this._selectedKey)
    this._showSelection(entry.element, entry.scene)
    this._updateBannerInfo()

    console.log(`[Editor] Scaled ${this._selectedKey}: ${oldScale} → ${newScale}`)
  }

  // ── Grid Snap ─────────────────────────────────────────────────────────

  static _cycleGrid() {
    const currentIdx = GRID_SIZES.indexOf(this._gridSize)
    const nextIdx = (currentIdx + 1) % GRID_SIZES.length
    this._gridSize = GRID_SIZES[nextIdx]

    const scene = this._getActiveScene()

    if (this._gridSize === 0) {
      this._hideGrid()
      console.log('[Editor] Grid snap: OFF')
    } else {
      if (scene) this._showGrid(scene)
      console.log(`[Editor] Grid snap: ${this._gridSize}px`)
    }

    this._updateBannerInfo()
  }

  static _showGrid(scene) {
    this._hideGrid()

    this._gridOverlay = scene.add.graphics()
    this._gridOverlay.setDepth(9998)

    const g = this._gridSize
    const alpha = g <= 8 ? 0.08 : g <= 16 ? 0.12 : 0.16

    this._gridOverlay.lineStyle(1, 0x00ff00, alpha)
    for (let x = 0; x <= GAME_W; x += g) {
      this._gridOverlay.lineBetween(x, 0, x, GAME_H)
    }
    for (let y = 0; y <= GAME_H; y += g) {
      this._gridOverlay.lineBetween(0, y, GAME_W, y)
    }
  }

  static _hideGrid() {
    if (this._gridOverlay) {
      this._gridOverlay.destroy()
      this._gridOverlay = null
    }
  }

  // ── Selection Highlight ───────────────────────────────────────────────

  static _showSelection(element, scene) {
    this._hideSelection()

    const bounds = this._getElementBounds(element)
    this._selectionRect = scene.add.graphics()
    this._selectionRect.setDepth(9998)
    this._selectionRect.lineStyle(2, 0xffff00, 0.8)
    this._selectionRect.strokeRect(bounds.x - 2, bounds.y - 2, bounds.width + 4, bounds.height + 4)
  }

  static _hideSelection() {
    if (this._selectionRect) {
      this._selectionRect.destroy()
      this._selectionRect = null
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────

  static _resetSelected() {
    if (!this._selectedKey) {
      console.log('[Editor] No element selected — click one first')
      return
    }

    const entry = this._registry.get(this._selectedKey)
    if (!entry) return

    const old = { x: entry.element.x, y: entry.element.y, scale: entry.element.scaleX }

    // Reset to defaults
    entry.element.x = entry.defaultX
    entry.element.y = entry.defaultY
    entry.element.setScale(entry.defaultScale)

    // Remove localStorage override
    const storageKey = `${STORAGE_PREFIX}${this._selectedKey}`
    localStorage.removeItem(storageKey)

    this._updateOverlayForKey(this._selectedKey)
    this._showSelection(entry.element, entry.scene)
    this._updateBannerInfo()

    console.log(`[Editor] Reset ${this._selectedKey}: (${old.x}, ${old.y}) scale=${old.scale} → (${entry.defaultX}, ${entry.defaultY}) scale=${entry.defaultScale} [default]`)
  }

  static _resetScene() {
    const scene = this._getActiveScene()
    if (!scene) return

    const sceneKey = scene.scene.key
    const prefix = `${sceneKey}.`
    let count = 0

    for (const [key, entry] of this._registry) {
      if (!key.startsWith(prefix)) continue

      entry.element.x = entry.defaultX
      entry.element.y = entry.defaultY
      entry.element.setScale(entry.defaultScale)

      const storageKey = `${STORAGE_PREFIX}${key}`
      localStorage.removeItem(storageKey)

      this._updateOverlayForKey(key)
      count++
    }

    this._selectedKey = null
    this._hideSelection()
    this._updateBannerInfo()

    console.log(`[Editor] Reset ${count} elements in '${sceneKey}' to defaults`)
  }

  // ── Coordinate Conversion ─────────────────────────────────────────────

  static _windowToGame(clientX, clientY) {
    const canvas = this._game?.canvas
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = Math.round((clientX - rect.left) * (GAME_W / rect.width))
    const y = Math.round((clientY - rect.top) * (GAME_H / rect.height))

    if (x < 0 || x > GAME_W || y < 0 || y > GAME_H) return null
    return { x, y }
  }

  // ── Bounds Detection ──────────────────────────────────────────────────

  static _getElementBounds(element) {
    const sx = element.scaleX ?? 1
    const sy = element.scaleY ?? 1

    // PixelPanel: origin at (0,0), has panelW/panelH
    if (element.panelW != null && element.panelH != null) {
      return { x: element.x, y: element.y, width: element.panelW * sx, height: element.panelH * sy }
    }

    // WarriorCard: centered origin, has cardW/cardH
    if (element.cardW != null && element.cardH != null) {
      const w = element.cardW * sx, h = element.cardH * sy
      return { x: element.x - w / 2, y: element.y - h / 2, width: w, height: h }
    }

    // PixelButton (filled): centered origin, has btnW/btnH
    if (element.btnW != null && element.btnH != null) {
      const w = element.btnW * sx, h = element.btnH * sy
      return { x: element.x - w / 2, y: element.y - h / 2, width: w, height: h }
    }

    // PixelButton (text): has hitZone child with known dimensions
    if (element.hitZone && element.hitZone.width) {
      const hz = element.hitZone
      const w = hz.width * sx, h = hz.height * sy
      return { x: element.x - 10 * sx, y: element.y - 6 * sy, width: w, height: h }
    }

    // BitmapText or PixelLabel (extends BitmapText): has width/height + origin
    if (element.width > 0 && element.height > 0 && element.originX != null) {
      const w = element.width * sx, h = element.height * sy
      return {
        x: element.x - w * element.originX,
        y: element.y - h * element.originY,
        width: w, height: h,
      }
    }

    // Image: has displayWidth/displayHeight (already includes scale)
    if (element.displayWidth > 0 && element.displayHeight > 0) {
      const ow = element.originX ?? 0.5
      const oh = element.originY ?? 0.5
      return {
        x: element.x - element.displayWidth * ow,
        y: element.y - element.displayHeight * oh,
        width: element.displayWidth, height: element.displayHeight,
      }
    }

    // Try Phaser getBounds()
    try {
      const b = element.getBounds()
      if (b && b.width > 0 && b.height > 0) {
        return { x: b.x, y: b.y, width: b.width, height: b.height }
      }
    } catch (_) {}

    // Generous fallback
    console.warn(`[Editor] Unknown bounds for element, using 80x40 fallback`)
    return { x: element.x - 40, y: element.y - 20, width: 80, height: 40 }
  }

  // ── Overlays ──────────────────────────────────────────────────────────

  static _showOverlay(key, element, scene) {
    const shortId = key.split('.')[1]
    const s = Math.round(element.scaleX * 100) / 100
    const scaleStr = s !== 1 ? ` x${s}` : ''
    const label = `${shortId} (${Math.round(element.x)}, ${Math.round(element.y)})${scaleStr}`

    try {
      const text = scene.add.bitmapText(
        element.x, element.y - 14, FONT_KEY, label, 7
      ).setTint(0x00ff00).setDepth(9999).setOrigin(0.5, 1)
      this._overlays.push({ key, text })
    } catch (e) {
      console.warn(`[Editor] Could not create overlay for ${key}:`, e)
    }
  }

  static _updateOverlayForKey(key) {
    const entry = this._registry.get(key)
    if (!entry) return

    const overlay = this._overlays.find(o => o.key === key)
    if (!overlay || !overlay.text || !overlay.text.scene) return

    const el = entry.element
    const shortId = key.split('.')[1]
    const s = Math.round(el.scaleX * 100) / 100
    const scaleStr = s !== 1 ? ` x${s}` : ''

    overlay.text.x = el.x
    overlay.text.y = el.y - 14
    overlay.text.setText(`${shortId} (${Math.round(el.x)}, ${Math.round(el.y)})${scaleStr}`)
  }

  // ── Save Helper ───────────────────────────────────────────────────────

  static _saveElement(key, element) {
    const storageKey = `${STORAGE_PREFIX}${key}`
    const entry = this._registry.get(key)
    const data = { x: element.x, y: element.y }

    // Only store scale if it differs from default
    if (entry && Math.abs(element.scaleX - entry.defaultScale) > 0.001) {
      data.scale = Math.round(element.scaleX * 100) / 100
    }

    localStorage.setItem(storageKey, JSON.stringify(data))
  }

  // ── DOM Banner ────────────────────────────────────────────────────────

  static _showBanner() {
    if (this._bannerEl) return

    const el = document.createElement('div')
    el.id = 'layout-editor-banner'
    el.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 10000;
      font-family: monospace; font-size: 12px; color: #0f0;
      background: rgba(0,0,0,0.9); padding: 12px 16px;
      border: 1px solid #0f0; border-radius: 4px;
      pointer-events: auto; user-select: none;
      min-width: 220px;
    `
    el.innerHTML = `
      <div style="font-weight:bold; font-size:14px; margin-bottom:6px; border-bottom:1px solid #060; padding-bottom:4px;">
        EDIT MODE <span style="color:#080; font-size:11px;">(F2 to exit)</span>
      </div>
      <div style="color:#080; font-size:11px; margin-bottom:8px; line-height:1.5;">
        Drag to move &nbsp;|&nbsp; <b>[</b> <b>]</b> Scale<br>
        <b>G</b> Grid &nbsp;|&nbsp; <b>R</b> Reset &nbsp;|&nbsp; <b>Esc</b> Deselect
      </div>
      <div id="le-info" style="color:#0d0; font-size:11px; margin-bottom:8px; min-height:28px; border:1px solid #030; padding:4px 6px; background:#010;">
        Click an element to select it
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button id="le-export" style="flex:1; padding:5px 8px; cursor:pointer;
          font-family:monospace; font-size:11px; background:#030; color:#0f0; border:1px solid #0f0;">
          Export
        </button>
        <button id="le-reset-scene" style="flex:1; padding:5px 8px; cursor:pointer;
          font-family:monospace; font-size:11px; background:#330; color:#ff0; border:1px solid #ff0;">
          Reset Scene
        </button>
        <button id="le-clear" style="flex:1; padding:5px 8px; cursor:pointer;
          font-family:monospace; font-size:11px; background:#300; color:#f00; border:1px solid #f00;">
          Clear All
        </button>
      </div>
    `
    document.body.appendChild(el)

    document.getElementById('le-export').addEventListener('click', () => this.exportJSON())
    document.getElementById('le-reset-scene').addEventListener('click', () => this._resetScene())
    document.getElementById('le-clear').addEventListener('click', () => {
      this.clearAll()
      const scene = this._getActiveScene()
      if (scene) {
        this._exitEditMode()
        scene.scene.restart()
      }
    })

    this._bannerEl = el
    this._updateBannerInfo()
  }

  static _updateBannerInfo() {
    const infoEl = document.getElementById('le-info')
    if (!infoEl) return

    const gridLabel = this._gridSize > 0 ? `Grid: ${this._gridSize}px` : 'Grid: OFF'
    let lines = [gridLabel]

    if (this._selectedKey) {
      const entry = this._registry.get(this._selectedKey)
      if (entry) {
        const el = entry.element
        const s = Math.round(el.scaleX * 100) / 100
        const shortId = this._selectedKey.split('.')[1]
        lines.push(`<b style="color:#ff0;">${this._selectedKey}</b>`)
        lines.push(`Pos: (${Math.round(el.x)}, ${Math.round(el.y)}) &nbsp; Scale: ${s}`)
      }
    } else {
      lines.push('<span style="color:#060;">No selection</span>')
    }

    infoEl.innerHTML = lines.join('<br>')
  }

  static _hideBanner() {
    if (this._bannerEl) {
      this._bannerEl.remove()
      this._bannerEl = null
    }
  }

  // ── Export / Clear ────────────────────────────────────────────────────

  /**
   * Export all localStorage layout overrides as JSON.
   * Logs to console and copies to clipboard.
   */
  static exportJSON() {
    const overrides = {}
    const keys = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const layoutKey = key.slice(STORAGE_PREFIX.length)
        try {
          overrides[layoutKey] = JSON.parse(localStorage.getItem(key))
          keys.push(layoutKey)
        } catch (e) {
          console.error(`[Editor] Bad data for ${key}:`, e)
        }
      }
    }

    const json = JSON.stringify(overrides, null, 2)
    console.log('[Editor] ╔══════════════════════════════════════╗')
    console.log('[Editor] ║        LAYOUT EXPORT                ║')
    console.log('[Editor] ╚══════════════════════════════════════╝')
    console.log(json)
    console.log(`[Editor] ${keys.length} overrides: ${keys.join(', ')}`)

    if (navigator.clipboard) {
      navigator.clipboard.writeText(json)
        .then(() => console.log('[Editor] Copied to clipboard!'))
        .catch(() => console.log('[Editor] Clipboard failed — copy from console above'))
    }

    return json
  }

  /**
   * Clear all layout overrides from localStorage.
   */
  static clearAll() {
    let count = 0
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key)
        count++
      }
    }
    console.log(`[Editor] Cleared ${count} layout overrides from localStorage`)
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  static _getActiveScene() {
    if (!this._game) return null
    try {
      const scenes = this._game.scene.getScenes(true)
      return scenes.length > 0 ? scenes[0] : null
    } catch (e) {
      console.error('[Editor] Could not get active scene:', e)
      return null
    }
  }
}
