import { execFileSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';

const repositoryRoot = path.resolve(process.cwd()).replace(/\\/g, '/').toLowerCase();

function readWindowsProcesses() {
  const output = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim();
  if (!output) return [];
  const parsed = JSON.parse(output);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
    pid: Number(item.ProcessId),
    parentPid: Number(item.ParentProcessId),
    commandLine: String(item.CommandLine || '').replace(/\\/g, '/').toLowerCase(),
  }));
}

function isRepositoryDevProcess(item) {
  if (!item.pid || item.pid === process.pid || !item.commandLine.includes(repositoryRoot)) return false;
  const command = item.commandLine;
  return command.includes('concurrently')
    || command.includes('tsx') && command.includes('watch src/server/index.ts')
    || command.includes('vite') && !command.includes('node_repl')
    || command.includes('tsx') && command.includes('src/server/index.ts');
}

function stopWindowsProcesses() {
  const processes = readWindowsProcesses();
  const targets = processes.filter(isRepositoryDevProcess);
  if (!targets.length) return;

  for (const target of targets) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(target.pid), '/T', '/F'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      console.log(`[dev-cleanup] stopped repository process tree ${target.pid}`);
    } catch {
      // A concurrently child may already have been stopped by its parent.
    }
  }
}

if (process.platform === 'win32') {
  stopWindowsProcesses();
}
