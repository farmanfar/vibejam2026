/**
 * ViewportManager — sizes #game-container to the actual visible safe area.
 *
 * Phaser's Scale.FIT scales the canvas to fit its parent. The parent (#game-container)
 * is what we control here. We compute the *real* usable rectangle by combining:
 *   - visualViewport.{width,height}  (excludes iOS Safari URL bar when visible)
 *   - safe-area-inset-{top,right,bottom,left}  (notch + home indicator on iOS)
 *
 * Setting the container to that rect, then calling game.scale.refresh(), keeps the
 * full 960×540 game space inside the visible safe area on every device/orientation.
 *
 * Listens to: window.resize, orientationchange, visualViewport.resize/scroll.
 * Debounced via requestAnimationFrame so URL-bar animation bursts coalesce.
 */
export class ViewportManager {
  static _game = null
  static _container = null
  static _probe = null
  static _rafPending = false
  static _lastInfo = null

  static init(game) {
    if (this._game) {
      console.warn('[Viewport] init called twice — ignoring')
      return
    }
    this._game = game
    this._container = document.getElementById('game-container')
    if (!this._container) {
      console.error('[Viewport] #game-container not found — abort')
      return
    }

    this._probe = this._createProbe()

    const schedule = () => this._scheduleRecompute()
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule)
      window.visualViewport.addEventListener('scroll', schedule)
    }

    window.ViewportManager = this
    this.recompute()
    console.log('[Viewport] ViewportManager initialized')
  }

  /** Force an immediate recompute. Useful from console or after dynamic DOM changes. */
  static recompute() {
    if (!this._game || !this._container) return
    const info = this._computeUsable()
    this._container.style.width = `${info.containerW}px`
    this._container.style.height = `${info.containerH}px`

    try {
      this._game.scale.refresh()
    } catch (e) {
      console.error('[Viewport] scale.refresh failed:', e)
    }

    this._lastInfo = info
    console.log(
      `[Viewport] vp ${info.vpW}x${info.vpH}, ` +
      `insets T${info.top} R${info.right} B${info.bottom} L${info.left}, ` +
      `container ${info.containerW}x${info.containerH}`
    )
  }

  /** Last computed viewport info — for debug paste / regression checks. */
  static getInfo() {
    return this._lastInfo
  }

  // ── Internals ──────────────────────────────────────────────────────────

  static _scheduleRecompute() {
    if (this._rafPending) return
    this._rafPending = true
    requestAnimationFrame(() => {
      this._rafPending = false
      this.recompute()
    })
  }

  static _computeUsable() {
    const vv = window.visualViewport
    const vpW = Math.floor(vv?.width ?? window.innerWidth)
    const vpH = Math.floor(vv?.height ?? window.innerHeight)

    const insets = this._readInsets()
    const containerW = Math.max(0, vpW - insets.left - insets.right)
    const containerH = Math.max(0, vpH - insets.top - insets.bottom)

    return { vpW, vpH, containerW, containerH, ...insets }
  }

  /**
   * Hidden probe div with `padding: env(safe-area-inset-*)` lets us read the
   * resolved inset values via getComputedStyle. On non-iOS / older browsers,
   * env() resolves to 0, which is the correct fallback.
   */
  static _createProbe() {
    const probe = document.createElement('div')
    probe.id = 'viewport-safe-probe'
    probe.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:0',
      'height:0',
      'visibility:hidden',
      'pointer-events:none',
      'padding-top:env(safe-area-inset-top)',
      'padding-right:env(safe-area-inset-right)',
      'padding-bottom:env(safe-area-inset-bottom)',
      'padding-left:env(safe-area-inset-left)',
    ].join(';')
    document.body.appendChild(probe)
    return probe
  }

  static _readInsets() {
    if (!this._probe) return { top: 0, right: 0, bottom: 0, left: 0 }
    const cs = getComputedStyle(this._probe)
    return {
      top: parseInt(cs.paddingTop, 10) || 0,
      right: parseInt(cs.paddingRight, 10) || 0,
      bottom: parseInt(cs.paddingBottom, 10) || 0,
      left: parseInt(cs.paddingLeft, 10) || 0,
    }
  }
}
