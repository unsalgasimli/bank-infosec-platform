import readline from 'node:readline';
import { Writable } from 'node:stream';
import { config } from '../config/index.js';
import { LDAPSyncService } from '../services/ldap-sync.service.js';
import { maskSecret, resolveSecret } from '../utils/crypto.js';

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
  const userIndex = args.indexOf('--user');
  const bindUser = (userIndex >= 0 ? args[userIndex + 1] : undefined) || process.env.AD_USER || config.LDAP_BIND_USER || (await prompt('AD service account: '));
  const bindPassword = resolveSecret(process.env.AD_PASS || config.LDAP_BIND_PASSWORD || '') || (await prompt('AD service-account password: ', true));

  if (!config.LDAP_ENABLED || !config.LDAP_URL || !config.LDAP_BASE_DN || !bindUser || !bindPassword) {
    throw new Error('Set LDAP_ENABLED, LDAP_URL, LDAP_BASE_DN, and service-account credentials before running sync:ad.');
  }

  console.log(`Connecting read-only to ${config.LDAP_URL} as ${bindUser} (password ${maskSecret(bindPassword)})`);
  const report = await LDAPSyncService.syncAllUsers({
    trigger: 'MANUAL_TRIGGER',
    ldapOptions: { bindUser, bindPassword },
  });

  if (report.errors.length) throw new Error(report.errors.join('; '));
  console.log(`Sync complete: ${report.totalLdapUsers} processed; ${report.addedCount} added; ${report.updatedCount} updated; ${report.disabledCount} disabled; ${report.duplicatesRemovedCount} duplicates merged.`);
}

main().catch((error: Error) => {
  console.error(`AD sync failed: ${error.message}`);
  process.exitCode = 1;
});
