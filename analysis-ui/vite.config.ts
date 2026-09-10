import { defineConfig } from 'vite';
export default defineConfig({ base: './', publicDir: process.env.VITE_APPLICATION_MODE==='repositories'?false:'public' });
