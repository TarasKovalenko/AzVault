/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/mock/**',
        'src/types/**',
        'src/**/*.test.*',
        'src/test/**',
        'src/vite-env.d.ts',
      ],
      // Set a little below the current numbers: the gate should catch a real
      // drop in coverage, not fail CI over a one-line refactor.
      thresholds: {
        lines: 91,
        statements: 91,
        functions: 88,
        branches: 88,
      },
    },
  },
});
