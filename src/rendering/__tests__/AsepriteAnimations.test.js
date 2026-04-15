import { describe, expect, it } from 'vitest';
import { getAsepriteTagConfigs } from '../AsepriteAnimations.js';

describe('getAsepriteTagConfigs', () => {
  it('preserves filename-based frames for non-zero tag starts', () => {
    const data = {
      frames: [
        { filename: 'Minion 2 0.aseprite', duration: 75 },
        { filename: 'Minion 2 1.aseprite', duration: 75 },
        { filename: 'Minion 2 2.aseprite', duration: 75 },
        { filename: 'Minion 2 3.aseprite', duration: 75 },
      ],
      meta: {
        frameTags: [
          { name: 'Idle', from: 1, to: 3, direction: 'forward' },
        ],
      },
    };

    expect(getAsepriteTagConfigs('alpha-minion_002', data)).toEqual([
      {
        key: 'Idle',
        frames: [
          { key: 'alpha-minion_002', frame: 'Minion 2 1.aseprite', duration: 75 },
          { key: 'alpha-minion_002', frame: 'Minion 2 2.aseprite', duration: 75 },
          { key: 'alpha-minion_002', frame: 'Minion 2 3.aseprite', duration: 75 },
        ],
        duration: 225,
        yoyo: false,
      },
    ]);
  });

  it('handles shifted idle tags like Robo Dagger without falling back to frame 0', () => {
    const data = {
      frames: [
        { filename: 'Dagger Mushroom 0.aseprite', duration: 100 },
        { filename: 'Dagger Mushroom 1.aseprite', duration: 100 },
        { filename: 'Dagger Mushroom 2.aseprite', duration: 100 },
        { filename: 'Dagger Mushroom 3.aseprite', duration: 100 },
        { filename: 'Dagger Mushroom 4.aseprite', duration: 100 },
        { filename: 'Dagger Mushroom 5.aseprite', duration: 100 },
      ],
      meta: {
        frameTags: [
          { name: 'Idle', from: 1, to: 5, direction: 'forward' },
        ],
      },
    };

    expect(getAsepriteTagConfigs('alpha-dagger_mush', data)[0].frames.map((frame) => frame.frame)).toEqual([
      'Dagger Mushroom 1.aseprite',
      'Dagger Mushroom 2.aseprite',
      'Dagger Mushroom 3.aseprite',
      'Dagger Mushroom 4.aseprite',
      'Dagger Mushroom 5.aseprite',
    ]);
  });
});
