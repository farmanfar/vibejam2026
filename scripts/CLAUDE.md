# CLAUDE.md — scripts/

One-page reference for every sprite-related build script. All scripts are plain Node ESM — no bundler step.

## Prerequisites

- **Aseprite** (desktop app, version 1.3+) must be installed.
  - Default path: `C:/Program Files/Aseprite/aseprite.exe`
  - Override: `ASEPRITE_REQUIRED=1 ASEPRITE_CLI=/path/to/aseprite npm test`
- **pngjs** (devDependency): required by the pixel-sampler in the linter. Install via `npm install`.
- Scripts that shell out to Aseprite will fail gracefully if the binary is missing and log a clear error.

## Scripts

### `npm run alpha:sprites` → `scripts/import-alpha-sprites.mjs`

Bakes alpha unit atlases.

| | |
|---|---|
| **Input** | `src/config/alpha-sprite-mapping.json` |
| **Output** | `public/assets/warriors/alpha/{unitId}.{png,json}`, `src/config/alpha-art.generated.json` |
| **Report** | `reports/alpha-sprites-{timestamp}.json` |

Each unit entry specifies `source` (path relative to `hammertimeArtRoot`), optional `ignoreLayers`, `displayScale`, `defaultTag`, `portraitFrame`, and `animTagOverrides`.

The baker runs **warn-only**: if a suspicious layer is auto-detected by the name heuristic but is not in `ignoreLayers`, it prints a `[AlphaSprites] WARN` line but still bakes. Run the linter for strict enforcement.

**Common failures:**
- `source file does not exist` — the `.aseprite` path in the mapping is wrong or the HammerTime art root is misconfigured.
- `no frame tags` — the source `.aseprite` has no Aseprite timeline tags; add at least one tag (e.g. `idle`) in Aseprite before baking.
- Gray blocks in-game — a background layer leaked into the atlas. Run `npm run alpha:lint-sprites` to identify it, then add it to `ignoreLayers`.

### `npm run alpha:lint-sprites` → `scripts/lint-aseprite-layers.mjs`

Scans all unit and commander source files for suspicious background layers.

| | |
|---|---|
| **Input** | `src/config/alpha-sprite-mapping.json` |
| **Output (stdout)** | One JSON document (machine-readable report) |
| **Output (stderr)** | Progress lines prefixed `[LINT]` |

Two detection passes per layer:
- **Check A — name heuristic**: matches `/^(bg|background|backdrop|sky|ground|floor|flattened)$/i` or `/shadow/i`. Intentionally narrow — `Layer N`, `frame`, `border` are NOT auto-detected because they're Aseprite's default layer names and may be character art (see `assassin.aseprite`, where `Layer 1`..`Layer 6` ARE the character).
- **Check B — pixel sampling**: exports a single-frame probe PNG via Aseprite CLI and measures opacity density, bounding-box coverage, rectangularity, and color count. Slow but authoritative.

Flags a layer as suspicious if either check fires.

**Suppression rule (strict):** a finding is only "suppressed" when the layer is listed in `ignoreLayers` in `alpha-sprite-mapping.json` (`suppressionSource: "mapping"`). Name-heuristic hits are REPORT-ONLY — they do not auto-pass lint, even though the baker still auto-ignores them for convenience. This ensures a bad regex change cannot silently rewrite art.

**Pixel-probe errors** (`reason: "pixel-probe-error"`) are tooling failures (Aseprite CLI crash, missing pngjs, decode error). They cannot be suppressed and always fail lint — fix the tool, don't edit the mapping.

Only unsuppressed findings cause CI to fail.

**Useful flags:**
- `--pretty` — prints a formatted human-readable summary to stderr (JSON still goes to stdout)

**Common failures:**
- `pngjs not installed` — run `npm install`
- Aseprite CLI not found — set `ASEPRITE_CLI` env var
- False positive on a character layer — add it to `ignoreLayers` in the mapping; do not change the thresholds

## Shared libraries (`scripts/lib/`)

### `scripts/lib/aseprite-cli.mjs`

Low-level Aseprite CLI wrappers. Importing this file has no side effects.

- `resolveAseprite()` — returns path to aseprite binary or `null`
- `listLayerHierarchy(cli, absSource)` — returns `[{ name, fullPath, isGroup, indent }]`
- `runAseprite(cli, absSource, pngOut, jsonOut, opts)` — bakes a sprite sheet
- `exportLayerProbe(cli, absSource, layerName, outPng)` — exports one layer at frame 0 for pixel sampling

### `scripts/lib/layer-detectors.mjs`

Layer detection logic. Importing this file has no side effects; pngjs is loaded lazily only when `detectBackgroundByPixels` is called.

- `BACKGROUND_NAME_RE` — the expanded background-name regex
- `detectBackgroundByName(layerName)` — pure name check, returns boolean
- `listAutoIgnoreLayers(cli, absSource)` — name-based scan, returns layer paths to auto-ignore
- `detectBackgroundByPixels(cli, absSource, layerName)` — async pixel probe; returns `{ suspicious, metrics }`. Results memoised per process.
