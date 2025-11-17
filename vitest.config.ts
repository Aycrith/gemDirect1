import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: [],
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    // Exclude Playwright end-to-end specs so Vitest doesn't try to run them.
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
});
