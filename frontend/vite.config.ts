import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5178,
    strictPort: true,
    // Docker Desktop on Windows may not propagate file change events through bind mounts.
    watch: { usePolling: true, interval: 700 },
    proxy: {
      '/api': { target: 'http://backend:8000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    // Limit concurrent jsdom browsers to avoid CPU/memory starvation in Docker Desktop.
    maxWorkers: 2,
    minWorkers: 1,
    testTimeout: 15000,
  },
});
