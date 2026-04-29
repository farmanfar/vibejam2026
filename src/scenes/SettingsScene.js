import { Scene } from 'phaser';
import { Theme, FONT_KEY, PixelLabel, PixelButton, PixelSlider } from '../ui/index.js';
import { PixelSounds } from '../systems/PixelSounds.js';
import { finalizeCaptureScene } from '../systems/CaptureSupport.js';
import { LayoutEditor } from '../systems/LayoutEditor.js';
import { SceneCrt } from '../rendering/SceneCrt.js';
import { SceneDust } from '../rendering/SceneDust.js';

export class SettingsScene extends Scene {
  constructor() {
    super('Settings');
  }

  create() {
    const { width, height } = this.cameras.main;

    // CRT post-process (strongUi preset — menus/UI screens)
    SceneCrt.attach(this, 'strongUi');
    // Ambient dust — neutral cool motes, sparse
    SceneDust.attach(this, 'settings');

    const title = new PixelLabel(this, width / 2, height * 0.25, 'SETTINGS', {
      scale: 5, color: 'accent', align: 'center',
    });
    LayoutEditor.register(this, 'title', title, width / 2, height * 0.25);

    // Volume sliders. Values live in this.game.registry (session-only — no
    // localStorage by design). Music slider also pushes to the global Phaser
    // SoundManager so any audio added later picks up the chosen volume.
    const musicX = width / 2;
    const musicY = height * 0.42;
    const sfxX   = width / 2;
    const sfxY   = height * 0.55;

    const initialMusic = this.game.registry.get('musicVolume') ?? 1.0;
    const initialSfx   = this.game.registry.get('sfxVolume')   ?? 1.0;
    // Apply persisted music volume to the SoundManager on entry so the slider
    // and the actual master volume agree even before the user touches it.
    this.sound.volume = initialMusic;

    const musicSlider = new PixelSlider(this, musicX, musicY, {
      label: 'MUSIC',
      width: 240,
      steps: 20,
      value: initialMusic,
      onChange: (v) => {
        this.game.registry.set('musicVolume', v);
        this.sound.volume = v;
        console.log('[Settings] Music volume:', v.toFixed(2));
      },
    });
    LayoutEditor.register(this, 'musicSlider', musicSlider, musicX, musicY);

    const sfxSlider = new PixelSlider(this, sfxX, sfxY, {
      label: 'SFX',
      width: 240,
      steps: 20,
      value: initialSfx,
      onChange: (v) => {
        this.game.registry.set('sfxVolume', v);
        PixelSounds.setVolume(v);
        console.log('[Settings] SFX volume:', v.toFixed(2));
      },
    });
    LayoutEditor.register(this, 'sfxSlider', sfxSlider, sfxX, sfxY);

    const backBtn = new PixelButton(this, width / 2, height * 0.70, 'BACK', () => {
      this.scene.start('Menu');
    }, { style: 'filled', scale: 3, bg: Theme.error, pill: true, width: 90, height: 32 });
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
