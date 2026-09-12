import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages marketing site build (published to /AzVault/).
export default defineConfig({
  root: 'site',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: '/AzVault/',
  // Site-only static assets. Sharing the desktop app's public/ would package
  // the 815 KB social card into every installer.
  publicDir: 'public',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      allow: ['..'],
    },
  },
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
  },
});
