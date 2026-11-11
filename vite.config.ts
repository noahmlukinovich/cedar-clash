import { defineConfig } from 'vite';

// Relative base so the build works under a GitHub Pages project path (/cedar-clash/).
// In development, /api is proxied to the game server (npm run dev:server).
export default defineConfig({
  base: './',
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
