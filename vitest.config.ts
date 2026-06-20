import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcPath = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': srcPath,
    },
  },
});
