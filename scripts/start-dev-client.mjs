import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

// The UI must not become available before the source-watched API that Vite
// proxies to. Otherwise a page can mount during migrations and retain an
// avoidable startup error even though the API becomes healthy seconds later.
const apiHealthUrl = process.env.VITE_API_HEALTH_URL || 'http://127.0.0.1:4001/api/health';
const readinessTimeoutMs = Number(process.env.VITE_API_READY_TIMEOUT_MS || 90_000);
const pollIntervalMs = 500;

async function waitForApi() {
  const deadline = Date.now() + readinessTimeoutMs;
  let lastFailure = 'the API is not listening yet';
  console.log(`[dev-client] waiting for source API readiness at ${apiHealthUrl}`);

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(apiHealthUrl, { cache: 'no-store', signal: controller.signal });
      if (response.ok) {
        console.log('[dev-client] source API is ready; starting Vite.');
        return;
      }
      lastFailure = `received HTTP ${response.status}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `[dev-client] source API did not become ready within ${readinessTimeoutMs / 1000}s at ${apiHealthUrl}: ${lastFailure}`,
  );
}

try {
  await waitForApi();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const viteCli = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
// Keep the checkout identity in the Windows command line. This lets
// dev:cleanup distinguish this Vite listener from another project's Vite
// process when the next `pnpm dev` needs to reclaim port 5173.
const viteConfig = path.resolve(process.cwd(), 'vite.config.ts');
const vite = spawn(process.execPath, [viteCli, '--config', viteConfig], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

vite.on('error', (error) => {
  console.error(`[dev-client] Failed to start Vite: ${error.message}`);
  process.exit(1);
});
vite.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
