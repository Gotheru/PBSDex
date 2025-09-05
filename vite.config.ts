import { defineConfig } from 'vite';

export default defineConfig({
    base: '/PBSDex/',        // 👈 important for GitHub Pages
    server: {
        port: 4321             // optional, matches what you used before
    }
});
