import { defineConfig } from '@playwright/test';
const snapshotPathTemplate=process.platform==='win32'
  ? '{testDir}/{testFilePath}-snapshots/{arg}{ext}'
  : '{testDir}/{testFilePath}-snapshots/linux/{arg}{ext}';
export default defineConfig({ testDir: './tests', workers: 1, snapshotPathTemplate, use: { baseURL: 'http://127.0.0.1:4178', headless: true, channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: { cwd: process.cwd(), command: 'npm run build:fixtures && npx vite preview --host 127.0.0.1 --port 4178', url: 'http://127.0.0.1:4178', reuseExistingServer: false, timeout: 180_000 } });
