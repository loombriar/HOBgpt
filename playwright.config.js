const { defineConfig, devices } = require('@playwright/test');

const viewportWidth = process.env.HOB_E2E_VIEWPORT_WIDTH;
const viewportHeight = process.env.HOB_E2E_VIEWPORT_HEIGHT;
let viewport;
if (viewportWidth !== undefined || viewportHeight !== undefined) {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 200 || height < 200) {
    throw new Error('HOB_E2E_VIEWPORT_WIDTH and HOB_E2E_VIEWPORT_HEIGHT must both be integers of at least 200.');
  }
  viewport = { width, height };
}

const chromiumUse = { ...devices['Desktop Chrome'] };
if (viewport) chromiumUse.viewport = viewport;

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // CI installs Chromium; mobile device presets must use that browser too.
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run e2e:serve',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [{ name: viewport ? `chromium-${viewport.width}x${viewport.height}` : 'chromium', use: chromiumUse }],
});
