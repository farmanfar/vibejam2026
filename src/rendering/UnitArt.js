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
