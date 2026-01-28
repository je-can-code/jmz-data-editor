import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      globals: true,
      setupFiles: [ './test/setupTests.ts' ],
      include: [ 'test/**/*.{test,spec}.ts?(x)' ],
      exclude: [ 'node_modules', 'build', 'dist' ],
      coverage: {
        enabled: true,
        provider: 'v8',
        reportsDirectory: './.coverage',
        reporter: [
          'text', 'html', 'lcov',
        ],
        include: [ 'src/**/*.{ts,tsx}' ],
        exclude: [
          '**/node_modules/**',
          '**/build/**',
          '**/dist/**',
          '**/.tmp/**',
          '**/*.d.ts',
          'src/types/**',
          'src/styles/**',
          'test/**',
          '**/*.{test,spec}.ts?(x)',
          '**/vite.config.*',
          '**/vitest.config.*',
          '**/neutralino.config.*',
          '**/scripts/**',
        ],
      },
    },
  })
);
