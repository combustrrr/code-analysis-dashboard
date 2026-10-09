import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', workers: 1, use: { baseURL: 'http://127.0.0.1:4178', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: { cwd: process.cwd(), command: 'npm run build:fixtures && python -m http.server 4178 --bind 127.0.0.1 --directory dist', url: 'http://127.0.0.1:4178', reuseExistingServer: false } });
