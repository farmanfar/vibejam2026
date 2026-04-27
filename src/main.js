import { AUTO, Scale, Game } from 'phaser';
import { FilterCRT } from './rendering/FilterCRT.js';
import { FilterOutline } from './rendering/FilterOutline.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { ModeSelectScene } from './scenes/ModeSelectScene.js';
import { CommanderSelectScene } from './scenes/CommanderSelectScene.js';
import { MerchantSelectScene } from './scenes/MerchantSelectScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { HallOfFameScene } from './scenes/HallOfFameScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { RulesScene } from './scenes/RulesScene.js';
import { LayoutEditor } from './systems/LayoutEditor.js';
import { DebugCapture } from './systems/DebugCapture.js';
import { resetCaptureReady } from './systems/CaptureSupport.js';

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
  render: {
    // Custom filter render nodes (WebGL only; silently ignored in Canvas mode).
    renderNodes: { FilterCRT, FilterOutline },
    // Reserve up to 12 simultaneous point lights for BattleScene unit lighting
    maxLights: 12,
  },
  scene: [BootScene, MenuScene, ModeSelectScene, CommanderSelectScene, MerchantSelectScene, ShopScene, BattleScene, GameOverScene, HallOfFameScene, SettingsScene, RulesScene],
};

resetCaptureReady();
const game = new Game(config);
LayoutEditor.init(game);
DebugCapture.init(game);
