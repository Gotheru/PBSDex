import { defineConfig } from 'vite';
import { resolve } from 'path';

// Dynamic base: use '/' in dev and '/PBSDex/' in production (GitHub Pages)
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/PBSDex/' : '/',
  server: {
    port: 4321,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dex: resolve(__dirname, 'dex.html'),
      },
    },
  },
}));

