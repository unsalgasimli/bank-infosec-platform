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
          // Keep the dev API separate from Docker's IPv4 loopback listener.
          // The local API binds to IPv6 loopback, so Vite cannot accidentally
          // proxy /api requests to an unrelated Docker service on 127.0.0.1.
          target: 'http://[::1]:4000',
          changeOrigin: false,
          secure: false,
          xfwd: true,
        },
      },
    },
});
