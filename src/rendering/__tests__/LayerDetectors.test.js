import { describe, it, expect } from 'vitest';
import { detectBackgroundByName, BACKGROUND_NAME_RE } from '../../../scripts/lib/layer-detectors.mjs';

describe('detectBackgroundByName', () => {
  it('matches semantically unambiguous background names', () => {
    expect(detectBackgroundByName('bg')).toBe(true);
    expect(detectBackgroundByName('BG')).toBe(true);
    expect(detectBackgroundByName('background')).toBe(true);
    expect(detectBackgroundByName('Background')).toBe(true);
    expect(detectBackgroundByName('backdrop')).toBe(true);
    expect(detectBackgroundByName('sky')).toBe(true);
    expect(detectBackgroundByName('ground')).toBe(true);
    expect(detectBackgroundByName('floor')).toBe(true);
    expect(detectBackgroundByName('flattened')).toBe(true);
  });

  it('matches shadow (separate pattern)', () => {
    expect(detectBackgroundByName('shadow')).toBe(true);
    expect(detectBackgroundByName('Shadow')).toBe(true);
    expect(detectBackgroundByName('Glitch Shadow')).toBe(true);
  });

  it('does NOT match default Aseprite layer names (assassin regression guard)', () => {
    // assassin.aseprite ships with Layer 1..Layer 6 as character art.
    // If the regex ever matches these again, the baker will gut the atlas.
    expect(detectBackgroundByName('Layer 1')).toBe(false);
    expect(detectBackgroundByName('Layer 6')).toBe(false);
    expect(detectBackgroundByName('layer 1')).toBe(false);
    expect(detectBackgroundByName('Layer1')).toBe(false);
  });

  it('does NOT match ambiguous card/UI terms', () => {
    expect(detectBackgroundByName('frame')).toBe(false);
    expect(detectBackgroundByName('border')).toBe(false);
    expect(detectBackgroundByName('Card')).toBe(false);
  });

  it('does NOT match character-sounding names', () => {
    expect(detectBackgroundByName('Character')).toBe(false);
    expect(detectBackgroundByName('body')).toBe(false);
    expect(detectBackgroundByName('weapon')).toBe(false);
  });
});

describe('BACKGROUND_NAME_RE export', () => {
  it('is a RegExp with the narrowed pattern', () => {
    expect(BACKGROUND_NAME_RE).toBeInstanceOf(RegExp);
    // Regression guard: explicitly assert the narrowed pattern does NOT contain
    // layer|frame|border — these were removed after the assassin regression.
    const src = BACKGROUND_NAME_RE.source;
    expect(src).not.toMatch(/layer/i);
    expect(src).not.toMatch(/frame/i);
    expect(src).not.toMatch(/border/i);
  });
});
