import { Scene } from 'phaser';
import { Theme, FONT_KEY, PixelLabel, PixelButton } from '../ui/index.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';

export class SettingsScene extends Scene {
  constructor() {
    super('Settings');
  }

  create() {
    const { width, height } = this.cameras.main;

    // Scanlines
    for (let y = 0; y < height; y += 4) {
      this.add.rectangle(width / 2, y, width, 1, 0x000000, 0.06);
    }

    const title = new PixelLabel(this, width / 2, height * 0.25, 'SETTINGS', {
      scale: 5, color: 'accent', align: 'center',
    });
    LayoutEditor.register(this, 'title', title, width / 2, height * 0.25);

    const placeholder = new PixelLabel(this, width / 2, height * 0.45, 'Nothing here yet...', {
      scale: 2, color: 'muted', align: 'center',
    });
    LayoutEditor.register(this, 'placeholder', placeholder, width / 2, height * 0.45);

    const backBtn = new PixelButton(this, width / 2, height * 0.70, 'BACK', () => {
      this.scene.start('Menu');
    }, { style: 'filled', scale: 3, bg: Theme.accent, width: 140, height: 40 });
    LayoutEditor.register(this, 'backBtn', backBtn, width / 2, height * 0.70);

    // Shutdown cleanup
    this.events.once('shutdown', () => {
      console.log('[Settings] Shutdown');
      LayoutEditor.unregisterScene('Settings');
    });

    console.log('[Settings] Scene created');
    finalizeCaptureScene('Settings');
  }
}
