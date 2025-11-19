import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
