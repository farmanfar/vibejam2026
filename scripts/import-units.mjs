import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'public', 'assets', 'warriors', 'source');
const runtimeRoot = path.join(repoRoot, 'public', 'assets', 'warriors', 'runtime');
const sourcesPath = path.join(repoRoot, 'src', 'config', 'unit-sources.json');
const catalogPath = path.join(repoRoot, 'src', 'config', 'unit-catalog.generated.json');
const reportPath = path.join(repoRoot, 'src', 'config', 'unit-import-report.generated.json');

const NAME_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'with', 'without', 'enemy', 'advanced',
  'sprite', 'version', 'series', 'char', 'character', 'pack',
]);

const DEFAULT_CLIP_PRIORITY = ['idle', 'walk', 'run', 'attack', 'hurt', 'death'];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function significantTokens(value) {
  return slugify(value)
    .split('_')
    .filter(Boolean)
    .filter((token) => !NAME_STOP_WORDS.has(token));
}

function normalizePublicPath(filePath) {
  return path.relative(path.join(repoRoot, 'public'), filePath).replace(/\\/g, '/');
}

function resolveAsepriteExe() {
  const envPath = process.env.ASEPRITE_CLI;
  const candidates = [
    envPath,
    'C:/Program Files/Aseprite/Aseprite.exe',
    'C:/Program Files (x86)/Aseprite/Aseprite.exe',
    '/Applications/Aseprite.app/Contents/MacOS/aseprite',
    '/usr/bin/aseprite',
    '/usr/local/bin/aseprite',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const probe = process.platform === 'win32'
    ? spawnSync('where', ['Aseprite'], { encoding: 'utf8' })
    : spawnSync('which', ['aseprite'], { encoding: 'utf8' });

  if (probe.status === 0 && probe.stdout) {
    return probe.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null;
  }

  return null;
}

function listProjects(directory) {
  if (!fs.existsSync(directory)) return [];

  const projects = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(aseprite|ase)$/i.test(entry.name)) {
        projects.push(fullPath);
      }
    }
  }

  walk(directory);
  return projects.sort((a, b) => a.localeCompare(b));
}

function scoreProject(unitName, sourceDir, projectPath) {
  const fileName = path.basename(projectPath, path.extname(projectPath));
  const normalizedName = slugify(unitName);
  const normalizedFile = slugify(fileName);
  const sourceLeaf = slugify(path.basename(sourceDir));
  const nameTokens = significantTokens(unitName);
  const fileTokens = new Set(significantTokens(fileName));

  let score = 0;
  if (normalizedFile === normalizedName) score += 120;
  if (normalizedFile.includes(normalizedName) || normalizedName.includes(normalizedFile)) score += 40;
  if (sourceLeaf && (normalizedFile.includes(sourceLeaf) || sourceLeaf.includes(normalizedFile))) score += 10;

  for (const token of nameTokens) {
    if (fileTokens.has(token)) score += 15;
    if (projectPath.toLowerCase().includes(token)) score += 3;
  }

  return score;
}

function resolveProject(unitEntry, projects) {
  if (projects.length === 0) {
    return { projectPath: null, warning: 'No .aseprite/.ase files found in source directory.' };
  }

  if (projects.length === 1) {
    return { projectPath: projects[0], warning: null };
  }

  const scored = projects
    .map((projectPath) => ({ projectPath, score: scoreProject(unitEntry.name, unitEntry.sourceDir, projectPath) }))
    .sort((a, b) => b.score - a.score || a.projectPath.localeCompare(b.projectPath));

  const top = scored[0];
  const second = scored[1];

  if (top.score <= 0) {
    return {
      projectPath: top.projectPath,
      warning: `Multiple project files found; defaulted to ${path.basename(top.projectPath)} without a strong name match.`,
    };
  }

  if (second && second.score === top.score) {
    return {
      projectPath: top.projectPath,
      warning: `Multiple project files matched ${unitEntry.name}; chose ${path.basename(top.projectPath)}.`,
    };
  }

  return { projectPath: top.projectPath, warning: null };
}

function runAseprite(exePath, args) {
  const result = spawnSync(exePath, args, {
    encoding: 'utf8',
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? '',
  };
}

function chooseDefaultClip(frameTags) {
  if (!frameTags.length) return null;

  const lowered = frameTags.map((tag) => ({ original: tag.name, lower: tag.name.toLowerCase() }));
  for (const preferred of DEFAULT_CLIP_PRIORITY) {
    const match = lowered.find((tag) => tag.lower === preferred || tag.lower.includes(preferred));
    if (match) return match.original;
  }

  return frameTags[0].name;
}

function parseAtlasMeta(metaPath) {
  const raw = loadJson(metaPath);
  const frames = Array.isArray(raw.frames)
    ? raw.frames.map((frame, index) => ({
        name: String(frame.filename ?? index),
        duration: Number(frame.duration ?? 100),
        rect: frame.frame ?? null,
      }))
    : Object.entries(raw.frames ?? {}).map(([frameName, frame]) => ({
        name: frameName,
        duration: Number(frame.duration ?? 100),
        rect: frame.frame ?? null,
      }));

  const tags = (raw.meta?.frameTags ?? []).map((tag) => ({
    name: tag.name,
    from: Number(tag.from ?? 0),
    to: Number(tag.to ?? 0),
    direction: tag.direction ?? 'forward',
    totalDurationMs: frames
      .slice(Number(tag.from ?? 0), Number(tag.to ?? 0) + 1)
      .reduce((sum, frame) => sum + Number(frame.duration ?? 0), 0),
  }));

  const defaultClip = chooseDefaultClip(tags);
  const defaultTag = tags.find((tag) => tag.name === defaultClip);
  const defaultFrameIndex = defaultTag ? defaultTag.from : 0;

  const frameWidth = frames.reduce((max, frame) => Math.max(max, Number(frame.rect?.w ?? 0)), 0);
  const frameHeight = frames.reduce((max, frame) => Math.max(max, Number(frame.rect?.h ?? 0)), 0);

  return {
    frames,
    tags,
    defaultClip,
    defaultFrameIndex,
    frameWidth,
    frameHeight,
    totalFrames: frames.length,
    raw,
  };
}

function emptyArt() {
  return {
    portraitPath: null,
    sheetPath: null,
    metaPath: null,
    defaultClip: null,
    tags: [],
    clips: [],
    frames: [],
    frameWidth: 0,
    frameHeight: 0,
    totalFrames: 0,
  };
}

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function main() {
  ensureDir(runtimeRoot);

  const unitSources = loadJson(sourcesPath);
  const asepriteExe = resolveAsepriteExe();
  const duplicateIds = unitSources
    .map((entry) => entry.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(repoRoot, sourceRoot).replace(/\\/g, '/'),
    runtimeRoot: path.relative(repoRoot, runtimeRoot).replace(/\\/g, '/'),
    asepriteCliPath: asepriteExe,
    totals: {
      totalSources: unitSources.length,
      enabledSources: unitSources.filter((entry) => entry.enabled !== false).length,
      ready: 0,
      skipped: 0,
      missingSourceDirs: 0,
      missingProjectFiles: 0,
      exportErrors: 0,
      zeroTagFiles: 0,
      duplicateIds: duplicateIds.length,
    },
    problems: {
      duplicateIds,
      missingSourceDirs: [],
      missingProjectFiles: [],
      exportErrors: [],
      zeroTagFiles: [],
      warnings: [],
    },
  };

  const entries = unitSources.map((unitSource) => {
    const baseEntry = {
      id: unitSource.id,
      name: unitSource.name,
      category: unitSource.category,
      pack: unitSource.pack,
      sourceDir: unitSource.sourceDir,
      enabled: unitSource.enabled !== false,
      status: 'skipped',
      sourceProjectPath: null,
      warnings: [],
      errors: [],
      art: emptyArt(),
    };

    if (unitSource.enabled === false) {
      report.totals.skipped++;
      return baseEntry;
    }

    const sourceDirAbs = path.join(sourceRoot, unitSource.sourceDir);

    if (!fs.existsSync(sourceDirAbs)) {
      baseEntry.status = 'missing_source_dir';
      baseEntry.errors.push(`Missing source directory: ${path.relative(repoRoot, sourceDirAbs)}`);
      report.totals.missingSourceDirs++;
      report.problems.missingSourceDirs.push({
        id: unitSource.id,
        sourceDir: unitSource.sourceDir,
      });
      return baseEntry;
    }

    const projects = listProjects(sourceDirAbs);
    const resolved = resolveProject(unitSource, projects);

    if (!resolved.projectPath) {
      baseEntry.status = 'missing_project';
      if (resolved.warning) baseEntry.errors.push(resolved.warning);
      report.totals.missingProjectFiles++;
      report.problems.missingProjectFiles.push({
        id: unitSource.id,
        sourceDir: unitSource.sourceDir,
      });
      return baseEntry;
    }

    if (resolved.warning) {
      baseEntry.warnings.push(resolved.warning);
      report.problems.warnings.push({
        id: unitSource.id,
        warning: resolved.warning,
      });
    }

    baseEntry.sourceProjectPath = path.relative(repoRoot, resolved.projectPath).replace(/\\/g, '/');

    if (!asepriteExe) {
      baseEntry.status = 'missing_aseprite_cli';
      baseEntry.errors.push('Aseprite CLI was not found. Set ASEPRITE_CLI or install Aseprite.');
      report.totals.exportErrors++;
      report.problems.exportErrors.push({
        id: unitSource.id,
        error: 'Aseprite CLI was not found.',
      });
      return baseEntry;
    }

    const runtimeDir = path.join(runtimeRoot, unitSource.id);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    ensureDir(runtimeDir);

    const sheetPath = path.join(runtimeDir, 'sheet.png');
    const metaPath = path.join(runtimeDir, 'sheet.json');
    const portraitPath = path.join(runtimeDir, 'portrait.png');

    const atlasExport = runAseprite(asepriteExe, [
      '--batch',
      resolved.projectPath,
      '--sheet',
      sheetPath,
      '--data',
      metaPath,
      '--format',
      'json-array',
      '--list-tags',
      '--sheet-pack',
      '--trim',
      '--filename-format',
      '{frame}',
    ]);

    if (!atlasExport.ok || !fs.existsSync(sheetPath) || !fs.existsSync(metaPath)) {
      baseEntry.status = 'export_error';
      const details = [atlasExport.error, atlasExport.stderr, atlasExport.stdout].filter(Boolean).join(' | ');
      baseEntry.errors.push(`Failed to export atlas${details ? `: ${details}` : '.'}`);
      report.totals.exportErrors++;
      report.problems.exportErrors.push({
        id: unitSource.id,
        error: details || 'Atlas export did not produce output files.',
      });
      return baseEntry;
    }

    const parsed = parseAtlasMeta(metaPath);

    if (parsed.tags.length === 0) {
      report.totals.zeroTagFiles++;
      report.problems.zeroTagFiles.push({
        id: unitSource.id,
        project: baseEntry.sourceProjectPath,
      });
      baseEntry.warnings.push('Aseprite file exported without frame tags.');
    }

    const portraitExport = runAseprite(asepriteExe, [
      '--batch',
      resolved.projectPath,
      '--frame-range',
      `${parsed.defaultFrameIndex},${parsed.defaultFrameIndex}`,
      '--save-as',
      portraitPath,
    ]);

    if (!portraitExport.ok || !fs.existsSync(portraitPath)) {
      baseEntry.warnings.push('Portrait export failed; runtime will fall back to placeholders until portrait export succeeds.');
    }

    baseEntry.status = 'ready';
    baseEntry.art = {
      portraitPath: fs.existsSync(portraitPath) ? normalizePublicPath(portraitPath) : null,
      sheetPath: normalizePublicPath(sheetPath),
      metaPath: normalizePublicPath(metaPath),
      defaultClip: parsed.defaultClip,
      tags: parsed.tags.map((tag) => tag.name),
      clips: parsed.tags,
      frames: parsed.frames.map((frame) => ({
        name: frame.name,
        duration: frame.duration,
      })),
      frameWidth: parsed.frameWidth,
      frameHeight: parsed.frameHeight,
      totalFrames: parsed.totalFrames,
    };

    report.totals.ready++;
    return baseEntry;
  });

  const generatedCatalog = {
    generatedAt: report.generatedAt,
    sourceRoot: report.sourceRoot,
    runtimeRoot: report.runtimeRoot,
    entries,
  };

  fs.writeFileSync(catalogPath, `${JSON.stringify(generatedCatalog, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[units:import] Generated ${entries.length} catalog entries.`);
  console.log(`[units:import] Ready: ${report.totals.ready}`);
  console.log(`[units:import] Missing dirs: ${report.totals.missingSourceDirs}`);
  console.log(`[units:import] Missing projects: ${report.totals.missingProjectFiles}`);
  console.log(`[units:import] Export errors: ${report.totals.exportErrors}`);
  console.log(`[units:import] Zero-tag files: ${report.totals.zeroTagFiles}`);
  console.log(`[units:import] Wrote ${path.relative(repoRoot, catalogPath)}`);
  console.log(`[units:import] Wrote ${path.relative(repoRoot, reportPath)}`);
}

main();
