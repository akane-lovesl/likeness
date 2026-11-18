/**
 * The app's flows in Chrome at a 9:16 phone viewport, against two freshly started servers:
 *   showcase   the static edition (node tools/serve.mjs): pictures are sketched on the device
 *   live       the real studio on the simulator engine (uv run likeness serve --engine simulator); skipped where uv is absent
 *
 * LIKENESS_BROWSER_CHANNEL chooses the browser: "chrome" by default (the installed Google Chrome);
 * set it to "chromium" after  npx playwright install chromium  to use Playwright's own build.
 */
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { defineConfig } from '@playwright/test';

const SHOWCASE = 'http://127.0.0.1:4183', LIVE = 'http://127.0.0.1:8797';
const env = { ...process.env, PATH: [join(homedir(), '.local', 'bin'), process.env.PATH].join(delimiter) };   // where uv installs itself
const hasUv = spawnSync('uv', ['--version'], { env }).status === 0;

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [['list']],
  use: {
    channel: process.env.LIKENESS_BROWSER_CHANNEL || 'chrome',
    viewport: { width: 360, height: 640 },   // exactly 9:16
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'showcase', testMatch: /showcase[\\/].*\.spec\.mjs$/, use: { baseURL: SHOWCASE } },
    ...(hasUv ? [{ name: 'live', testMatch: /live[\\/].*\.spec\.mjs$/, use: { baseURL: LIVE } }] : []),
  ],
  webServer: [
    { command: 'node tools/serve.mjs 4183', url: SHOWCASE + '/index.html', reuseExistingServer: false, timeout: 30_000 },
    ...(hasUv ? [{
      command: 'uv run likeness serve --engine simulator --host 127.0.0.1 --port 8797', url: LIVE + '/api/health', reuseExistingServer: false, timeout: 120_000,
      env: { ...env, LIKENESS_HOME: join(tmpdir(), 'likeness-test-studio'), LIKENESS_SIM_SPEED: '0.6' },   // the suite never touches private/
    }] : []),
  ],
});
