import { test, expect } from 'playwright/test';

test('menu renders within 750ms cold', async ({ page }) => {
  const start = Date.now();
  await page.goto('http://localhost:4173');
  await page.waitForFunction(() => window.__menuReady === true, { timeout: 3000 });
  const elapsed = Date.now() - start;
  console.log(`[perf] Menu ready in ${elapsed}ms`);
  expect(elapsed).toBeLessThan(750);
});
