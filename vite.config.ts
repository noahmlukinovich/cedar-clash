import { defineConfig, type Plugin } from 'vite';
import { appIconFiles } from './scripts/appIcon';

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

// Home-screen icons and the web app manifest, drawn in code (scripts/appIcon.ts).
// Emitted into the build, and served by the dev server.
function appIcons(): Plugin {
  let files: Record<string, Buffer | string> | null = null;
  const get = (): Record<string, Buffer | string> => (files ??= appIconFiles());
  return {
    name: 'app-icons',
    generateBundle() {
      for (const [fileName, source] of Object.entries(get())) this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const f = get()[name];
        if (f === undefined) return next();
        res.setHeader('Content-Type', name.endsWith('.json') ? 'application/manifest+json' : 'image/png');
        res.end(f);
      });
    },
  };
}

// Relative base so the build works under a GitHub Pages project path (/cedar-clash/).
// In development, /api is proxied to the game server (npm run dev:server).
export default defineConfig({
  base: './',
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [versionFile(), appIcons()],
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
