import { getWarriors } from '../config/warriors.js';
import { getAlphaWarriors } from '../config/alpha-units.js';
import { getAllPreloadEntries as getSynergyIconEntries } from '../config/synergy-icons.js';

const BLANK_CARD_FILES = [
  'blank cards1.png', 'blank cards2.png', 'blank cards3.png',
  'blank cards4.png', 'blank cards5.png', 'blank cards6.png',
  'blank cards7.png', 'blank cards8.png', 'blank cards9.png',
  'blank cards10.png', 'blank cards 11.png',
];

export function loadWarriorTexture(scene, warrior) {
  if (!warrior) return;
  if (!warrior.spriteKey) return;
  if (warrior.art?.pngPath && warrior.art?.dataPath) {
    if (!scene.textures.exists(warrior.spriteKey)) {
      scene.load.aseprite(warrior.spriteKey, warrior.art.pngPath, warrior.art.dataPath);
    }
    return;
  }
  if (warrior.art?.portraitPath && !scene.textures.exists(warrior.spriteKey)) {
    scene.load.image(warrior.spriteKey, warrior.art.portraitPath);
  }
}

export function loadAllWarriorTextures(scene) {
  for (const warrior of getWarriors()) loadWarriorTexture(scene, warrior);
  for (const warrior of getAlphaWarriors()) loadWarriorTexture(scene, warrior);
}

export function loadCardAssets(scene) {
  BLANK_CARD_FILES.forEach((file, i) => {
    const key = `card-blank-${i + 1}`;
    if (!scene.textures.exists(key)) scene.load.image(key, `assets/cards/blanks/${file}`);
  });
  if (!scene.textures.exists('card-icon-hp')) {
    scene.load.image('card-icon-hp', 'assets/cards/icons/Icon5.png');
  }
  if (!scene.textures.exists('card-icon-atk')) {
    scene.load.image('card-icon-atk', 'assets/cards/icons/Icon3.png');
  }
}

export function loadSynergyIcons(scene) {
  for (const { textureKey, file } of getSynergyIconEntries()) {
    if (!scene.textures.exists(textureKey)) {
      scene.load.image(textureKey, `assets/ui/synergies/${file}`);
    }
  }
}
