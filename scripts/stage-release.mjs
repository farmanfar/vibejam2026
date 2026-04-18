import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = join(root, 'dist');
const releaseRoot = join(root, 'artifacts', 'release');

if (!existsSync(distDir)) {
  console.error('dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(releaseRoot, stamp);
const siteDir = join(outDir, 'site');
const serverDir = join(outDir, 'server');

mkdirSync(outDir, { recursive: true });
mkdirSync(serverDir, { recursive: true });

cpSync(distDir, siteDir, { recursive: true });
cpSync(join(root, 'deploy', 'Caddyfile.example'), join(serverDir, 'Caddyfile'), { recursive: false });

const notes = [
  'The Hired Swords release bundle',
  '',
  'Contents:',
  '- site/: upload these files to your static host',
  '- server/Caddyfile: sample config if you use Caddy on your own server',
  '',
  'Built at:',
  new Date().toISOString(),
  '',
  'Supabase requirements:',
  '- VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must have been present when the build was created',
  '- Supabase anonymous auth must be enabled',
  '- Tables/policies from supabase-setup.sql must exist',
  '',
  'Smoke test:',
  '- Open the deployed URL',
  '- Start a run',
  '- Confirm battle loads and hall of fame opens',
].join('\n');

writeFileSync(join(outDir, 'README.txt'), notes);

console.log(`Release staged at ${outDir}`);
