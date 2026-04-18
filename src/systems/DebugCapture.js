import { LayoutEditor } from './LayoutEditor.js'
import { FONT_KEY } from '../ui/index.js'

/**
 * F9  — screenshot the active scene to PNG (downloads via browser).
 * F10 — toggle annotated debug overlay (bounds + ids on every registered element).
 *
 * Both are read-only debug aids — they do NOT touch input, gameplay, or persistence.
 * Overlay reuses LayoutEditor.dumpSnapshot() so it sees exactly the elements
 * the layout system knows about (matches the F2 picker hit boxes).
 */
export class DebugCapture {
  static _game = null
  static _overlayEnabled = false
  static _overlayObjects = []   // Phaser GameObjects to destroy on hide
  static _overlaySceneKey = null
  static _onKey = null

  static init(game) {
    this._game = game

    this._onKey = (e) => {
      if (e.key === 'F9') {
        e.preventDefault()
        this.screenshot()
      } else if (e.key === 'F10') {
        e.preventDefault()
        this.toggleOverlay()
      }
    }
    window.addEventListener('keydown', this._onKey)

    window.DebugCapture = this
    console.log('[Debug] DebugCapture initialized. F9=screenshot, F10=annotated overlay')
  }

  // ── Screenshot ────────────────────────────────────────────────────────

  static screenshot() {
    if (!this._game) {
      console.warn('[Debug] No game instance — screenshot aborted')
      return
    }
    const sceneKey = this._activeSceneKey() ?? 'unknown'
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `${sceneKey}-${ts}.png`

    this._captureDataUrl()
      .then((url) => {
        this._downloadDataUrl(url, filename)
        console.log(`[Debug] Screenshot saved: ${filename}`)
      })
      .catch((e) => console.error('[Debug] Screenshot failed:', e))
  }

  /**
   * Capture the current frame as a PNG dataURL. Used by both screenshot()
   * (download path) and runSelfTest() (analysis path, no download).
   */
  static _captureDataUrl() {
    return new Promise((resolve, reject) => {
      if (!this._game) return reject(new Error('no game instance'))

      const onImage = (image) => {
        try {
          let url = null
          if (image && typeof image.src === 'string') {
            url = image.src
          } else if (image instanceof HTMLCanvasElement) {
            url = image.toDataURL('image/png')
          }
          if (!url) return reject(new Error('snapshot returned no usable image'))
          resolve(url)
        } catch (e) { reject(e) }
      }

      try {
        const renderer = this._game.renderer
        if (renderer && typeof renderer.snapshot === 'function') {
          renderer.snapshot(onImage)
          return
        }
        // Fallback: read the canvas directly. Requires preserveDrawingBuffer
        // for WebGL — may produce a blank image if not set.
        const canvas = this._game.canvas
        if (canvas) {
          resolve(canvas.toDataURL('image/png'))
          return
        }
        reject(new Error('no renderer.snapshot and no canvas'))
      } catch (e) { reject(e) }
    })
  }

  static _downloadDataUrl(dataUrl, filename) {
    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Annotated Overlay ─────────────────────────────────────────────────

  static toggleOverlay() {
    if (this._overlayEnabled) {
      this._hideOverlay('toggle')
    } else {
      this._showOverlay()
    }
  }

  static _showOverlay() {
    const scene = this._activeScene()
    if (!scene) {
      console.warn('[Debug] Overlay: no active scene')
      return
    }

    const snap = LayoutEditor.dumpSnapshot()
    if (!snap || snap.elements.length === 0) {
      console.warn('[Debug] Overlay: no registered elements in scene', scene.scene.key)
      return
    }

    const visible = snap.elements.filter(el => el.visible !== false)

    const g = scene.add.graphics()
    g.setDepth(99990)
    g.lineStyle(2, 0x00ffff, 0.9)
    for (const el of visible) {
      g.strokeRect(el.x, el.y, el.width, el.height)
    }
    this._overlayObjects.push(g)

    for (const el of visible) {
      const w = Math.round(el.width)
      const h = Math.round(el.height)
      const label = `${el.id} (${Math.round(el.x)},${Math.round(el.y)}) ${w}x${h}`
      try {
        const text = scene.add.bitmapText(el.x + 2, el.y + 2, FONT_KEY, label, 7)
          .setTint(0x00ffff)
          .setDepth(99991)
          .setOrigin(0, 0)
        this._overlayObjects.push(text)
      } catch (e) {
        console.warn(`[Debug] Overlay: could not label ${el.id}:`, e)
      }
    }

    this._overlayEnabled = true
    this._overlaySceneKey = scene.scene.key

    // Auto-clear stale refs if the scene tears down while overlay is on —
    // Phaser destroys our objects with the scene, so we just drop the refs.
    scene.events.once('shutdown', () => {
      if (this._overlayEnabled && this._overlaySceneKey === scene.scene.key) {
        this._overlayObjects = []
        this._overlayEnabled = false
        this._overlaySceneKey = null
        console.log('[Debug] Overlay auto-cleared on scene shutdown')
      }
    })

    console.log(`[Debug] Overlay ON in '${scene.scene.key}': ${visible.length} elements (F10 to hide)`)
  }

  static _hideOverlay(reason) {
    for (const o of this._overlayObjects) {
      try { o.destroy() } catch (e) { console.warn('[Debug] Overlay: destroy failed:', e) }
    }
    this._overlayObjects = []
    this._overlayEnabled = false
    this._overlaySceneKey = null
    console.log(`[Debug] Overlay OFF (${reason})`)
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  static _activeScene() {
    if (!this._game) return null
    try {
      const scenes = this._game.scene.getScenes(true)
      return scenes[0] ?? null
    } catch (e) {
      console.error('[Debug] Could not get active scene:', e)
      return null
    }
  }

  static _activeSceneKey() {
    return this._activeScene()?.scene?.key ?? null
  }

  // ── Self-Test ─────────────────────────────────────────────────────────

  /**
   * Programmatically exercise F9/F10 in the current scene. Run from the
   * browser console: `await DebugCapture.runSelfTest()`. Returns a summary
   * object and logs `[SelfTest] ✓/✗ ...` lines per check.
   *
   * Cannot test: download UX, visual correctness of the PNG (checks pixel
   * stats only), gameplay-during-overlay (would require synthetic input).
   */
  static async runSelfTest() {
    const sceneKey = this._activeSceneKey()
    if (!sceneKey) {
      console.error('[SelfTest] No active scene — abort')
      return { passed: 0, failed: 1, total: 1, results: [] }
    }
    console.log(`[SelfTest] ═══ Running in scene '${sceneKey}' ═══`)

    // Force a clean starting state so prior manual toggles don't skew results.
    if (this._overlayEnabled) this._hideOverlay('selftest-reset')
    if (LayoutEditor._enabled) LayoutEditor.toggle()

    const snap0 = LayoutEditor.dumpSnapshot()
    const elementCount = snap0.elements.filter(e => e.visible !== false).length
    console.log(`[SelfTest] Visible registered elements: ${elementCount}`)
    if (elementCount === 0) {
      console.warn('[SelfTest] Scene has no registered elements — overlay tests will be trivial. Navigate to Shop or Battle for a meaningful run.')
    }

    const results = []
    const test = async (name, fn) => {
      try {
        const detail = await fn()
        results.push({ name, pass: true, detail })
        console.log(`[SelfTest] ✓ ${name}${detail ? ' — ' + detail : ''}`)
      } catch (e) {
        results.push({ name, pass: false, error: e?.message ?? String(e) })
        console.error(`[SelfTest] ✗ ${name}: ${e?.message ?? e}`)
      }
    }

    await test('1. screenshot returns non-blank PNG', async () => {
      const url = await this._captureDataUrl()
      if (!url.startsWith('data:image/png')) throw new Error('not a PNG dataURL')
      const stats = await this._analyzePng(url)
      if (stats.uniformPixel) throw new Error(`PNG looks uniform (${stats.dominantColor} = ${Math.round(stats.dominantRatio * 100)}%)`)
      return `${Math.round(url.length / 1024)}KB, ${stats.totalSampled} samples, dominant=${stats.dominantColor}@${Math.round(stats.dominantRatio * 100)}%`
    })

    await test('2. F10 overlay creates expected number of objects', async () => {
      this.toggleOverlay()
      if (!this._overlayEnabled) throw new Error('overlay did not enable')
      const expected = 1 + elementCount  // 1 graphics + N text labels
      if (this._overlayObjects.length !== expected) {
        throw new Error(`expected ${expected} objects (1 graphics + ${elementCount} labels), got ${this._overlayObjects.length}`)
      }
      return `${this._overlayObjects.length} objects`
    })

    await test('3. CRITICAL: screenshot with overlay contains cyan pixels', async () => {
      if (!this._overlayEnabled) throw new Error('precondition violated: overlay was off')
      if (elementCount === 0) {
        return 'SKIP (no elements to draw)'
      }
      const url = await this._captureDataUrl()
      const stats = await this._analyzePng(url)
      // 2px-thick rectangles around N elements should yield hundreds of cyan
      // pixels at minimum. Scale threshold to element count so tiny scenes
      // (Menu has ~5 elements) don't get a false fail.
      const minExpected = Math.max(50, elementCount * 20)
      if (stats.cyanPixels < minExpected) {
        throw new Error(`only ${stats.cyanPixels} cyan pixels found (expected ≥${minExpected} for ${elementCount} elements) — overlay was NOT captured into the PNG`)
      }
      return `${stats.cyanPixels} cyan pixels (≥${minExpected} required)`
    })

    await test('4. F10 toggle off cleans up all objects', async () => {
      this.toggleOverlay()
      if (this._overlayEnabled) throw new Error('overlay still enabled')
      if (this._overlayObjects.length !== 0) throw new Error(`leaked ${this._overlayObjects.length} objects`)
      return 'cleaned'
    })

    await test('5. rapid 5x toggle leaves clean state, no leaks', async () => {
      for (let i = 0; i < 5; i++) this.toggleOverlay()
      // 5 toggles from OFF → ends ON
      if (!this._overlayEnabled) throw new Error('expected ON after 5 toggles, got OFF')
      const expected = 1 + elementCount
      if (this._overlayObjects.length !== expected) {
        throw new Error(`expected ${expected}, got ${this._overlayObjects.length}`)
      }
      this.toggleOverlay()  // back to off
      if (this._overlayObjects.length !== 0) throw new Error('off-state object leak after rapid cycle')
      return '6 toggles total, no leaks'
    })

    await test('6. F2 + F10 coexistence', async () => {
      // Skip if scene is in PAUSE_ON_EDIT_SCENES (would pause Battle mid-test).
      if (LayoutEditor.PAUSE_ON_EDIT_SCENES.has(sceneKey)) {
        return `SKIP (F2 pauses ${sceneKey})`
      }
      LayoutEditor.toggle()  // F2 on
      try {
        this.toggleOverlay()  // F10 on
        if (!LayoutEditor._enabled) throw new Error('F2 not enabled')
        if (!this._overlayEnabled) throw new Error('F10 not enabled')
        if (this._overlayObjects.length === 0) throw new Error('overlay objects not created')
        this.toggleOverlay()  // F10 off
      } finally {
        if (LayoutEditor._enabled) LayoutEditor.toggle()  // always restore
      }
      return 'both layered without interference'
    })

    console.log('[SelfTest] ─── Manual checks (not automatable) ───')
    console.log('[SelfTest] MANUAL #7: visually inspect a downloaded PNG (press F9)')
    console.log('[SelfTest] MANUAL #8: scene shutdown auto-clears overlay (F10 on, change scene)')
    console.log('[SelfTest] MANUAL #9: gameplay still works during overlay (F10 on, click Reroll)')

    const passed = results.filter(r => r.pass).length
    const failed = results.length - passed
    const verdict = failed === 0 ? 'ALL PASS' : `${failed} FAILED`
    console.log(`[SelfTest] ═══ ${passed}/${results.length} passed — ${verdict} ═══`)
    return { passed, failed, total: results.length, results }
  }

  /**
   * Decode a PNG dataURL and compute pixel statistics:
   *   - cyanPixels: count of sampled pixels matching the overlay color
   *   - uniformPixel: true if any single 32-step bucket dominates (>95%) — flags blank/black PNGs
   *   - dominantColor: rgb bucket key of the most common color (debug aid)
   */
  static _analyzePng(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth
          c.height = img.naturalHeight
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data

          // Cyan check: full-pixel scan. Overlay lines are 2px thick, so
          // strided sampling still misses most of them — counting accurately
          // matters for the threshold to be meaningful.
          let cyanPixels = 0
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2]
            if (r < 80 && g > 180 && b > 180) cyanPixels++
          }

          // Histogram for blank-detection: strided is fine here, we only
          // need to know if one bucket dominates the frame.
          const step = Math.max(1, Math.floor(c.width / 60))
          let totalSampled = 0
          const histogram = new Map()
          for (let y = 0; y < c.height; y += step) {
            for (let x = 0; x < c.width; x += step) {
              const i = (y * c.width + x) * 4
              const r = data[i], g = data[i + 1], b = data[i + 2]
              const key = `${r >> 5},${g >> 5},${b >> 5}`
              histogram.set(key, (histogram.get(key) ?? 0) + 1)
              totalSampled++
            }
          }
          let topBucket = null, topCount = 0
          for (const [k, v] of histogram) {
            if (v > topCount) { topBucket = k; topCount = v }
          }
          const dominantRatio = totalSampled > 0 ? topCount / totalSampled : 1
          resolve({
            cyanPixels,
            totalSampled,
            uniformPixel: dominantRatio > 0.95,
            dominantColor: topBucket,
            dominantRatio,
          })
        } catch (e) { reject(e) }
      }
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = dataUrl
    })
  }
}
