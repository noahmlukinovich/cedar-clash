import { defineConfig, type Plugin } from 'vite';

// One id per build. Baked into the bundle and published as version.json so open
// tabs can notice a new deploy, and so an old tab never overwrites a newer save.
const BUILD_TIME = Date.now();

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_TIME }) });
    },
  };
}

// Relative base so the build works under a GitHub Pages project path (/cedar-clash/).
// In development, /api is proxied to the game server (npm run dev:server).
export default defineConfig({
  base: './',
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [versionFile()],
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
