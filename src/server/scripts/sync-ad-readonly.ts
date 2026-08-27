import readline from 'node:readline';
import { Writable } from 'node:stream';
import { config } from '../config/index.js';
import { LDAPSyncService } from '../services/ldap-sync.service.js';
import { resolveSecret } from '../utils/crypto.js';
import { db } from '../db/database.js';
import { runMigrations } from '../db/postgres/migrate.js';
import { pgClient } from '../db/postgres/client.js';

/** Runs the production, read-only directory synchronization pipeline locally. */
async function prompt(query: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const output = hidden
      ? new Writable({
          write(chunk, encoding, callback) {
            if (!muted) process.stdout.write(chunk, encoding);
            callback();
          },
        })
      : process.stdout;
    const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
    rl.question(query, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const noPrompt = args.includes('--no-prompt');
  const interactive = !noPrompt && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const userIndex = args.indexOf('--user');
  const explicitBindUser = userIndex >= 0 ? args[userIndex + 1]?.trim() : undefined;
  const configuredBindUser = process.env.AD_USER || config.LDAP_BIND_USER || '';
  const configuredBindPassword = resolveSecret(process.env.AD_PASS || config.LDAP_BIND_PASSWORD || '');

  if (!interactive && !noPrompt) {
    throw new Error('Interactive credentials are unavailable. Run this command from CMD/PowerShell, or use --no-prompt with AD_USER/AD_PASS.');
  }

  // Normal manual runs always ask for the bind credentials. This prevents an
  // old/stale password in the environment from silently being reused. The
  // non-interactive branch is reserved for CI/scheduler execution.
  const configuredUserHint = configuredBindUser ? ` [${configuredBindUser}]` : '';
  const bindUser = explicitBindUser || (interactive
    ? (await prompt(`AD service account${configuredUserHint}: `)) || configuredBindUser
    : configuredBindUser);
  const bindPassword = interactive
    ? await prompt('AD service-account password: ', true)
    : configuredBindPassword;

  if (config.DB_TYPE !== 'postgres') {
    throw new Error('sync:ad requires DB_TYPE=postgres. Memory mode is test-only and cannot be used for directory synchronization.');
  }

  if (!config.LDAP_ENABLED || !config.LDAP_URL || !config.LDAP_BASE_DN || !bindUser || !bindPassword) {
    throw new Error('Set LDAP_ENABLED, LDAP_URL, LDAP_BASE_DN, and service-account credentials before running sync:ad.');
  }

  // The synchronizer updates the current DB projection; starting with an empty
  // process snapshot could otherwise overwrite records that were not part of
  // the LDAP response. Migrate + hydrate before reading or writing anything.
  await runMigrations();
  await db.initialize();

  console.log(`Connecting read-only to ${config.LDAP_URL} as ${bindUser} (password [REDACTED])`);
  const report = await LDAPSyncService.syncAllUsers({
    trigger: 'MANUAL_TRIGGER',
    ldapOptions: { bindUser, bindPassword },
    dryRun,
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length || report.snapshotAccepted !== true) throw new Error(report.errors.join('; ') || 'Directory snapshot was not accepted.');
  console.log(`Sync ${dryRun ? 'preview' : 'complete'}: ${report.totalLdapUsers} processed; ${report.addedCount} added; ${report.updatedCount} updated; ${report.disabledCount} disabled; ${report.duplicatesRemovedCount} duplicates merged.`);
}

main().catch((error: Error) => {
  console.error(`AD sync failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await pgClient.close();
});
