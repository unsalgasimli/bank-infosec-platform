import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
  resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Listen on the IPv6 unspecified address so localhost resolves quickly
      // on Windows even when the browser prefers ::1. Node accepts IPv4
      // connections on this listener as well, so LAN access remains available.
      host: '::',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          // Keep the source-watched API separate from Docker's published
          // loopback listener. Its dedicated 4001 port prevents Vite from
          // proxying to the immutable Docker service on 127.0.0.1:4000.
          target: 'http://127.0.0.1:4001',
          changeOrigin: false,
          secure: false,
          xfwd: true,
          configure: (proxy) => {
            // `tsx watch` deliberately restarts the API process after a source
            // change. Convert that brief, expected hand-off into an explicit
            // HTTP response instead of letting Vite emit ECONNREFUSED errors
            // (or accidentally serving the SPA fallback to an API request).
            proxy.on('error', (_error, _request, response) => {
              if (!response || response.headersSent) return;
              response.writeHead(503, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store',
                'Retry-After': '1',
              });
              response.end(JSON.stringify({
                error: 'LOCAL_API_RESTARTING',
                message: 'The local API is restarting. Retry the request in a moment.',
              }));
            });
          },
        },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep long-lived third-party code cacheable across application
        // releases. Route modules are already loaded on demand from App.tsx.
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/node_modules/')) return 'vendor';
          if (normalized.includes('/src/shared/')) return 'shared';
          return undefined;
        },
      },
    },
  },
});
