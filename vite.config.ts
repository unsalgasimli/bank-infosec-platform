import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'node:fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const pfxPath = env.AEGIS_HTTPS_PFX_PATH;
  const pfxPassphrase = env.AEGIS_HTTPS_PFX_PASSPHRASE;
  const https = pfxPath && pfxPassphrase && fs.existsSync(pfxPath)
    ? { pfx: fs.readFileSync(pfxPath), passphrase: pfxPassphrase }
    : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Listen on every local interface so other devices on the same LAN can
      // open the development UI via https://<this-computer-ip>:5173.
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https,
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
  };
});
