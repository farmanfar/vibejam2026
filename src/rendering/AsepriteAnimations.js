function getFrameArray(data) {
  if (Array.isArray(data?.frames)) return data.frames;
  if (data?.frames && typeof data.frames === 'object') {
    return Object.values(data.frames);
  }
  return [];
}

export function getAsepriteTagConfigs(textureKey, data, tags = null) {
  const frameTags = Array.isArray(data?.meta?.frameTags) ? data.meta.frameTags : [];
  const frames = getFrameArray(data);
  const allowedTags = Array.isArray(tags) ? new Set(tags) : null;
  const configs = [];

  for (const tag of frameTags) {
    const name = tag?.name ?? null;
    if (!name) continue;
    if (allowedTags && !allowedTags.has(name)) continue;

    const from = Number.isInteger(tag?.from) ? tag.from : 0;
    const to = Number.isInteger(tag?.to) ? tag.to : from;
    const direction = tag?.direction ?? 'forward';
    const rawFrames = frames.slice(from, to + 1).filter((frame) => typeof frame?.filename === 'string');
    if (!rawFrames.length) continue;

    let animFrames = rawFrames.map((frame) => ({
      key: textureKey,
      frame: frame.filename,
      duration: frame.duration,
    }));

    if (direction === 'reverse') {
      animFrames = animFrames.reverse();
    }

    const duration = rawFrames.reduce((total, frame) => total + (frame.duration ?? 0), 0);

    configs.push({
      key: name,
      frames: animFrames,
      duration,
      yoyo: direction === 'pingpong',
    });
  }

  return configs;
}
