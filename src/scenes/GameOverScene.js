import { Scene } from 'phaser';
import { Theme, PixelLabel, PixelButton, FloatingBanner } from '../ui/index.js';

export class GameOverScene extends Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this.finalRound = data.round || 1;
  }

  create() {
    const { width, height } = this.cameras.main;

    // Scanlines
    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.08);
    }

    new PixelLabel(this, width / 2, height * 0.25, 'GAME OVER', {
      scale: 8, color: 'error', align: 'center',
    });

    new PixelLabel(this, width / 2, height * 0.40, `Survived ${this.finalRound} rounds`, {
      scale: 3, color: 'muted', align: 'center',
    });

    // Divider
    const gfx = this.add.graphics();
    gfx.lineStyle(1, Theme.panelBorder, 0.5);
    gfx.lineBetween(width * 0.3, height * 0.48, width * 0.7, height * 0.48);

    new PixelButton(this, width / 2, height * 0.58, 'PLAY AGAIN', () => {
      this.scene.start('Shop', { round: 1, gold: 10, lives: 3, team: [] });
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 200, height: 44 });

    new PixelButton(this, width / 2, height * 0.70, 'MAIN MENU', () => {
      this.scene.start('Menu');
    }, { style: 'text', scale: 2 });
  }
}
