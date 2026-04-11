import { Scene } from 'phaser';
import {
  Theme, FONT_KEY, PixelLabel, PixelHealthBar, FloatingBanner, PixelPanel,
} from '../ui/index.js';
import { BattleEngine } from '../systems/BattleEngine.js';

export class BattleScene extends Scene {
  constructor() {
    super('Battle');
  }

  init(data) {
    this.round = data.round || 1;
    this.gold = data.gold || 10;
    this.lives = data.lives || 3;
    this.team = data.team || [];
  }

  create() {
    const { width, height } = this.cameras.main;

    // Arena background (grid floor)
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(Theme.screenBg, 1);
    bgGfx.fillRect(0, 0, width, height);
    bgGfx.fillStyle(Theme.panelBg, 1);
    bgGfx.fillRect(0, 360, width, 180);
    bgGfx.lineStyle(1, Theme.panelBorder, 0.3);
    for (let x = 0; x < width; x += 32) bgGfx.lineBetween(x, 360, x, 540);
    for (let y = 360; y < 540; y += 32) bgGfx.lineBetween(0, y, width, y);

    // Generate enemy team
    const engine = new BattleEngine();
    this.enemyTeam = engine.generateEnemyTeam(this.round);

    // Position player warriors (left side)
    this.playerSprites = this.team.map((w, i) => {
      const x = 100 + i * 80;
      const y = 320;
      const sprite = this.add.image(x, y, `warrior_placeholder_${w.tier ?? 0}`).setScale(2.5);
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, { width: 50, height: 5 });
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7 * 1)
        .setOrigin(0.5).setTint(Theme.accent);
      return { sprite, hpBar, name, warrior: { ...w, currentHp: w.hp } };
    });

    // Position enemy warriors (right side)
    this.enemySprites = this.enemyTeam.map((w, i) => {
      const x = width - 100 - i * 80;
      const y = 320;
      const sprite = this.add.image(x, y, `warrior_placeholder_${w.tier ?? 0}`)
        .setScale(2.5).setFlipX(true);
      const hpBar = new PixelHealthBar(this, x, y - 50, w.hp, {
        width: 50, height: 5, isEnemy: true,
      });
      const name = this.add.bitmapText(x, y + 48, FONT_KEY, w.name, 7 * 1)
        .setOrigin(0.5).setTint(Theme.error);
      return { sprite, hpBar, name, warrior: { ...w, currentHp: w.hp } };
    });

    // Team labels
    new PixelLabel(this, 100, 240, 'YOUR TEAM', { scale: 2, color: 'accent', align: 'center' });
    new PixelLabel(this, width - 100, 240, 'ENEMY', { scale: 2, color: 'error', align: 'center' });

    // VS
    this.add.bitmapText(width / 2, 300, FONT_KEY, 'VS', 7 * 5)
      .setOrigin(0.5).setTint(Theme.criticalText);

    // Battle log
    this.logText = this.add.bitmapText(width / 2, 500, FONT_KEY, '', 7 * 2)
      .setOrigin(0.5).setTint(Theme.mutedText);

    // Round banner then auto-battle
    FloatingBanner.show(this, `ROUND ${this.round}`, {
      color: Theme.accent, hold: 600, scale: 6,
    }).then(() => this._runBattle());
  }

  _runBattle() {
    const engine = new BattleEngine();
    const result = engine.resolve(
      this.playerSprites.map(s => s.warrior),
      this.enemySprites.map(s => s.warrior),
    );

    let stepIndex = 0;
    const stepTimer = this.time.addEvent({
      delay: 500,
      callback: () => {
        if (stepIndex >= result.log.length) {
          stepTimer.remove();
          this.time.delayedCall(800, () => this._endBattle(result.won));
          return;
        }

        const step = result.log[stepIndex];
        this.logText.setText(step.message);

        // Update player HP bars
        if (step.playerHp) {
          this.playerSprites.forEach((s, i) => {
            if (step.playerHp[i] !== undefined) {
              s.warrior.currentHp = step.playerHp[i];
              s.hpBar.setHp(s.warrior.currentHp);
              if (s.warrior.currentHp <= 0) {
                s.sprite.setAlpha(0.2);
                s.name.setAlpha(0.3);
              }
            }
          });
        }

        // Update enemy HP bars
        if (step.enemyHp) {
          this.enemySprites.forEach((s, i) => {
            if (step.enemyHp[i] !== undefined) {
              s.warrior.currentHp = step.enemyHp[i];
              s.hpBar.setHp(s.warrior.currentHp);
              if (s.warrior.currentHp <= 0) {
                s.sprite.setAlpha(0.2);
                s.name.setAlpha(0.3);
              }
            }
          });
        }

        // Screen shake
        this.cameras.main.shake(80, 0.004);
        stepIndex++;
      },
      loop: true,
    });
  }

  _endBattle(won) {
    const newLives = won ? this.lives : this.lives - 1;
    const goldEarned = won ? 3 + this.round : 2;

    const bannerText = won ? 'VICTORY!' : 'DEFEAT';
    const bannerColor = won ? Theme.success : Theme.error;
    const subtitle = `+${goldEarned} gold`;

    FloatingBanner.show(this, bannerText, {
      color: bannerColor, subtitle, hold: 1500,
    }).then(() => {
      if (newLives <= 0) {
        this.scene.start('GameOver', { round: this.round });
      } else {
        // Heal surviving warriors
        const survivors = this.team.filter((_, i) =>
          this.playerSprites[i].warrior.currentHp > 0
        );
        this.scene.start('Shop', {
          round: this.round + 1,
          gold: this.gold + goldEarned,
          lives: newLives,
          team: survivors,
        });
      }
    });
  }
}
