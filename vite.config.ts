import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: '/AzVault/',
  plugins: [react()],
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  // Tauri expects a fixed port
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
