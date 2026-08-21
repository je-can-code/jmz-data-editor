// noinspection HtmlUnknownTaret,JSUnresolvedLibraryURL

import { defineConfig } from 'vite';
import * as path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const _dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [ react() ],
  resolve: {
    alias: {
      // keep these in sync with tsconfig.json
      '@core': path.resolve(_dirname, 'src/core'),
      '@components': path.resolve(_dirname, 'src/components'),
      '@infrastructure': path.resolve(_dirname, 'src/infrastructure'),

      '@presentation': path.resolve(_dirname, 'src/presentation'),
      '@boards': path.resolve(_dirname, 'src/presentation/boards'),

      '@platform': path.resolve(_dirname, 'src/platform'),
      '@mappers': path.resolve(_dirname, 'src/mappers'),
      '@services': path.resolve(_dirname, 'src/services'),
      '@types': path.resolve(_dirname, 'src/types'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'build',
  },
});
