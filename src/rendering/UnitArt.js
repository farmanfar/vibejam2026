const loggedFallbacks = new Set();
const loggedPortraitFrameFixes = new Set();

function parseNumericFrameSuffix(frameName) {
  if (typeof frameName !== 'string') return null;
  const match = frameName.match(/(\d+)(?:\.[^.]+)?$/);
  return match ? Number(match[1]) : null;
}

function getFrameArray(data) {
  if (Array.isArray(data?.frames)) return data.frames;
  if (data?.frames && typeof data.frames === 'object') {
    return Object.values(data.frames);
  }
  return [];
}

export function resolvePortraitFrameName(texture, portraitFrame = 0) {
  const frameNames = texture?.getFrameNames?.() ?? [];
  if (!frameNames.length) return undefined;

  // Phaser's Aseprite loader keeps the source filenames as frame ids
  // ("Minion 2 1.aseprite"), and may also prepend "__BASE". Matching the
  // requested portrait frame by numeric suffix is stable across that ordering.
  const exactMatch = frameNames.find((frameName) => parseNumericFrameSuffix(frameName) === portraitFrame);
  if (exactMatch) return exactMatch;

  if (frameNames.includes(String(portraitFrame))) {
    return String(portraitFrame);
  }

  const drawableFrames = frameNames.filter((frameName) => frameName !== '__BASE');
  return drawableFrames[portraitFrame] ?? drawableFrames[0] ?? frameNames[0];
}

export function resolveTagStartFrame(data, tagName) {
  if (!tagName) return null;

  const frameTags = Array.isArray(data?.meta?.frameTags) ? data.meta.frameTags : [];
  const match = frameTags.find((tag) => tag?.name === tagName);
  if (!match || !Number.isInteger(match.from)) return null;

  const frames = getFrameArray(data);
  if (!frames[match.from]?.filename) return null;
  return match.from;
}

export function resolvePortraitFrameIndex({ portraitFrame = null, defaultTag = null, asepriteData = null }) {
  const defaultTagFrame = resolveTagStartFrame(asepriteData, defaultTag);

  if (Number.isInteger(portraitFrame) && portraitFrame > 0) {
    return portraitFrame;
  }

  if (Number.isInteger(defaultTagFrame)) {
    return defaultTagFrame;
  }

  if (Number.isInteger(portraitFrame)) {
    return portraitFrame;
  }

  return 0;
}

export function getUnitPortraitTextureKey(unit) {
  return unit?.spriteKey ?? `unit-portrait-${unit?.id ?? 'missing'}`;
}

export function getUnitAtlasKey(unitId) {
  return `unit-atlas-${unitId}`;
}

export function getUnitTextureKey(scene, unit, context = 'unit') {
  const requestedKey = getUnitPortraitTextureKey(unit);

  if (unit?.hasPortrait && scene.textures.exists(requestedKey)) {
    return requestedKey;
  }

  const fallbackKey = `warrior_placeholder_${unit?.tier ?? 0}`;
  const warnKey = `${context}:${unit?.id ?? 'missing'}`;

  if (!loggedFallbacks.has(warnKey)) {
    loggedFallbacks.add(warnKey);
    console.warn(`[UnitArt] ${context} fallback for ${unit?.id ?? 'unknown'} — portrait missing or not loaded`);
  }

  return scene.textures.exists(fallbackKey) ? fallbackKey : 'warrior_placeholder_0';
}

// Returns { key, frame } — frame is only meaningful for multi-frame atlases
// (alpha aseprite-baked textures). Placeholder textures get `frame: undefined`,
// which is legal for Phaser's add.image / add.sprite calls (uses default frame).
//
// Phaser's aseprite loader registers frames by their filename string
// (e.g. "Minion 1 0.aseprite"), not by numeric index. Passing the integer
// `portraitFrame` directly would silently miss on atlases whose filenames
// don't happen to coincide with stringified indices, causing Phaser to fall
// back to the __BASE frame — which is the ENTIRE source PNG. At card scale
// that produces a screen-covering overlay (see electrocutioner/glitch_samurai).
// Resolving the integer index against the texture's actual frame name list
// makes the lookup robust regardless of how the atlas was baked.
export function getUnitPortraitRef(scene, unit, context = 'unit') {
  const requestedKey = getUnitPortraitTextureKey(unit);

  if (unit?.hasPortrait && scene.textures.exists(requestedKey)) {
    const asepriteData = scene.cache?.json?.get?.(requestedKey) ?? null;
    const texture = scene.textures.get(requestedKey);
    let idx = resolvePortraitFrameIndex({
      portraitFrame: unit.art?.portraitFrame,
      defaultTag: unit.art?.defaultTag,
      asepriteData,
    });

    // Heuristic fallback: if asepriteData was not in cache (cache miss) and
    // the portrait resolved to 0 while a defaultTag is declared, frame 0 is
    // almost certainly a junk/silhouette reference frame in the PENUSBMIC atlas.
    // Frame 1 is where the first named animation tag starts for these atlases.
    if (!asepriteData && idx === 0 && unit.art?.defaultTag) {
      const frameNames = texture?.getFrameNames?.() ?? [];
      if (frameNames.some((n) => parseNumericFrameSuffix(n) === 1)) {
        const heuristicKey = `heuristic:${requestedKey}:${unit?.id ?? 'missing'}`;
        if (!loggedPortraitFrameFixes.has(heuristicKey)) {
          loggedPortraitFrameFixes.add(heuristicKey);
          console.warn(
            `[UnitArt] ${context} asepriteData cache miss for '${unit?.id ?? 'unknown'}' `
            + `(defaultTag='${unit.art.defaultTag}') — heuristic frame 1 fallback instead of stale frame 0`,
          );
        }
        idx = 1;
      }
    }

    const frame = resolvePortraitFrameName(texture, idx);
    const logKey = `${requestedKey}:${unit?.id ?? 'missing'}`;

    if (
      !loggedPortraitFrameFixes.has(logKey)
      && Number.isInteger(unit.art?.portraitFrame)
      && unit.art.portraitFrame === 0
      && idx > 0
    ) {
      loggedPortraitFrameFixes.add(logKey);
      console.warn(
        `[UnitArt] ${context} portraitFrame fix for ${unit?.id ?? 'unknown'} `
        + `- using defaultTag '${unit.art?.defaultTag ?? 'unknown'}' frame ${idx} instead of stale frame 0`,
      );
    }

    return { key: requestedKey, frame };
  }

  const fallbackKey = `warrior_placeholder_${unit?.tier ?? 0}`;
  const warnKey = `${context}:${unit?.id ?? 'missing'}`;

  if (!loggedFallbacks.has(warnKey)) {
    loggedFallbacks.add(warnKey);
    console.warn(`[UnitArt] ${context} fallback for ${unit?.id ?? 'unknown'} — portrait missing or not loaded`);
  }

  const safeKey = scene.textures.exists(fallbackKey) ? fallbackKey : 'warrior_placeholder_0';
  return { key: safeKey, frame: undefined };
}
