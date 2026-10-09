import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => {
  const accessTest = Boolean(process.env.TEST_DASHBOARD_ACCESS);
  return {
    base: './',
    publicDir: mode === 'fixtures' && !accessTest ? 'public' : 'public-static',
    define: accessTest ? {
      'import.meta.env.VITE_APPLICATION_MODE': JSON.stringify('repositories'),
      'import.meta.env.VITE_LAUNCH_ENDPOINT': JSON.stringify('https://launcher.example'),
    } : {},
  };
});
