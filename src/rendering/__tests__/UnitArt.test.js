import { describe, expect, it } from 'vitest';
import {
  resolvePortraitFrameIndex,
  resolvePortraitFrameName,
  resolveTagStartFrame,
} from '../UnitArt.js';

describe('resolvePortraitFrameName', () => {
  it('matches Aseprite frames by numeric suffix instead of array order', () => {
    const texture = {
      getFrameNames: () => ['__BASE', 'Minion 2 0.aseprite', 'Minion 2 1.aseprite', 'Minion 2 2.aseprite'],
    };

    expect(resolvePortraitFrameName(texture, 1)).toBe('Minion 2 1.aseprite');
  });

  it('falls back to the first drawable frame when no exact numeric match exists', () => {
    const texture = {
      getFrameNames: () => ['__BASE', 'idle_a', 'idle_b'],
    };

    expect(resolvePortraitFrameName(texture, 0)).toBe('idle_a');
  });
});

describe('resolveTagStartFrame', () => {
  it('returns the first frame index for the requested Aseprite tag', () => {
    const data = {
      frames: [
        { filename: 'Ghost 0.aseprite' },
        { filename: 'Ghost 1.aseprite' },
        { filename: 'Ghost 2.aseprite' },
      ],
      meta: {
        frameTags: [
          { name: 'Idle', from: 1, to: 2 },
        ],
      },
    };

    expect(resolveTagStartFrame(data, 'Idle')).toBe(1);
  });
});

describe('resolvePortraitFrameIndex', () => {
  it('prefers the default tag frame when portraitFrame is stale zero', () => {
    const asepriteData = {
      frames: [
        { filename: 'Minion 1 0.aseprite' },
        { filename: 'Minion 1 1.aseprite' },
      ],
      meta: {
        frameTags: [
          { name: 'idle', from: 1, to: 1 },
        ],
      },
    };

    expect(resolvePortraitFrameIndex({
      portraitFrame: 0,
      defaultTag: 'idle',
      asepriteData,
    })).toBe(1);
  });

  it('keeps an explicit non-zero portraitFrame override', () => {
    const asepriteData = {
      frames: [
        { filename: 'Unit 0.aseprite' },
        { filename: 'Unit 1.aseprite' },
        { filename: 'Unit 2.aseprite' },
      ],
      meta: {
        frameTags: [
          { name: 'Idle', from: 1, to: 2 },
        ],
      },
    };

    expect(resolvePortraitFrameIndex({
      portraitFrame: 2,
      defaultTag: 'Idle',
      asepriteData,
    })).toBe(2);
  });
});
