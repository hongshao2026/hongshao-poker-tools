import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build output goes to repo's tools/mtt-staking/ so the static portal serves it directly.
// `base: './'` keeps asset URLs relative — works on any path (file://, /, /sub/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, '../../tools/mtt-staking'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
  },
});
