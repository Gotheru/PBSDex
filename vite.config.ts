import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: '/PBSDex/',        // 👈 important for GitHub Pages
    server: {
        port: 4321             // optional, matches what you used before
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                dex: resolve(__dirname, 'dex.html')
            }
        }
    }
});
