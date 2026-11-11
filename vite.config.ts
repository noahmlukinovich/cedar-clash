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

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project path (/cedar-clash/).
  base: './',
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  plugins: [versionFile()],
});
