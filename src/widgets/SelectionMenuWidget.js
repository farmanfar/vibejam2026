/**
 * SelectionMenuWidget — motion-driven selection menu container.
 *
 * Config contract:
 *   items:   { featured: item[], leftPanel?, rightPanel?, preview? }
 *   text:    { headerTitle?, headerStatus?, actionLabels: { back, confirm, primary, secondaryLeft, secondaryRight }, regionTitles? }
 *   visuals: { textureKeyForItem(item), labelForItem(item), subtitleForItem?(item) }
 *   actions: { onSelectionChange?(item, state), onConfirm?(item, state), onBack?(), onPrimaryAction?(state), onPreviewAction?(state) }
 *   options: { initialView?, initialFocus?, enableKeyboard?, showLeftPanel?, showRightPanel?, showPreview? }
 *
 * No imports from commanders.js, CaptureSupport, or scene navigation.
 */

import { Theme, PixelButton, PixelLabel } from '../ui/index.js'
import { LayoutEditor } from '../systems/LayoutEditor.js'
import { SelectionMenuPresenter, WIDGET_VIEW_IDS } from './SelectionMenuPresenter.js'
import {
  buildBackgroundLayer,
  buildPanelLayer,
  buildFeaturedLayer,
  buildPreviewLayer,
} from './SelectionMenuLayerBuilder.js'

const INPUT_CAPTURE = 'W,S,A,D,UP,DOWN,LEFT,RIGHT,SPACE,ENTER,TAB,ESC'

export class SelectionMenuWidget {
  constructor(scene, config) {
    this.scene     = scene
    this.config    = config
    this._sceneKey = scene.scene.key
    this._presenter = new SelectionMenuPresenter(scene.cameras.main.width, scene.cameras.main.height)

    // State
    this.currentView        = 'center'
    this.centerFocus        = config.options?.initialFocus ?? 'featured'
    this.featuredFocusIndex = 0
    this.selectedItem       = null
    this.widgetBusy         = false

    // Layer containers
    this._layerGroups = {}

    // Display refs (set by builders)
    this._featuredDisplays  = []
    this._previewLeft       = null
    this._previewRight      = null
    this._previewHitFlash   = null
    this._previewHotspot    = null
    this._previewTimer      = null
    this._leftPanelTitle    = null
    this._leftPanelHeader   = null
    this._leftPanelHitzone  = null
    this._rightPanelTitle   = null
    this._rightPanelHeader  = null
    this._rightPanelHitzone = null

    // UI overlay refs
    this._hintLabel            = null
    this._backBtn              = null
    this._confirmBtn           = null
    this._keyHandler         = null
    this._bgClickHandler     = null
    this._pointerDownHandled = false

    this._build()
    this._createUiOverlay()
    this._bindInput()

    const initialView = config.options?.initialView ?? 'center'
    this._changeView(WIDGET_VIEW_IDS.includes(initialView) ? initialView : 'center', { instant: true, reason: 'widget init' })
    this._updateSelectionState()

    scene.events.once('shutdown', () => this.destroy())
    console.log(`[Widget] SelectionMenuWidget created in scene ${this._sceneKey}`)
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  _build() {
    const centerView    = this._presenter.getViewpoint('center')
    const slotsInOrder  = ['background', 'leftPanel', 'rightPanel', 'preview', 'featured']
    const depths        = { background: 0, leftPanel: 2, rightPanel: 2, preview: 4, featured: 5 }

    for (const slotId of slotsInOrder) {
      const state     = centerView.layers[slotId]
      const container = this.scene.add.container(state.x, state.y).setDepth(depths[slotId] ?? 0)
      container.setScale(state.scale)
      container.setAlpha(state.alpha)
      this._layerGroups[slotId] = container
    }

    const items = this.config.items ?? {}

    buildBackgroundLayer(this.scene, this._layerGroups.background)

    const panelCbs = {
      isBusy:      () => this.widgetBusy,
      getView:     () => this.currentView,
      changeView:  (v, o) => this._changeView(v, o),
      markHandled: () => { this._pointerDownHandled = true },
    }

    if (this.config.options?.showLeftPanel !== false) {
      const slots = this._presenter.getPanelSlots('left')
      const { title, header, hitzone } = buildPanelLayer(this.scene, this._layerGroups.leftPanel, 'left', items.leftPanel ?? [], slots, this.config, panelCbs)
      this._leftPanelTitle   = title
      this._leftPanelHeader  = header
      this._leftPanelHitzone = hitzone
    }

    if (this.config.options?.showRightPanel !== false) {
      const slots = this._presenter.getPanelSlots('right')
      const { title, header, hitzone } = buildPanelLayer(this.scene, this._layerGroups.rightPanel, 'right', items.rightPanel ?? [], slots, this.config, panelCbs)
      this._rightPanelTitle   = title
      this._rightPanelHeader  = header
      this._rightPanelHitzone = hitzone
    }

    if (this.config.options?.showPreview !== false) {
      const previewCbs = {
        isBusy:         () => this.widgetBusy,
        getView:        () => this.currentView,
        setCenterFocus: (t, r) => this._setCenterFocus(t, r),
        changeView:     (v, o) => this._changeView(v, o),
        pulsePreview:   (r)    => this._pulsePreview(r),
        markHandled:    () => { this._pointerDownHandled = true },
      }
      const refs = buildPreviewLayer(this.scene, this._layerGroups.preview, this.config, previewCbs)
      this._previewLeft     = refs.previewLeft
      this._previewRight    = refs.previewRight
      this._previewHitFlash = refs.hitFlash
      this._previewHotspot  = refs.hotspot
      this._previewTimer    = refs.timer
    }

    const featuredCbs = {
      isBusy:             () => this.widgetBusy,
      getView:            () => this.currentView,
      setCenterFocus:     (t, r) => this._setCenterFocus(t, r),
      setFeaturedFocus:   (i, r) => this._setFeaturedFocus(i, r),
      changeView:         (v, o) => this._changeView(v, o),
      selectFeaturedItem: (i, r) => this._selectFeaturedItem(i, r),
      markHandled:        () => { this._pointerDownHandled = true },
      onFeaturedHoverEnter: (i, item, sprite) =>
        this.config.actions?.onFeaturedHoverEnter?.(i, item, sprite, this.getState()),
      onFeaturedHoverLeave: (i) =>
        this.config.actions?.onFeaturedHoverLeave?.(i, this.getState()),
    }
    this._featuredDisplays = buildFeaturedLayer(
      this.scene, this._layerGroups.featured,
      items.featured ?? [], this._presenter.getFeaturedSlots(),
      this.config, featuredCbs
    )

  }

  // -------------------------------------------------------------------------
  // UI Overlay
  // -------------------------------------------------------------------------

  _createUiOverlay() {
    const { width, height } = this.scene.cameras.main
    const labels            = this.config.text?.actionLabels ?? {}

    console.log('[Widget] Removed legacy header chrome (headerLabel + controlsLabel + bg rect)')

    this._hintLabel = new PixelLabel(this.scene, width / 2, height - 18, '', { scale: 1, color: 'ambient', align: 'center' })
    this._hintLabel.setDepth(21)
    LayoutEditor.register(this.scene, 'hintLabel', this._hintLabel, width / 2, height - 18)

    if (this.config.options?.showBack !== false) {
      this._backBtn = new PixelButton(this.scene, 66, height - 32, labels.back ?? 'BACK', () => {
        if (this.widgetBusy) return
        console.log(`[Widget] Back → main menu`)
        this.config.actions?.onBack?.()
      }, { style: 'filled', scale: 2, bg: Theme.error, pill: true })
      this._backBtn.setDepth(21)
      LayoutEditor.register(this.scene, 'backBtn', this._backBtn, 66, height - 32)
    } else {
      console.log(`[Widget] Back button hidden (showBack: false)`)
    }

    this._confirmBtn = new PixelButton(this.scene, width - 130, height - 34, labels.confirm ?? 'CONFIRM', () => {
      if (!this.selectedItem || this.widgetBusy) return
      console.log(`[Widget] Confirm: ${this.selectedItem.id}`)
      this.config.actions?.onConfirm?.(this.selectedItem, this.getState())
    }, { style: 'filled', scale: 2, bg: Theme.accent, width: 156, height: 34 })
    this._confirmBtn.setEnabled(false)
    this._confirmBtn.setDepth(21)
    LayoutEditor.register(this.scene, 'confirmBtn', this._confirmBtn, width - 130, height - 34)
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  _bindInput() {
    if (this.config.options?.enableKeyboard !== false && this.scene.input.keyboard) {
      this.scene.input.keyboard.addCapture(INPUT_CAPTURE)
      this._keyHandler = (event) => this._handleKeyDown(event)
      this.scene.input.keyboard.on('keydown', this._keyHandler)
    } else if (this.config.options?.enableKeyboard !== false) {
      console.warn('[Widget] Keyboard plugin missing — mouse controls only')
    }

    // Background click: any click that didn't land on an interactive zone steps back
    this._bgClickHandler = () => {
      if (this._pointerDownHandled) { this._pointerDownHandled = false; return }
      if (!this.widgetBusy && this.currentView !== 'center') {
        this._handleBack('background click')
      }
    }
    this.scene.input.on('pointerdown', this._bgClickHandler)
  }

  _handleKeyDown(event) {
    if (this.widgetBusy) return
    const code = event.code ?? event.key ?? ''

    switch (code) {
      case 'ArrowLeft':  case 'KeyA': case 'a': case 'A':
        event.preventDefault(); this._handleTurn(-1, code); break
      case 'ArrowRight': case 'KeyD': case 'd': case 'D':
        event.preventDefault(); this._handleTurn(1, code); break
      case 'ArrowUp':    case 'KeyW': case 'w': case 'W':
        event.preventDefault(); this._handleAdvance(code); break
      case 'ArrowDown':  case 'KeyS': case 's': case 'S': case 'Escape':
        event.preventDefault(); this._handleBack(code); break
      case 'Space': case 'Enter': case 'KeyE': case 'e': case 'E':
        event.preventDefault(); this._handleInteract(code); break
      case 'Tab':
        event.preventDefault(); this._cycleCenterFocus('Tab'); break
    }
  }

  _handleTurn(direction, reason) {
    if (this.widgetBusy) return
    const opts = this.config.options ?? {}
    if (this.currentView === 'center') {
      if (direction < 0 && opts.showLeftPanel  === false) { console.log(`[Widget] Turn left blocked (showLeftPanel: false)`); return }
      if (direction > 0 && opts.showRightPanel === false) { console.log(`[Widget] Turn right blocked (showRightPanel: false)`); return }
      this._changeView(direction < 0 ? 'left' : 'right', { reason }); return
    }
    if (this.currentView === 'left'  && direction > 0) { this._changeView('center', { reason }); return }
    if (this.currentView === 'right' && direction < 0) { this._changeView('center', { reason }); return }
    if (this.currentView === 'featuredClose') {
      const next = (this.featuredFocusIndex + direction + this._featuredDisplays.length) % this._featuredDisplays.length
      this._setFeaturedFocus(next, reason)
    }
  }

  _handleAdvance(reason) {
    if (this.widgetBusy) return
    const opts = this.config.options ?? {}
    if (this.currentView === 'center') {
      const wantPreview = this.centerFocus === 'preview' && opts.showPreview !== false
      this._changeView(wantPreview ? 'previewClose' : 'featuredClose', { reason }); return
    }
    if (this.currentView === 'left' || this.currentView === 'right') {
      this._changeView('center', { reason }); return
    }
    if (this.currentView === 'featuredClose') { this._selectFeaturedItem(this.featuredFocusIndex, reason); return }
    if (this.currentView === 'previewClose')  { this._pulsePreview(reason) }
  }

  _handleInteract(reason) {
    if (this.widgetBusy) return
    if (this.currentView === 'featuredClose') { this._selectFeaturedItem(this.featuredFocusIndex, reason); return }
    if (this.currentView === 'previewClose')  { this._pulsePreview(reason); return }
    this._handleAdvance(reason)
  }

  _handleBack(reason) {
    if (this.widgetBusy) return
    if (this.currentView !== 'center') this._changeView('center', { reason })
  }

  _cycleCenterFocus(reason) {
    if (this.currentView !== 'center') return
    if (this.config.options?.showPreview === false) return
    this._setCenterFocus(this.centerFocus === 'featured' ? 'preview' : 'featured', reason)
  }

  _setCenterFocus(target, reason) {
    if (!['featured', 'preview'].includes(target)) return
    if (this.centerFocus === target) { this._updateSelectionState(); return }
    this.centerFocus = target
    console.log(`[Widget] Center focus -> ${target} (${reason})`)
    this._updateSelectionState()
  }

  _setFeaturedFocus(index, reason) {
    if (index < 0 || index >= this._featuredDisplays.length) return
    if (this.featuredFocusIndex === index) { this._updateSelectionState(); return }
    this.featuredFocusIndex = index
    console.log(`[Widget] Featured focus -> index ${index} (${reason})`)
    this._updateSelectionState()
  }

  _selectFeaturedItem(index, reason) {
    const display = this._featuredDisplays[index]
    if (!display) return
    this.selectedItem       = display.item
    this.featuredFocusIndex = index
    console.log(`[Widget] Selected item: ${display.item.id} via ${reason}`)
    this.config.actions?.onSelectionChange?.(this.selectedItem, this.getState())
    this._updateSelectionState()
  }

  // -------------------------------------------------------------------------
  // View transitions
  // -------------------------------------------------------------------------

  _changeView(viewId, { instant = false, reason = 'unknown' } = {}) {
    if (!WIDGET_VIEW_IDS.includes(viewId)) {
      console.warn(`[Widget] Unknown view "${viewId}", ignoring`)
      return
    }
    const previousView = this.currentView
    const nextView     = this._presenter.getViewpoint(viewId)

    if (viewId === previousView && !instant) { this._updateSelectionState(); return }

    if (viewId === 'featuredClose') this._setCenterFocus('featured', `entered ${viewId}`)
    if (viewId === 'previewClose')  this._setCenterFocus('preview',  `entered ${viewId}`)

    console.log(`[Widget] View: ${previousView} -> ${viewId} (${reason})`)
    this.currentView = viewId
    this.widgetBusy  = !instant

    const isCloseUp = viewId === 'featuredClose' || viewId === 'previewClose'

    for (const [slotId, state] of Object.entries(nextView.layers)) {
      const container = this._layerGroups[slotId]
      if (!container) continue
      this.scene.tweens.killTweensOf(container)

      if (instant) {
        container.x = state.x; container.y = state.y
        container.setScale(state.scale); container.setAlpha(state.alpha)
      } else {
        this.scene.tweens.add({
          targets: container,
          x: state.x, y: state.y, scaleX: state.scale, scaleY: state.scale, alpha: state.alpha,
          duration: nextView.duration,
          ease:     isCloseUp ? 'Cubic.easeOut' : 'Sine.easeInOut',
        })
      }
    }

    // Depth priority: the active/clicked layer always renders on top.
    // Default (center, left, right, featuredClose) → featured (dudes) on top.
    // Only previewClose flips it so the Battle Archive zooms in front.
    if (viewId === 'previewClose') {
      this._layerGroups.preview?.setDepth(5)
      this._layerGroups.featured?.setDepth(4)
    } else {
      this._layerGroups.preview?.setDepth(4)
      this._layerGroups.featured?.setDepth(5)
    }

    if (!instant) {
      this.scene.time.delayedCall(nextView.duration + 16, () => {
        this.widgetBusy = false
        this._updateSelectionState()
      })
    }

    this._updateSelectionState()
  }

  _pulsePreview(reason) {
    if (!this._previewHitFlash) return
    console.log(`[Widget] Preview pulse (${reason})`)
    this.scene.tweens.killTweensOf(this._previewHitFlash)
    this._previewHitFlash.setAlpha(0.34)
    this.scene.tweens.add({ targets: this._previewHitFlash, alpha: 0, duration: 180, ease: 'Quad.easeOut' })
    if (this._previewLeft && this._previewRight) {
      this.scene.tweens.add({ targets: [this._previewLeft, this._previewRight], y: '+=3', duration: 90, ease: 'Sine.easeOut', yoyo: true })
    }
    this.config.actions?.onPreviewAction?.(this.getState())
  }

  // -------------------------------------------------------------------------
  // State sync
  // -------------------------------------------------------------------------

  _updateSelectionState() {
    for (let i = 0; i < this._featuredDisplays.length; i++) {
      const display    = this._featuredDisplays[i]
      const isSelected = this.selectedItem?.id === display.item?.id
      const isFocused  = this.currentView === 'featuredClose'
        ? i === this.featuredFocusIndex
        : this.centerFocus === 'featured' && i === this.featuredFocusIndex

      display.glow.setFillStyle(
        isSelected ? Theme.fantasyGoldBright : Theme.accent,
        isSelected ? 0.42 : isFocused ? 0.24 : 0.08
      )
      display.frame.setStrokeStyle(
        isSelected || isFocused ? 2 : 1,
        isSelected ? Theme.fantasyGoldBright : isFocused ? Theme.hover : Theme.panelBorder,
        isSelected ? 1 : 0.88
      )
      display.name.setTint(isSelected ? Theme.fantasyGoldBright : isFocused ? Theme.hover : Theme.primaryText)
      display.hint.setTint(isSelected ? Theme.warning : isFocused ? Theme.accent : Theme.ambientText)
      display.shadow.setFillStyle(0x000000, isSelected ? 0.42 : 0.32)

      if (display.art?.setTint) display.art.setTint(isSelected ? 0xfff1c4 : 0xffffff)
      if (display.art?.setScale) {
        const base = display.art.baseScale ?? display.art.scaleX
        display.art.setScale(base * (isSelected ? 1.1 : isFocused ? 1.04 : 1))
      }
    }

    this._confirmBtn?.setEnabled(!!this.selectedItem)
    this._syncUiState(this._presenter.getViewpoint(this.currentView).prompt)
  }

  _syncUiState(_viewPrompt) {
    const hint = this._getFocusPrompt()
    this._hintLabel?.setText(hint)
    console.log(`[Widget] Hint → ${hint}  (view=${this.currentView})`)

    const panelsInteractive = !this.widgetBusy && (this.currentView === 'center' || this.currentView === 'featuredClose')
    if (this._leftPanelHitzone?.input)  this._leftPanelHitzone.input.enabled  = panelsInteractive
    if (this._rightPanelHitzone?.input) this._rightPanelHitzone.input.enabled = panelsInteractive

    if (this._previewHotspot?.input) {
      this._previewHotspot.input.enabled = !this.widgetBusy && (this.currentView === 'center' || this.currentView === 'previewClose')
    }
    for (const display of this._featuredDisplays) {
      if (!display.hitZone?.input) continue
      display.hitZone.input.enabled = !this.widgetBusy && (this.currentView === 'center' || this.currentView === 'featuredClose')
    }

    if (this._leftPanelTitle)  this._leftPanelTitle.setVisible(this.currentView === 'left')
    if (this._leftPanelHeader) this._leftPanelHeader.setVisible(this.currentView === 'left')
    if (this._rightPanelTitle)  this._rightPanelTitle.setVisible(this.currentView === 'right')
    if (this._rightPanelHeader) this._rightPanelHeader.setVisible(this.currentView === 'right')

    for (let i = 0; i < this._featuredDisplays.length; i++) {
      const d = this._featuredDisplays[i]
      if (d.hint) d.hint.setVisible(this.currentView === 'featuredClose' && i === this.featuredFocusIndex)
    }
  }

  _getFocusPrompt() {
    const opts = this.config.options ?? {}
    const canTurn  = opts.showLeftPanel !== false || opts.showRightPanel !== false
    const canPrev  = opts.showPreview !== false
    const turnHint = canTurn ? '   [A/D] look' : ''
    if (this.currentView === 'center') {
      if (canPrev && this.centerFocus === 'preview') return '[W] open   [TAB] switch focus' + turnHint
      const parts = ['[W] inspect']
      if (canPrev) parts.push('[TAB] preview')
      if (canTurn) parts.push('[A/D] look')
      return parts.join('   ')
    }
    if (this.currentView === 'featuredClose') return '[A/D] browse   [E] select   [S] back'
    if (this.currentView === 'previewClose')  return '[E] pulse   [S] back'
    return '[W] re-center   [S] step back'
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  destroy() {
    if (this._previewTimer) { this._previewTimer.destroy(); this._previewTimer = null }
    for (const container of Object.values(this._layerGroups)) {
      if (container) this.scene.tweens.killTweensOf(container)
    }
    if (this.scene.input.keyboard && this._keyHandler) {
      this.scene.input.keyboard.off('keydown', this._keyHandler)
      if (this.scene.input.keyboard.removeCapture) {
        this.scene.input.keyboard.removeCapture(INPUT_CAPTURE)
      }
    }
    if (this._bgClickHandler) {
      this.scene.input.off('pointerdown', this._bgClickHandler)
      this._bgClickHandler = null
    }
    LayoutEditor.unregisterScene(this._sceneKey)
    console.log(`[Widget] Destroyed in scene ${this._sceneKey}`)
  }

  getState() {
    return {
      currentView:        this.currentView,
      centerFocus:        this.centerFocus,
      featuredFocusIndex: this.featuredFocusIndex,
      focusedItem:        this._featuredDisplays[this.featuredFocusIndex]?.item ?? null,
      selectedItem:       this.selectedItem,
      widgetBusy:         this.widgetBusy,
    }
  }

  setItems(nextItems) {
    Object.assign(this.config.items, nextItems)
    if (nextItems.featured) {
      this._layerGroups.featured?.destroy()
      const state = this._presenter.getViewpoint('center').layers.featured
      const featuredDepth = this.currentView === 'previewClose' ? 4 : 5
      this._layerGroups.featured = this.scene.add.container(state.x, state.y).setDepth(featuredDepth)
      this._featuredDisplays     = []
      const featuredCbs = {
        isBusy:             () => this.widgetBusy,
        getView:            () => this.currentView,
        setCenterFocus:     (t, r) => this._setCenterFocus(t, r),
        setFeaturedFocus:   (i, r) => this._setFeaturedFocus(i, r),
        changeView:         (v, o) => this._changeView(v, o),
        selectFeaturedItem: (i, r) => this._selectFeaturedItem(i, r),
        onFeaturedHoverEnter: (i, item, sprite) =>
          this.config.actions?.onFeaturedHoverEnter?.(i, item, sprite, this.getState()),
        onFeaturedHoverLeave: (i) =>
          this.config.actions?.onFeaturedHoverLeave?.(i, this.getState()),
      }
      this._featuredDisplays = buildFeaturedLayer(
        this.scene, this._layerGroups.featured,
        nextItems.featured, this._presenter.getFeaturedSlots(),
        this.config, featuredCbs
      )
    }
    this._updateSelectionState()
    console.log(`[Widget] Items updated`)
  }

  setSelectedItem(id) {
    const index = this._featuredDisplays.findIndex(d => d.item?.id === id)
    if (index >= 0) this._selectFeaturedItem(index, 'setSelectedItem')
  }

  setText(nextText) {
    Object.assign(this.config.text, nextText)
    if (nextText.actionLabels) {
      this._syncUiState(this._presenter.getViewpoint(this.currentView).prompt)
    }
    console.log(`[Widget] Text updated:`, Object.keys(nextText))
  }
}
