import { Scene } from 'phaser';
import { Theme, FONT_KEY, PixelButton, PixelLabel } from '../ui/index.js';

export class MenuScene extends Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.cameras.main;

    // Title
    new PixelLabel(this, width / 2, height * 0.2, 'THE HIRED SWORDS', {
      scale: 6, color: 'accent', align: 'center',
    });

    // Subtitle
    new PixelLabel(this, width / 2, height * 0.32, 'An Auto-Battler Roguelike', {
      scale: 2, color: 'muted', align: 'center',
    });

    // Decorative divider
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, Theme.panelBorder, 0.6);
    divGfx.lineBetween(width * 0.3, height * 0.38, width * 0.7, height * 0.38);
    const diamond = this.add.bitmapText(width / 2, height * 0.38 - 5, FONT_KEY, '*', 14)
      .setOrigin(0.5).setTint(Theme.accentDim);

    // Play button (filled, Balatro style)
    new PixelButton(this, width / 2, height * 0.52, 'PLAY', () => {
      this.scene.start('Shop', { round: 1, gold: 10, lives: 3, team: [] });
    }, { style: 'filled', scale: 4, bg: Theme.accent, width: 180, height: 48 });

    // Version / credits
    new PixelLabel(this, width / 2, height * 0.78, 'Vibe Jam 2026', {
      scale: 2, color: 'muted', align: 'center',
    });
    new PixelLabel(this, width / 2, height * 0.84, 'Art: PENUSBMIC  |  Code: 100% AI', {
      scale: 2, color: 'ambient', align: 'center',
    });

    // Subtle scanline effect (CRT nod)
    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.06);
    }
  }
}
