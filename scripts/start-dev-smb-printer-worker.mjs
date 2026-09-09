import { spawn } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import dotenv from 'dotenv';

// SMB discovery uses Windows' net.exe under the interactive/managed host
// identity. Docker workers stay Linux-only and cannot safely impersonate it.
dotenv.config();
const rabbitUser = process.env.RABBITMQ_USER || 'aegissec';
const rabbitPassword = process.env.RABBITMQ_PASSWORD || process.env.DB_PASSWORD;
const rabbitVhost = process.env.RABBITMQ_VHOST || 'aegissec';
if (!rabbitPassword) throw new Error('DB_PASSWORD or RABBITMQ_PASSWORD is required for the SMB printer worker.');
const rabbitUrl = process.env.RABBITMQ_URL || `amqp://${encodeURIComponent(rabbitUser)}:${encodeURIComponent(rabbitPassword)}@localhost:5672/${encodeURIComponent(rabbitVhost)}`;
const tsxCli = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
const child = spawn(process.execPath, [tsxCli, 'watch', 'src/server/worker.ts'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development', RUN_MIGRATIONS: 'false', RABBITMQ_ENABLED: 'true', RABBITMQ_URL: rabbitUrl, WORKER_CAPABILITY: 'SMB_PRINTER' },
  stdio: 'inherit',
});
child.on('error', (error) => { console.error(`[smb-printer-worker] Failed to start: ${error.message}`); process.exit(1); });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
