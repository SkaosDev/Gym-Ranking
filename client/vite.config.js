import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * In development the browser talks only to Vite on 5173, which proxies /api to
 * Express on 3000. One apparent origin means the session cookie just works
 * without CORS or a cross-site cookie policy.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
