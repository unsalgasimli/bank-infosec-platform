import { execFileSync } from 'node:child_process';

function run(args) {
  execFileSync('docker', ['compose', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
}

try {
  // Stop only this repository's Compose project. Do not pass --volumes: local
  // PostgreSQL, Redis, RabbitMQ and uploaded-file data must survive a dev refresh.
  run(['down', '--remove-orphans']);

  // Rebuild the immutable app image, then recreate every defined service so
  // app, worker and scheduler cannot keep old in-memory code or broker state.
  run(['up', '--build', '--force-recreate', '--remove-orphans', '--wait', '--wait-timeout', '240', '-d']);
  console.log('[dev-docker] Compose runtime recreated and ready. Persistent volumes were retained.');
} catch (error) {
  console.error('[dev-docker] Docker Compose refresh failed; local dev was not started. Start Docker Desktop and fix the Compose error, then rerun pnpm dev.');
  process.exitCode = typeof error === 'object' && error && 'status' in error && Number.isInteger(error.status) ? error.status || 1 : 1;
}
