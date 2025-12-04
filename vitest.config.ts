import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    // Exclude Playwright end-to-end specs so Vitest doesn't try to run them.
    // Run E2E tests separately with: npx playwright test
    exclude: ['node_modules', 'dist', 'tests/e2e/**', 'tests/manual/**', '**/*.integration.test.ts'],
    // Use vmThreads for proper test isolation (prevents global.fetch pollution)
    pool: 'vmThreads',
  },
});
