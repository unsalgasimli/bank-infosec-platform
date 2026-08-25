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
      // Listen on every local interface so other devices on the same LAN can
      // open the development UI via http://<this-computer-ip>:5173.
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          // Use the explicit loopback address. On Windows, localhost may resolve
          // to an IPv6 Docker/WSL relay that also owns port 4000 and returns the
          // SPA HTML instead of the Node API response.
          target: 'http://127.0.0.1:4000',
          changeOrigin: false,
          secure: false,
          xfwd: true,
        },
      },
    },
});
