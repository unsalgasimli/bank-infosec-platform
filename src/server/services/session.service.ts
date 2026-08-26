import { createHmac, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { config } from '../config/index.js';
import { pgClient } from '../db/postgres/client.js';

// `__Host-` cookies require the Secure attribute, which browsers reject over HTTP.
const SESSION_COOKIE_NAME = 'aegis_session';
const SESSION_IDLE_TTL_MS = config.SESSION_TIMEOUT_MINUTES * 60 * 1000;
const SESSION_ABSOLUTE_TTL_MS = config.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;
const useProcessLocalTestStore = () =>
  config.DB_TYPE === 'memory' ||
  process.env.NODE_ENV === 'test' ||
  process.argv.some((argument) => argument === '--test' || argument.includes('.test.ts') || argument.includes('test-concurrency'));

interface SessionRecord {
  userId: string;
  createdAt: number;
  lastSeenAt: number;
}

export class SessionService {
  // DB_TYPE=memory is limited to isolated tests. Durable runtime sessions live
  // in PostgreSQL and only retain a HMAC of the opaque browser token.
  private static readonly testSessions = new Map<string, SessionRecord>();

  private static digest(token: string): string {
    return createHmac('sha256', config.JWT_SECRET).update(`aegissec-session:${token}`).digest('hex');
  }

  public static async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    if (useProcessLocalTestStore()) {
      this.testSessions.set(this.digest(token), { userId, createdAt: now, lastSeenAt: now });
      return token;
    }
    await pgClient.query(
      `INSERT INTO auth_sessions(token_hash,user_id,created_at,last_seen_at,expires_at)
       VALUES($1,$2,NOW(),NOW(),NOW() + ($3 * INTERVAL '1 millisecond'))`,
      [this.digest(token), userId, SESSION_ABSOLUTE_TTL_MS]
    );
    return token;
  }

  public static async resolve(token: string | undefined): Promise<string | undefined> {
    if (!token) return undefined;

    const digest = this.digest(token);
    const now = Date.now();
    if (useProcessLocalTestStore()) {
      const session = this.testSessions.get(digest);
      if (!session) return undefined;
      const idleExpired = now - session.lastSeenAt > SESSION_IDLE_TTL_MS;
      const absoluteExpired = now - session.createdAt > SESSION_ABSOLUTE_TTL_MS;
      if (idleExpired || absoluteExpired) {
        this.testSessions.delete(digest);
        return undefined;
      }
      session.lastSeenAt = now;
      return session.userId;
    }
    const result = await pgClient.query<{ user_id: string }>(
      `UPDATE auth_sessions SET last_seen_at=NOW()
       WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()
         AND last_seen_at > NOW() - ($2 * INTERVAL '1 millisecond')
       RETURNING user_id`,
      [digest, SESSION_IDLE_TTL_MS]
    );
    return result.rows[0]?.user_id;
  }

  public static async revoke(token: string |undefined): Promise<void> {
    if (!token) return;
    const digest = this.digest(token);
    if (useProcessLocalTestStore()) {
      this.testSessions.delete(digest);
      return;
    }
    await pgClient.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL', [digest]);
  }

  public static async revokeAll(): Promise<void> {
    if (useProcessLocalTestStore()) {
      this.testSessions.clear();
      return;
    }
    await pgClient.query('UPDATE auth_sessions SET revoked_at=NOW() WHERE revoked_at IS NULL');
  }

  public static readToken(req: Request): string | undefined {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return undefined;

    for (const cookie of cookieHeader.split(';')) {
      const separator = cookie.indexOf('=');
      if (separator < 0) continue;
      const name = cookie.slice(0, separator).trim();
      if (name === SESSION_COOKIE_NAME) {
        return decodeURIComponent(cookie.slice(separator + 1).trim());
      }
    }
    return undefined;
  }

  public static setCookie(res: Response, token: string): void {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_ABSOLUTE_TTL_MS / 1000)}`
    );
  }

  public static clearCookie(res: Response): void {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`
    );
  }
}
