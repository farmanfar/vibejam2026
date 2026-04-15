import { defineConfig } from 'vite';
import { mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

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

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,
  },
  server: {
    open: true,
  },
  plugins: [playtestLogPlugin()],
});
