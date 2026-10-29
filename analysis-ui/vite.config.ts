import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => {
  const accessTest = Boolean(process.env.TEST_DASHBOARD_ACCESS);
  return {
    base: './',
    build: { manifest: true },
    publicDir: mode === 'fixtures' && !accessTest ? 'public' : 'public-static',
    define: accessTest ? {
      'import.meta.env.VITE_APPLICATION_MODE': JSON.stringify('repositories'),
      'import.meta.env.VITE_LAUNCH_ENDPOINT': JSON.stringify('https://launcher.example'),
    } : {},
    plugins: accessTest ? [{
      name: 'access-test-csp',
      transformIndexHtml(html: string) {
        return html.replace('https://code-analysis-launcher.icsarthak9.workers.dev', 'https://launcher.example');
      },
    }] : [],
  };
});
