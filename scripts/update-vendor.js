import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { strictJsqrPlugin } from './strict-jsqr.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  configFile: false,
  root,
  base: './',
  publicDir: false,
  plugins: [strictJsqrPlugin()],
  build: {
    outDir: resolve(root, 'vendor'),
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(root, 'scripts/vendor-entry.js'),
      formats: ['es'],
      fileName: () => 'qr-libraries.js',
    },
  },
});
