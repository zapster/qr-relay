import { defineConfig } from 'vite';
import { strictJsqrPlugin } from './build/strict-jsqr.js';

export default defineConfig({
  base: './',
  plugins: [strictJsqrPlugin()],
  optimizeDeps: {
    rolldownOptions: {
      plugins: [strictJsqrPlugin({ requireTransform: false })],
    },
  },
  build: {
    modulePreload: false,
  },
});
