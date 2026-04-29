import { Scene } from 'phaser'
import { AchievementManager } from '../systems/AchievementManager.js'
import { AchievementToast }   from '../widgets/AchievementToast.js'
import { LayoutEditor }        from '../systems/LayoutEditor.js'
import { PixelButton }         from '../ui/PixelButton.js'
import { PixelLabel }          from '../ui/PixelLabel.js'
import { Theme }               from '../ui/Theme.js'

export class AchievementsScene extends Scene {
  constructor() { super('Achievements') }

  create() {
    const { width, height } = this.cameras.main

    const header = new PixelLabel(this, width / 2, 20, 'ACHIEVEMENTS', { scale: 4, color: 'accent', align: 'center' })
    const backBtn = new PixelButton(this, width - 60, 20, 'BACK', () => {
      console.log('[Achievements] Back to Menu')
      this.scene.start('Menu')
    }, { scale: 2 })
    LayoutEditor.register(this, 'header', header, width / 2, 20)
    LayoutEditor.register(this, 'backBtn', backBtn, width - 60, 20)

    const headerH = 44
    const rowH = 50
    const listContainer = this.add.container(0, headerH)
    LayoutEditor.register(this, 'listContainer', listContainer, 0, headerH)

    const all = AchievementManager.getAll()
    const unlockedMap = AchievementManager.getUnlocked()
    const unlockedIds = Object.keys(unlockedMap)

    all.forEach((def, i) => {
      const isUnlocked = unlockedIds.includes(def.id)
      const isHidden   = def.hidden && !isUnlocked
      const y          = i * rowH + rowH / 2
      const rowAlpha   = isUnlocked ? 1 : 0.4

      const icon = this.add.image(32, y, 'card-icon-Icon1').setScale(3).setAlpha(rowAlpha)
      const name = new PixelLabel(this, 72, y - 8,
        isHidden ? '???' : def.name.toUpperCase(),
        { scale: 2, color: isUnlocked ? 'text' : 'dim' })
      const descLabel = new PixelLabel(this, 72, y + 8,
        isHidden ? '???' : def.description,
        { scale: 1, color: 'dim' })

      listContainer.add([icon, name, descLabel])

      if (isUnlocked) {
        const date = unlockedMap[def.id]?.slice(0, 10) ?? ''
        const check = new PixelLabel(this, width - 16, y - 8, '✓', { scale: 2, color: 'success', align: 'right' })
        const dateLabel = new PixelLabel(this, width - 16, y + 8, date, { scale: 1, color: 'dim', align: 'right' })
        listContainer.add([check, dateLabel])
      }
    })

    const listH = all.length * rowH
    const viewportH = height - headerH
    const minY = Math.min(headerH, viewportH - listH + headerH)
    const _wheelHandler = (_, __, ___, deltaY) => {
      listContainer.y = Phaser.Math.Clamp(listContainer.y - deltaY * 0.5, minY, headerH)
    }
    this.input.on('wheel', _wheelHandler)

    this.events.once('shutdown', () => {
      this.input.off('wheel', _wheelHandler)
      LayoutEditor.unregisterScene('Achievements')
    })

    AchievementToast.flushPending(this)
    console.log('[Achievements] Scene created')
  }
}
