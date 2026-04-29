import { AchievementManager } from '../systems/AchievementManager.js'
import { PixelLabel } from '../ui/PixelLabel.js'
import { Theme } from '../ui/Theme.js'
import { SoundManager } from '../systems/SoundManager.js'

export class AchievementToast {
  static flushPending(scene) {
    const queue = AchievementManager.pendingToasts()
    if (!queue.length) return
    let delay = 0
    for (const achievement of queue) {
      scene.time.delayedCall(delay, () => AchievementToast._show(scene, achievement))
      delay += 3000
    }
  }

  static _show(scene, achievement) {
    const { width } = scene.cameras.main
    const toastW = 250, toastH = 70
    const finalX = width - toastW / 2 - 16
    const startX = width + toastW
    const y = 16 + toastH / 2

    const container = scene.add.container(startX, y).setDepth(100)

    const bg = scene.add.rectangle(0, 0, toastW, toastH, Theme.panelBg)
      .setStrokeStyle(1, Theme.accent)
    const icon = scene.add.image(-toastW / 2 + 20, 0, 'card-icon-Icon1').setScale(3).setOrigin(0.5)
    const header = new PixelLabel(scene, -toastW / 2 + 52, -12, 'ACHIEVEMENT', { scale: 1, color: 'accent' })
    const title  = new PixelLabel(scene, -toastW / 2 + 52,   2, achievement.name.toUpperCase(), { scale: 2 })
    const desc   = new PixelLabel(scene, -toastW / 2 + 52,  18, achievement.description, { scale: 1, color: 'dim' })
    container.add([bg, icon, header, title, desc])

    scene.tweens.add({
      targets: container, x: finalX, duration: 300, ease: 'Quad.Out',
      onComplete: () => {
        scene.time.delayedCall(2200, () => {
          scene.tweens.add({
            targets: container, x: startX, duration: 500, ease: 'Quad.In',
            onComplete: () => container.destroy(),
          })
        })
      },
    })

    SoundManager.uiHover()
    console.log(`[Achievement] toast shown: ${achievement.id}`)
  }
}
