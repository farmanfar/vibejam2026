// Computes the tight non-transparent bounding box for a texture frame.
// PENUSBMIC aseprite atlases are padded — the character occupies only a small
// portion of each frame's canvas, so naive frame-size fits produce tiny
// sprites inside large empty bounding boxes. This helper scans the frame's
// pixel data once and caches the result so WarriorCard (and anyone else)
// can align to the character's real pixels, not the frame's canvas.
//
// Result: { x, y, w, h } in frame-local coordinates, or null if the scan
// failed (texture missing, CORS, etc).

const cache = new Map();

const ALPHA_THRESHOLD = 4; // pixels with alpha ≤ 4 count as transparent

function _cacheKey(textureKey, frameName) {
  return `${textureKey}::${frameName ?? '__default'}`;
}

export function getTightFrameBounds(scene, textureKey, frameName) {
  const key = _cacheKey(textureKey, frameName);
  if (cache.has(key)) return cache.get(key);

  const texture = scene.textures.get(textureKey);
  if (!texture || texture.key === '__MISSING') {
    console.warn(`[spriteBounds] texture missing: ${textureKey}`);
    cache.set(key, null);
    return null;
  }

  const frame = frameName != null ? texture.get(frameName) : texture.get();
  if (!frame) {
    console.warn(`[spriteBounds] frame missing: ${textureKey}/${frameName}`);
    cache.set(key, null);
    return null;
  }

  const { cutX, cutY, cutWidth, cutHeight } = frame;
  const source = frame.source?.image;
  if (!source || !cutWidth || !cutHeight) {
    console.warn(
      `[spriteBounds] invalid source for ${key} `
      + `(src=${!!source} ${cutWidth}x${cutHeight})`,
    );
    cache.set(key, null);
    return null;
  }

  let data;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = cutWidth;
    canvas.height = cutHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, cutWidth, cutHeight);
    ctx.drawImage(
      source,
      cutX, cutY, cutWidth, cutHeight,
      0, 0, cutWidth, cutHeight,
    );
    data = ctx.getImageData(0, 0, cutWidth, cutHeight).data;
  } catch (e) {
    console.error(`[spriteBounds] pixel read failed for ${key}:`, e);
    cache.set(key, null);
    return null;
  }

  let minX = cutWidth;
  let minY = cutHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < cutHeight; y++) {
    const row = y * cutWidth * 4;
    for (let x = 0; x < cutWidth; x++) {
      if (data[row + x * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    const full = { x: 0, y: 0, w: cutWidth, h: cutHeight, fullyTransparent: true };
    console.warn(`[spriteBounds] ${key} is fully transparent — using full frame`);
    cache.set(key, full);
    return full;
  }

  const result = {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
  console.log(
    `[spriteBounds] ${key}: frame ${cutWidth}x${cutHeight} `
    + `→ tight ${result.w}x${result.h} @ (${result.x},${result.y})`,
  );
  cache.set(key, result);
  return result;
}

export function clearSpriteBoundsCache() {
  cache.clear();
}
