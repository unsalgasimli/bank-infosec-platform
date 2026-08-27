import path from 'node:path';
import { runMigrations } from '../db/postgres/migrate.js';
import { pgClient } from '../db/postgres/client.js';
import { DirectoryBaselineService } from '../services/directory-baseline.service.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const workbookPath = argument('--xlsx') || argument('--file');
  if (!workbookPath) {
    throw new Error('Usage: pnpm.cmd directory:import-baseline --xlsx "C:\\path\\Əməkdaş sayı 31.07.2026.xlsx"');
  }
  await runMigrations();
  const report = await DirectoryBaselineService.importWorkbook(path.resolve(workbookPath));
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error: Error) => {
    console.error(`Directory baseline import failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pgClient.close();
  });
