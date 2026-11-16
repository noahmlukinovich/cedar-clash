import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __BUILD_TIME__: '1000' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
