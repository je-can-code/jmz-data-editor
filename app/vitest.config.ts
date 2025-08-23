import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',           // Node env; no jsdom
    globals: true,                 // describe/it/expect globally available
    setupFiles: [ './test/setupTests.ts' ],
    include: [ 'test/**/*.{test,spec}.ts?(x)' ],
    exclude: [ 'node_modules', 'build', 'dist' ],
    coverage: {
      provider: 'v8',
      reportsDirectory: './.coverage',
      reporter: [ 'text', 'html', 'lcov' ],
      include: [ 'src/**/*.{ts,tsx}' ],
      exclude: [
        '**/node_modules/**',
        '**/build/**',
        '**/dist/**',
        '**/.tmp/**',
        '**/*.d.ts',        // exclude type definitions
        'src/types/**',     // exclude your types folder (adjust if different)
        'src/styles/**',
        'test/**',          // exclude tests
        '**/*.{test,spec}.ts?(x)',
        '**/vite.config.*',
        '**/vitest.config.*',
        '**/neutralino.config.*',
        '**/scripts/**',
      ],
    },
  },
});