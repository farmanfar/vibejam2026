import { AUTO, Scale, Game } from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { HallOfFameScene } from './scenes/HallOfFameScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { UnitLabScene } from './scenes/UnitLabScene.js';
import { LayoutEditor } from './systems/LayoutEditor.js';

const config = {
  type: AUTO,
  parent: 'game-container',
  width: 960,
  height: 540,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#111118',
  scale: {
    mode: Scale.FIT,
    autoCenter: Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, ShopScene, BattleScene, GameOverScene, HallOfFameScene, SettingsScene, UnitLabScene],
};

const game = new Game(config);
LayoutEditor.init(game);
