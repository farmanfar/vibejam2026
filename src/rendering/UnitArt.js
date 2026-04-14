const loggedFallbacks = new Set();

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
export function getUnitPortraitRef(scene, unit, context = 'unit') {
  const requestedKey = getUnitPortraitTextureKey(unit);

  if (unit?.hasPortrait && scene.textures.exists(requestedKey)) {
    const frame = unit.art?.portraitFrame ?? 0;
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
