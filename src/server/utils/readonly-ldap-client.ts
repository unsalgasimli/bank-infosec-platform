import { Client, ClientOptions, SearchOptions, SearchResult } from 'ldapts';
import fs from 'node:fs';
import { logger } from '../services/logger.service.js';

export class StrictReadOnlyLdapViolationError extends Error {
  constructor(operation: string) {
    super(
      `[SECURITY ENFORCEMENT VIOLATION] Active Directory write operation "${operation}" was intercepted and blocked. ` +
      `Banking security policy strictly prohibits modifications, additions, or deletions against Active Directory.`
    );
    this.name = 'StrictReadOnlyLdapViolationError';
  }
}

export interface SecureLdapClientConfig {
  url: string;
  timeout?: number;
  connectTimeout?: number;
  tlsRejectUnauthorized?: boolean;
  caCertPath?: string;
  caCertContent?: string;
}

/**
 * StrictReadOnlyLdapClient wraps ldapts Client to enforce that only read operations (bind, search, unbind)
 * can be executed. Any attempt to modify, add, or delete LDAP records throws a fatal security exception.
 * It also mandates LDAPS protocol and validates TLS certificate settings.
 */
export class StrictReadOnlyLdapClient {
  private client: Client;
  public readonly isStrictReadOnly = true;
  public readonly url: string;

  constructor(cfg: SecureLdapClientConfig) {
    const rawUrl = (cfg.url || '').trim();

    // 1. Enforce LDAPS protocol
    if (!rawUrl.toLowerCase().startsWith('ldaps://')) {
      throw new Error(
        `[SECURITY POLICY VIOLATION] Cleartext LDAP connections are strictly prohibited. ` +
        `Target URL must use secure LDAPS (ldaps://...:636). Received: "${rawUrl}"`
      );
    }
    this.url = rawUrl;

    // 2. Configure TLS validation & Root CAs
    const tlsOptions: any = {
      rejectUnauthorized: cfg.tlsRejectUnauthorized !== false,
    };

    if (cfg.caCertContent) {
      tlsOptions.ca = [cfg.caCertContent];
      tlsOptions.rejectUnauthorized = true;
    } else if (cfg.caCertPath && fs.existsSync(cfg.caCertPath)) {
      try {
        tlsOptions.ca = [fs.readFileSync(cfg.caCertPath, 'utf8')];
        tlsOptions.rejectUnauthorized = true;
      } catch (err: any) {
        logger.error({ err: err.message, path: cfg.caCertPath }, 'Failed to load enterprise CA certificate');
      }
    }

    if (tlsOptions.rejectUnauthorized === false) {
      logger.warn(
        { url: rawUrl },
        '⚠️ SECURITY WARNING: rejectUnauthorized=false in LDAPS configuration. ' +
        'Ensure this is only used in isolated staging environments with controlled PKI.'
      );
    }

    this.client = new Client({
      url: rawUrl,
      timeout: cfg.timeout || 10000,
      connectTimeout: cfg.connectTimeout || 10000,
      tlsOptions,
    });
  }

  public async bind(dn: string, password: string): Promise<void> {
    return this.client.bind(dn, password);
  }

  public async search(baseDN: string, options: SearchOptions): Promise<SearchResult> {
    return this.client.search(baseDN, options);
  }

  public async unbind(): Promise<void> {
    return this.client.unbind();
  }

  // Physical runtime & compile-time blocks on any write operation
  public async add(): Promise<never> {
    throw new StrictReadOnlyLdapViolationError('add');
  }

  public async modify(): Promise<never> {
    throw new StrictReadOnlyLdapViolationError('modify');
  }

  public async del(): Promise<never> {
    throw new StrictReadOnlyLdapViolationError('del');
  }

  public async modifyDN(): Promise<never> {
    throw new StrictReadOnlyLdapViolationError('modifyDN');
  }

  public async compare(): Promise<never> {
    throw new StrictReadOnlyLdapViolationError('compare');
  }
}
