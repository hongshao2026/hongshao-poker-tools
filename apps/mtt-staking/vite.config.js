import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build output goes to repo's tools/mtt-staking/ so the static portal serves it directly.
// `base: './'` keeps asset URLs relative — works on any path (file://, /, /sub/).
// `injectSharedCss` adds the project-wide stylesheet link after Vite's own
// asset graph (Vite drops relative refs to files outside its root).
const injectSharedCss = () => ({
  name: 'inject-shared-css',
  transformIndexHtml(html) {
    return html.replace(
      '</head>',
      '  <link rel="stylesheet" href="../../assets/shared.css">\n</head>'
    );
  },
});

export default defineConfig({
  base: './',
  plugins: [react(), injectSharedCss()],
  build: {
    outDir: resolve(__dirname, '../../tools/mtt-staking'),
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
  },
});
