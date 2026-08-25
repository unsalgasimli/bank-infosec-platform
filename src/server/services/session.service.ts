import { createHmac, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { config } from '../config/index.js';

// `__Host-` cookies require the Secure attribute, which browsers reject over HTTP.
const SESSION_COOKIE_NAME = 'aegis_session';
const SESSION_IDLE_TTL_MS = config.SESSION_TIMEOUT_MINUTES * 60 * 1000;
const SESSION_ABSOLUTE_TTL_MS = config.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;
const SESSION_HASH_KEY = randomBytes(32);

interface SessionRecord {
  userId: string;
  createdAt: number;
  lastSeenAt: number;
}

export class SessionService {
  private static readonly sessions = new Map<string, SessionRecord>();

  private static digest(token: string): string {
    return createHmac('sha256', SESSION_HASH_KEY).update(token).digest('hex');
  }

  public static create(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.sessions.set(this.digest(token), { userId, createdAt: now, lastSeenAt: now });
    return token;
  }

  public static resolve(token: string | undefined): string | undefined {
    if (!token) return undefined;

    const digest = this.digest(token);
    const session = this.sessions.get(digest);
    if (!session) return undefined;

    const now = Date.now();
    const idleExpired = now - session.lastSeenAt > SESSION_IDLE_TTL_MS;
    const absoluteExpired = now - session.createdAt > SESSION_ABSOLUTE_TTL_MS;
    if (idleExpired || absoluteExpired) {
      this.sessions.delete(digest);
      return undefined;
    }

    session.lastSeenAt = now;
    return session.userId;
  }

  public static revoke(token: string | undefined): void {
    if (token) this.sessions.delete(this.digest(token));
  }

  public static revokeAll(): void {
    this.sessions.clear();
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
