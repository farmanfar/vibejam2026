/**
 * Split-screen parallax background for BattleScene.
 * Left half shows one PENUSBMIC parallax set, right half shows another.
 * Advance Wars-style cinematic split.
 *
 * Architecture: no masks (Phaser 4 GeometryMask is Canvas-only in WebGL).
 * Each side renders as separate half-width TileSprites per layer.
 * Textures are PENUSBMIC parallax PNGs preloaded in BootScene.
 *
 * Scrolling math ported from HammerTime ParallaxRenderer.cs (depth-based speed formula).
 */

import { getSetLayers } from './FactionPalettes.js'
import { Theme } from '../ui/Theme.js'

export class ParallaxBackground {
  /**
   * @param {object} config
   * @param {Phaser.Scene} config.scene
   * @param {number} config.width - Full display width (960)
   * @param {number} config.height - Sky area height (360)
   * @param {string} config.leftSet - Parallax set ID for left side
   * @param {string} config.rightSet - Parallax set ID for right side
   * @param {number} [config.scrollSpeed=15] - Base scroll speed in px/sec for fastest layer
   */
  constructor(config) {
    this.scene = config.scene
    this.width = config.width
    this.height = config.height
    this.halfW = Math.floor(config.width / 2)
    this.leftSetId = config.leftSet
    this.rightSetId = config.rightSet
    this.leftLayers = getSetLayers(config.leftSet)
    this.rightLayers = getSetLayers(config.rightSet)
    this.scrollSpeed = config.scrollSpeed ?? 15
    this.elapsed = 0

    this.leftTiles = []
    this.rightTiles = []
    this.gameObjects = []

    console.log(`[Parallax] Init: left=${config.leftSet} (${this.leftLayers.length} layers) right=${config.rightSet} (${this.rightLayers.length} layers)`)
  }

  create() {
    this._createSideLayers('left', this.leftSetId, this.leftLayers, this.leftTiles)
    this._createSideLayers('right', this.rightSetId, this.rightLayers, this.rightTiles)
    this._createCenterSeam()

    // Clean up on ANY scene exit
    this.scene.events.on('shutdown', this._onShutdown, this)
    this.scene.events.on('destroy', this._onShutdown, this)

    console.log(`[Parallax] Created: ${this.gameObjects.length} objects`)
  }

  update(time, delta) {
    this.elapsed += delta / 1000

    this._updateSide(this.leftTiles, 1)   // left scrolls left (outward)
    this._updateSide(this.rightTiles, -1)  // right scrolls right (outward)
  }

  destroy() {
    this._onShutdown()
  }

  // --- Layer creation ---

  _createSideLayers(side, setId, layers, tilesArray) {
    const isLeft = side === 'left'
    const xCenter = isLeft ? this.halfW / 2 : this.halfW + this.halfW / 2
    const layerCount = layers.length

    for (let i = 0; i < layerCount; i++) {
      const texKey = `plx_${setId}_${i}`

      if (!this.scene.textures.exists(texKey)) {
        console.warn(`[Parallax] Missing texture: ${texKey} — skipping layer`)
        tilesArray.push(null)
        continue
      }

      // Get source texture dimensions to calculate proper scale
      // (ported from HammerTime ParallaxRenderer.cs lines 101-104)
      const srcImage = this.scene.textures.get(texKey).getSourceImage()
      const texH = srcImage.height
      const texW = srcImage.width

      // Scale texture so its height fills display height exactly (no vertical tiling).
      // Use uniform scale to maintain aspect ratio — only horizontal tiling occurs.
      const scale = this.height / texH

      const tile = this.scene.add.tileSprite(
        xCenter, this.height / 2,
        this.halfW, this.height,
        texKey,
      )
      tile.setOrigin(0.5)
      tile.setTileScale(scale, scale)
      tile.setDepth(1 + i)

      tilesArray.push(tile)
      this.gameObjects.push(tile)

      console.log(`[Parallax] Layer ${side}_${i}: tex=${texKey} ${texW}x${texH} scale=${scale.toFixed(2)} at (${xCenter}, ${this.height / 2})`)
    }
  }

  // --- Scrolling ---

  _updateSide(tiles, direction) {
    const layerCount = tiles.length
    if (layerCount === 0) return

    for (let i = 0; i < layerCount; i++) {
      const tile = tiles[i]
      if (!tile) continue

      // Speed: back layer (i=0) = 10%, front layer (i=N-1) = 100%
      // Ported from HammerTime ParallaxRenderer.cs lines 111-113
      const speedFactor = layerCount === 1 ? 1
        : 0.1 + 0.9 * (i / (layerCount - 1))
      const offset = this.elapsed * this.scrollSpeed * speedFactor

      tile.tilePositionX = offset * direction
    }
  }

  // --- Center seam ---

  _createCenterSeam() {
    const gfx = this.scene.add.graphics()

    // Divider line
    gfx.fillStyle(Theme.panelBorder, 0.6)
    gfx.fillRect(this.halfW - 1, 0, 2, this.height)

    // Soft fog gradients on each side of the seam
    const fogW = 20
    const fogColor = Theme.screenBg
    for (let i = 0; i < fogW; i++) {
      const alpha = 0.3 * (1 - i / fogW)
      gfx.fillStyle(fogColor, alpha)
      gfx.fillRect(this.halfW - fogW + i, 0, 1, this.height)
    }
    for (let i = 0; i < fogW; i++) {
      const alpha = 0.3 * (1 - (fogW - 1 - i) / fogW)
      gfx.fillStyle(fogColor, alpha)
      gfx.fillRect(this.halfW + i, 0, 1, this.height)
    }

    gfx.setDepth(20) // above all parallax layers
    this.gameObjects.push(gfx)
  }

  // --- Cleanup ---

  _onShutdown() {
    this.scene.events.off('shutdown', this._onShutdown, this)
    this.scene.events.off('destroy', this._onShutdown, this)

    for (const obj of this.gameObjects) {
      if (obj && obj.destroy) obj.destroy()
    }
    this.gameObjects.length = 0
    this.leftTiles.length = 0
    this.rightTiles.length = 0

    console.log(`[Parallax] Cleaned up`)
  }
}
