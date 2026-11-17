import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'vite';
import {
  JSQR_MODIFICATION_NOTICE,
  jsqrEntry,
  patchJsqrSource,
} from './strict-jsqr.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsqrSource = readFileSync(jsqrEntry, 'utf8');
const patchedJsqr = patchJsqrSource(jsqrSource);

await build({
  configFile: false,
  root,
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(root, 'vendor'),
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(root, 'scripts/vendor-entry.js'),
      formats: ['es'],
      fileName: () => 'qrcode.js',
    },
  },
});

writeFileSync(
  resolve(root, 'vendor/jsQR.js'),
  `${JSQR_MODIFICATION_NOTICE}\n${patchedJsqr}`,
  'utf8',
);
