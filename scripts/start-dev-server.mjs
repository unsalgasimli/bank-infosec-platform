import { execFileSync, spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import dotenv from 'dotenv';

// Read the same local Compose credentials used by the Docker services before
// deriving the host-side RabbitMQ URL. The application imports dotenv later,
// but this launcher must construct the child environment first.
dotenv.config();

// Docker owns 127.0.0.1:4000 in the full local Compose topology. The watched
// TypeScript API is intentionally isolated on 4001, and Vite proxies only to
// this process. Keeping the contract here prevents a shell-level PORT value or
// a stale .env from silently starting a second server on Docker's port.
const developmentApiPort = 4001;
const repositoryRoot = path.resolve(process.cwd()).replace(/\\/g, '/').toLowerCase();

function readPortOwner() {
  const script = [
    `$connection = Get-NetTCPConnection -State Listen -LocalPort ${developmentApiPort} -ErrorAction SilentlyContinue | Select-Object -First 1`,
    'if ($connection) {',
    '  $ownerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"',
    '  [PSCustomObject]@{ pid = $connection.OwningProcess; parentPid = $ownerProcess.ParentProcessId; commandLine = $ownerProcess.CommandLine } | ConvertTo-Json -Compress',
    '}',
    'exit 0',
  ].join('\n');
  const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return output ? JSON.parse(output) : null;
}

function stopPreviousRepositoryApi() {
  if (process.platform !== 'win32') return;
  const owner = readPortOwner();
  if (!owner) return;

  const commandLine = String(owner.commandLine || '').replace(/\\/g, '/').toLowerCase();
  if (!commandLine.includes(repositoryRoot)) {
    throw new Error(
      `Port ${developmentApiPort} is owned by an unrelated process (PID ${owner.pid}). ` +
      'Stop or reconfigure that process; the development launcher will not terminate it.'
    );
  }

  // The listener is the child spawned by tsx. Stop its watcher parent when
  // available so it cannot immediately resurrect the old API underneath us.
  const watcherPid = Number(owner.parentPid) || Number(owner.pid);
  execFileSync('taskkill.exe', ['/PID', String(watcherPid), '/T', '/F'], { stdio: 'inherit' });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!readPortOwner()) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  throw new Error(`Repository API PID ${owner.pid} did not release port ${developmentApiPort} within 10 seconds.`);
}

try {
  stopPreviousRepositoryApi();
} catch (error) {
  console.error(`[dev-api] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
// `pnpm dev` refreshes the complete Compose topology, including the durable
// RabbitMQ relay and worker. The watched host API must therefore join that
// topology as an API-only process; otherwise its development-only PostgreSQL
// outbox fallback competes with the Compose worker against the same database.
const rabbitUser = process.env.RABBITMQ_USER || 'aegissec';
const rabbitPassword = process.env.RABBITMQ_PASSWORD || process.env.DB_PASSWORD;
const rabbitVhost = process.env.RABBITMQ_VHOST || 'aegissec';
const hostRabbitUrl = process.env.RABBITMQ_URL || (rabbitPassword
  ? `amqp://${encodeURIComponent(rabbitUser)}:${encodeURIComponent(rabbitPassword)}@localhost:5672/${encodeURIComponent(rabbitVhost)}`
  : undefined);
const child = spawn(process.execPath, [tsxCli, 'watch', 'src/server/index.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(developmentApiPort),
    HOST: '::',
    RABBITMQ_ENABLED: 'true',
    ...(hostRabbitUrl ? { RABBITMQ_URL: hostRabbitUrl } : {}),
  },
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`[dev-api] Failed to start tsx watch: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
