import { defineConfig, loadEnv } from 'vite';
import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

// Production builds inline VITE_* env vars at compile time. If they are missing
// or still placeholder values, Supabase will silently fail at runtime and the
// deployed site will run offline-only. Fail the build loudly instead.
function assertSupabaseEnv(mode) {
  const env = loadEnv(mode, process.cwd(), '');
  const url = env.VITE_SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_ANON_KEY || '';
  const errors = [];
  if (!url || url.includes('your-project-ref')) {
    errors.push('VITE_SUPABASE_URL is missing or still set to placeholder');
  }
  if (!key || key.includes('your-publishable')) {
    errors.push('VITE_SUPABASE_ANON_KEY is missing or still set to placeholder');
  }
  if (errors.length > 0) {
    console.error('\n[build] ✗ Cannot build for production — env vars missing:');
    for (const e of errors) console.error('  • ' + e);
    console.error('\nFix: copy .env.example to .env and fill in real Supabase values from');
    console.error('  https://supabase.com/dashboard/project/<your-ref>/settings/api');
    console.error('Or set ALLOW_OFFLINE_BUILD=1 to build an offline-only bundle.\n');
    process.exit(1);
  }
  console.log(`[build] ✓ Supabase env vars present (${url})`);
}

// Dev-only middleware: receives POSTs from PlaytestLogger and appends
// to reports/playtest/<session>.jsonl. One line per event (battle, shop_buy,
// shop_sell, shop_reroll, shop_round, etc.). Disabled in production builds.
function playtestLogPlugin() {
  return {
    name: 'playtest-log-writer',
    configureServer(server) {
      server.middlewares.use('/__playtest-log', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const entry = JSON.parse(body);
            if (!entry.session) throw new Error('missing session field');
            // Guard against path traversal — session ID is generated from an
            // ISO timestamp so it should only contain [A-Za-z0-9-]. Reject
            // anything else rather than sanitizing silently.
            if (!/^[A-Za-z0-9_-]+$/.test(entry.session)) {
              throw new Error(`invalid session id: ${entry.session}`);
            }
            const dir = join(process.cwd(), 'reports', 'playtest');
            mkdirSync(dir, { recursive: true });
            const file = join(dir, `${entry.session}.jsonl`);
            appendFileSync(file, JSON.stringify(entry) + '\n');
            res.statusCode = 204;
            res.end();
          } catch (e) {
            console.error('[playtest-log-writer] failed:', e);
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && !process.env.ALLOW_OFFLINE_BUILD) {
    assertSupabaseEnv(mode);
  }
  return {
    base: './',
    build: {
      target: 'esnext',
      assetsInlineLimit: 0,
    },
    server: {
      open: true,
    },
    plugins: [playtestLogPlugin()],
  };
});
