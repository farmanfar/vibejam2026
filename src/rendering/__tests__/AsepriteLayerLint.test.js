import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dir, '..', '..', '..');
const LINTER = resolve(REPO_ROOT, 'scripts', 'lint-aseprite-layers.mjs');

const ASEPRITE_CLI = process.env.ASEPRITE_CLI || 'C:/Program Files/Aseprite/aseprite.exe';
const asepriteAvailable = existsSync(ASEPRITE_CLI);

// CI sets ASEPRITE_REQUIRED=1. A missing CLI must fail, not silently skip.
describe('Aseprite CLI availability', () => {
  it('is present or ASEPRITE_REQUIRED is not set', () => {
    if (!asepriteAvailable && process.env.ASEPRITE_REQUIRED === '1') {
      throw new Error(
        `[LINT] ASEPRITE_REQUIRED=1 but Aseprite CLI not found at: ${ASEPRITE_CLI}\n` +
          'Install Aseprite or configure the CI image with the binary.',
      );
    }
    if (!asepriteAvailable) {
      process.stderr.write(
        '[LINT] Aseprite CLI not found — skipping layer lint. ' +
          'Install Aseprite or run via the CI image.\n',
      );
    }
  });
});

describe.skipIf(!asepriteAvailable)('Aseprite layer lint', () => {
  // Pixel-sampling is slow: one Aseprite CLI invocation per layer.
  // 300_000 ms = 5 minutes; passed as vitest's per-test timeout.
  it(
    'has zero unsuppressed suspicious layers across all units',
    () => {
      const result = spawnSync('node', [LINTER], {
        encoding: 'utf8',
        cwd: REPO_ROOT,
        timeout: 300_000,
      });

      if (result.error) throw result.error;

      if (result.status !== 0 && !result.stdout) {
        throw new Error(
          `Linter exited with code ${result.status} and produced no JSON output.\n` +
            `stderr:\n${result.stderr}`,
        );
      }

      let report;
      try {
        report = JSON.parse(result.stdout);
      } catch {
        throw new Error(
          `Linter stdout is not valid JSON (exit ${result.status}).\n` +
            `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }

      const unsuppressed = (report.findings ?? []).filter((f) => !f.suppressed);

      if (unsuppressed.length > 0) {
        const lines = unsuppressed.map((f) => {
          if (f.reason === 'pixel-probe-error') {
            return `  [TOOLING] ${f.unitId.padEnd(26)} layer: "${f.layer}"  error: ${f.error}`;
          }
          let line = `  ${f.kind.padEnd(10)} ${f.unitId.padEnd(26)} layer: "${f.layer}"  reason: ${f.reason}`;
          if (f.metrics) {
            const m = f.metrics;
            line += `\n               density=${m.density} bboxCoverage=${m.bboxCoverage} rect=${m.rectangularity} colors=${m.distinctColors}`;
          }
          return line;
        });

        const hasProbeErrors = unsuppressed.some((f) => f.reason === 'pixel-probe-error');
        const hasArtFindings = unsuppressed.some((f) => f.reason !== 'pixel-probe-error');
        const guidance = [
          hasArtFindings
            ? 'Art findings: add the layer name to ignoreLayers in alpha-sprite-mapping.json, then re-bake.'
            : null,
          hasProbeErrors
            ? 'Pixel-probe errors: tooling failure (Aseprite CLI / pngjs). Investigate — do NOT add to ignoreLayers.'
            : null,
        ].filter(Boolean).join('\n');

        throw new Error(
          `${unsuppressed.length} unsuppressed finding(s).\n${guidance}\n\n${lines.join('\n')}`,
        );
      }

      expect(unsuppressed).toHaveLength(0);
    },
    300_000,
  );
});
