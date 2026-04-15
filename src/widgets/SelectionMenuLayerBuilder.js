/**
 * SelectionMenuLayerBuilder — stock layer renderers for SelectionMenuWidget.
 *
 * Each function populates a Phaser container and returns refs that the widget
 * needs to manage (titles, display objects, hotspots, timers).
 * All pointer-event callbacks are injected so this module has no widget dependency.
 */

import { Theme, FONT_KEY } from '../ui/index.js'

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export function buildBackgroundLayer(scene, container) {
  const bg = scene.add.rectangle(0, -72, 980, 540, 0x0d0b12)
  container.add(bg)
}

// ---------------------------------------------------------------------------
// Panel (left / right)  — returns { title, header }
// ---------------------------------------------------------------------------

export function buildPanelLayer(scene, container, side, items, slots, config, callbacks = null) {
  const regionTitles = config.text?.regionTitles ?? {}
  const titleText    = (side === 'left' ? regionTitles.leftPanel : regionTitles.rightPanel) ?? (side === 'left' ? 'LEFT PANEL' : 'RIGHT PANEL')
  const spriteScale  = config.visuals.spriteScale ?? 1

  const panel  = scene.add.rectangle(0, 0, 184, 414, 0x16141d, 0.78).setStrokeStyle(2, Theme.panelBorder, 0.9)
  const header = scene.add.rectangle(0, -210, 144, 24, Theme.fantasyPurpleDark, 0.88).setStrokeStyle(1, Theme.fantasyBorderGold, 0.9)
  const title  = scene.add.bitmapText(0, -217, FONT_KEY, titleText, 10).setOrigin(0.5).setTint(Theme.fantasyGold)
  container.add([panel, header, title])

  items.forEach((item, index) => {
    const slot = slots[index]
    if (!slot) return

    const frame    = scene.add.rectangle(slot.x, slot.y, 70, 84, 0x12131a, 0.92).setStrokeStyle(1, Theme.panelBorder, 0.95)
    const trim     = scene.add.rectangle(slot.x, slot.y - 32, 54, 10, Theme.fantasyPurpleDark, 0.7)
    const subText  = config.visuals.subtitleForItem ? config.visuals.subtitleForItem(item) : ''
    const idLabel  = scene.add.bitmapText(slot.x, slot.y + 28, FONT_KEY, subText, 8).setOrigin(0.5).setTint(Theme.ambientText)
    container.add([frame, trim, idLabel])
    buildItemSprite(scene, container, item, slot.x, slot.y - 8, 0.24 * spriteScale, config.visuals)
  })

  // Hover highlight + click-to-focus — added on top of all content
  let hitzone = null
  if (callbacks) {
    const targetView = side === 'left' ? 'left' : 'right'
    const hoverRect  = scene.add.rectangle(0, 0, 186, 416, 0xffffff, 0)
    hitzone = scene.add.zone(0, 0, 186, 416).setInteractive({ useHandCursor: true })
    container.add([hoverRect, hitzone])

    hitzone.on('pointerover', () => {
      if (callbacks.isBusy()) return
      const view = callbacks.getView()
      if (view === 'center' || view === 'featuredClose') hoverRect.setAlpha(0.06)
    })
    hitzone.on('pointerout', () => hoverRect.setAlpha(0))
    hitzone.on('pointerdown', () => {
      callbacks.markHandled?.()
      if (callbacks.isBusy()) return
      const view = callbacks.getView()
      if (view === 'center' || view === 'featuredClose') {
        callbacks.changeView(targetView, { reason: `clicked ${side} panel` })
      }
    })
  }

  return { title, header, hitzone }
}

// ---------------------------------------------------------------------------
// Featured items — returns array of display containers
// ---------------------------------------------------------------------------

/**
 * @param {object} callbacks
 *   isBusy()          → boolean
 *   getView()         → string
 *   setCenterFocus(target, reason)
 *   setFeaturedFocus(index, reason)
 *   changeView(viewId, opts)
 *   selectFeaturedItem(index, reason)
 */
export function buildFeaturedLayer(scene, container, items, slots, config, callbacks) {
  const displays    = []
  const spriteScale = config.visuals.spriteScale ?? 1

  slots.forEach((slot, index) => {
    const item = items[index]
    if (!item) return

    const display    = scene.add.container(slot.x, slot.y)
    display.baseY    = slot.y
    display.item     = item

    const shadow     = scene.add.ellipse(0, 82, 110, 26, 0x000000, 0.34)
    const glow       = scene.add.ellipse(0, 78, 130, 30, Theme.accent, 0.08)
    const frame      = scene.add.rectangle(0, -46, 110, 152, 0x13151c, 0.94).setStrokeStyle(2, Theme.panelBorder, 0.88)
    display.add([shadow, glow, frame])

    const art = buildItemSprite(scene, display, item, 0, -72, 0.9 * spriteScale, config.visuals)
    // Featured-only hook: scenes that need per-featured-sprite setup (e.g.
    // enabling Light2D shading only on the three featured commanders, not the
    // 22 trophy-wall sprites or 2 preview sprites) opt in via this callback.
    if (typeof config.visuals.onFeaturedSpriteCreated === 'function' && art) {
      config.visuals.onFeaturedSpriteCreated(art, item)
    }

    const namePlate  = scene.add.rectangle(0, 26, 118, 18, Theme.fantasyPurpleDark, 1.0).setStrokeStyle(1, Theme.fantasyBorderGold, 0.72)
    const nameText   = scene.add.bitmapText(0, 19, FONT_KEY, config.visuals.labelForItem(item), 8).setOrigin(0.5).setTint(Theme.primaryText)
    const hint       = scene.add.bitmapText(0, 42, FONT_KEY, 'SELECT', 8).setOrigin(0.5).setTint(Theme.ambientText)
    const hitZone    = scene.add.zone(0, 20, 160, 252).setInteractive({ useHandCursor: true })

    display.add([namePlate, nameText, hint, hitZone])

    display.shadow  = shadow
    display.glow    = glow
    display.frame   = frame
    display.name    = nameText
    display.hint    = hint
    display.art     = art
    display.hitZone = hitZone

    hitZone.on('pointerover', () => {
      if (callbacks.isBusy()) return
      const view = callbacks.getView()
      if (view === 'center') {
        callbacks.setCenterFocus('featured', `hovered ${item.name}`)
        callbacks.setFeaturedFocus(index, `hovered ${item.name}`)
      } else if (view === 'featuredClose') {
        callbacks.setFeaturedFocus(index, `hovered ${item.name}`)
      }
      callbacks.onFeaturedHoverEnter?.(index, item, display.art)
    })

    hitZone.on('pointerout', () => {
      callbacks.onFeaturedHoverLeave?.(index)
    })

    hitZone.on('pointerdown', () => {
      callbacks.markHandled?.()
      if (callbacks.isBusy()) return
      const view = callbacks.getView()
      if (view === 'center') {
        callbacks.setCenterFocus('featured', `clicked ${item.name}`)
        callbacks.setFeaturedFocus(index, `clicked ${item.name}`)
        callbacks.selectFeaturedItem(index, `clicked ${item.name} (auto-select on focus)`)
        callbacks.changeView('featuredClose', { reason: `clicked featured item ${item.name}` })
      } else if (view === 'featuredClose') {
        callbacks.setFeaturedFocus(index, `clicked ${item.name}`)
        callbacks.selectFeaturedItem(index, `clicked ${item.name}`)
      }
    })

    scene.tweens.add({
      targets:  display,
      y:        slot.y - 4 - index,
      duration: 1800 + index * 140,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1,
    })

    container.add(display)
    displays.push(display)
  })

  return displays
}

// ---------------------------------------------------------------------------
// Preview panel — returns { previewLeft, previewRight, hitFlash, hotspot, timer }
// ---------------------------------------------------------------------------

/**
 * @param {object} callbacks
 *   isBusy()          → boolean
 *   getView()         → string
 *   setCenterFocus(target, reason)
 *   changeView(viewId, opts)
 *   pulsePreview(reason)
 */
export function buildPreviewLayer(scene, container, config, callbacks) {
  const regionTitle = config.text?.regionTitles?.preview ?? 'PREVIEW'
  const spriteScale = config.visuals.spriteScale ?? 1

  const casing     = scene.add.rectangle(0, 0, 288, 176, 0x11141b, 1).setStrokeStyle(3, Theme.panelBorder, 1)
  const bezel      = scene.add.rectangle(0, 16, 226, 126, 0x07080d, 1).setStrokeStyle(2, Theme.fantasyBorderGold, 0.7)
  const screenGlow = scene.add.rectangle(0, 16, 210, 110, Theme.accent, 0.1)
  const screen     = scene.add.rectangle(0, 16, 206, 106, 0x091018, 1).setStrokeStyle(1, Theme.accentDim, 0.6)
  const lowerPanel = scene.add.rectangle(0, 84, 182, 18, 0x181d26, 1).setStrokeStyle(1, Theme.panelBorder, 0.75)
  const titleText  = scene.add.bitmapText(0, -76, FONT_KEY, regionTitle, 10).setOrigin(0.5).setTint(Theme.fantasyGold)
  const loopLabel  = scene.add.bitmapText(0, 75, FONT_KEY, 'PREVIEW LOOP', 8).setOrigin(0.5).setTint(Theme.ambientText)
  const floorLine  = scene.add.rectangle(0, 58, 126, 4, Theme.panelBorder, 0.6)
  container.add([casing, bezel, screenGlow, screen, lowerPanel, titleText, loopLabel, floorLine])

  for (let y = -30; y <= 58; y += 8) {
    container.add(scene.add.rectangle(0, y, 196, 1, 0x000000, 0.09))
  }

  const previewItems = config.items?.preview ?? config.items?.featured ?? []
  let previewLeft  = null
  let previewRight = null

  const leftItem  = previewItems[0]
  const rightItem = previewItems[1]

  if (leftItem) {
    previewLeft = buildItemSprite(scene, container, leftItem, -46, 20, 0.28 * spriteScale, config.visuals)
    if (previewLeft) {
      previewLeft.setAlpha(0.9)
      scene.tweens.add({ targets: previewLeft,  x: -62, duration: 800, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 })
    }
  }

  if (rightItem) {
    previewRight = buildItemSprite(scene, container, rightItem, 48, 24, 0.28 * spriteScale, config.visuals)
    if (previewRight) {
      previewRight.setAlpha(0.82)
      scene.tweens.add({ targets: previewRight, x: 62,  duration: 860, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 })
    }
  }

  const hitFlash = scene.add.rectangle(0, 16, 206, 106, 0xffffff, 0)
  const hotspot  = scene.add.zone(0, 16, 246, 146).setInteractive({ useHandCursor: true })
  container.add([hitFlash, hotspot])

  hotspot.on('pointerover', () => {
    if (callbacks.isBusy()) return
    const view = callbacks.getView()
    if (view === 'center' || view === 'previewClose') {
      callbacks.setCenterFocus('preview', 'hovered preview panel')
    }
  })

  hotspot.on('pointerdown', () => {
    callbacks.markHandled?.()
    if (callbacks.isBusy()) return
    const view = callbacks.getView()
    if (view === 'center') {
      callbacks.setCenterFocus('preview', 'clicked preview panel')
      callbacks.changeView('previewClose', { reason: 'clicked preview panel' })
    } else if (view === 'previewClose') {
      callbacks.pulsePreview('clicked preview panel')
    }
  })

  const timer = scene.time.addEvent({
    delay:    1600,
    loop:     true,
    callback: () => callbacks.pulsePreview('preview loop tick'),
  })

  return { previewLeft, previewRight, hitFlash, hotspot, timer }
}

// ---------------------------------------------------------------------------
// Foreground divider
// ---------------------------------------------------------------------------

export function buildForegroundLayer(scene, container) {
  const railShadow = scene.add.rectangle(0, 0, 1020, 70, 0x000000, 0.34)
  const rail       = scene.add.rectangle(0, -14, 1000, 24, 0x141820, 1).setStrokeStyle(1, Theme.panelBorder, 0.85)
  const trim       = scene.add.rectangle(0, -26, 760, 6, Theme.fantasyBorderGold, 0.45)
  container.add([railShadow, rail, trim])
}

// ---------------------------------------------------------------------------
// Item sprite helper — shared by all builders
// ---------------------------------------------------------------------------

export function buildItemSprite(scene, parent, item, x, y, scale, visuals) {
  const textureKey = visuals.textureKeyForItem(item)

  if (textureKey && scene.textures.exists(textureKey)) {
    // Resolve the frame via visuals.frameForItem (optional). For multi-frame
    // atlases (Phaser aseprite-loaded), omitting the frame makes Phaser render
    // the full source PNG — a screen-covering artifact on large atlases. See
    // getUnitPortraitRef() in src/rendering/UnitArt.js for the same fix on the
    // WarriorCard code path.
    const frame = typeof visuals.frameForItem === 'function'
      ? visuals.frameForItem(item, scene.textures.get(textureKey))
      : undefined
    // Callers that need frame-playback animations (e.g. MerchantSelectScene)
    // opt in via visuals.animated — the factory returns a Sprite, which
    // extends Image with an AnimationState. CommanderSelectScene leaves the
    // flag unset so its art stays on plain Images (zero regression risk).
    const sprite = visuals.animated
      ? scene.add.sprite(x, y, textureKey, frame).setScale(scale)
      : scene.add.image(x, y, textureKey, frame).setScale(scale)
    sprite.baseScale   = scale
    parent.add(sprite)
    if (typeof visuals.onSpriteCreated === 'function') {
      visuals.onSpriteCreated(sprite, item)
    }
    return sprite
  }

  if (textureKey) {
    console.warn(`[Widget] Missing texture: ${textureKey} for item ${item.id}`)
  }

  const subText   = visuals.subtitleForItem ? visuals.subtitleForItem(item) : (item.id?.slice(0, 4) ?? '?')
  const phRect    = scene.add.rectangle(x, y, 58, 64, Theme.fantasyPurpleDark, 0.95).setStrokeStyle(2, Theme.error, 0.9)
  const phLabel   = scene.add.bitmapText(x, y - 6, FONT_KEY, subText, 8).setOrigin(0.5).setTint(Theme.criticalText)
  parent.add([phRect, phLabel])
  phRect.baseScale = scale
  return phRect
}
