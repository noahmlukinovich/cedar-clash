import { defineConfig, devices } from '@playwright/test';

// Mobile layout checks (npm run test:mobile). The game is landscape-only on
// phones, so every phone project is landscape; one portrait project checks the
// "turn your phone" prompt. All projects use Chromium with each device's size,
// pixel ratio and touch support.
const chromium = { browserName: 'chromium' as const };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5174', trace: 'off', ...chromium },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    stderr: 'ignore', // offline mode probes /api and logs refused connections
  },
  projects: [
    { name: 'iphone-se', testIgnore: /(rotate|input)\.e2e\.ts/, use: { ...devices['iPhone SE landscape'], ...chromium } },
    { name: 'iphone-13', testIgnore: /rotate\.e2e\.ts/, use: { ...devices['iPhone 13 landscape'], ...chromium } },
    { name: 'pixel-7', testIgnore: /(rotate|input)\.e2e\.ts/, use: { ...devices['Pixel 7 landscape'], ...chromium } },
    { name: 'ipad', testIgnore: /(rotate|input)\.e2e\.ts/, use: { ...devices['iPad (gen 7) landscape'], ...chromium } },
    // Desktop with a mouse: only the input tests, to prove mouse controls didn't change.
    { name: 'desktop', testMatch: /input\.e2e\.ts/, use: { viewport: { width: 1280, height: 800 }, ...chromium } },
    { name: 'portrait', use: { ...devices['iPhone 13'], ...chromium }, testMatch: /rotate\.e2e\.ts/ },
  ],
  testMatch: /.*\.e2e\.ts/,
});
