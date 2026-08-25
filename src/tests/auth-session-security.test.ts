import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../server/db/database.js';
import { authMiddleware, requireAuthentication } from '../server/middleware/auth.middleware.js';
import { sameOriginMutationMiddleware } from '../server/middleware/security.middleware.js';
import { SessionService } from '../server/services/session.service.js';
import type { BankUser } from '../shared/types/auth.js';

function responseMock() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body: unknown;

  const response: any = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    status: (code: number) => {
      statusCode = code;
      return response;
    },
    json: (value: unknown) => {
      body = value;
      return response;
    },
  };

  return {
    response,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

test('server sessions isolate users and reject client-forged identities', () => {
  SessionService.revokeAll();
  const firstUser = db.data.users[0];
  firstUser.isActive = true;
  let secondUser = db.data.users.find((user) => user.id !== firstUser.id);
  const createdFixture = !secondUser;
  if (!secondUser) {
    const fixtureUser: BankUser = {
      ...JSON.parse(JSON.stringify(firstUser)),
      id: 'usr-session-isolation-fixture',
      username: 'session.isolation.fixture',
      sAMAccountName: 'session.isolation.fixture',
      email: 'session.isolation.fixture@example.test',
      fullName: 'Session Isolation Fixture',
      roles: ['REQUESTER'],
    };
    db.data.users.push(fixtureUser);
    secondUser = fixtureUser;
  }
  const resolvedSecondUser = secondUser;
  resolvedSecondUser.isActive = true;

  const firstToken = SessionService.create(firstUser.id);
  const secondToken = SessionService.create(resolvedSecondUser.id);

  assert.notEqual(firstToken, secondToken);
  assert.equal(firstToken.includes(firstUser.id), false, 'opaque session IDs must not disclose user IDs');
  assert.equal(SessionService.resolve(firstToken), firstUser.id);
  assert.equal(SessionService.resolve(secondToken), resolvedSecondUser.id);

  const forgedRequest: any = {
    headers: {
      authorization: 'Bearer aegis_jwt_usr-ciso_forged',
      'x-user-id': firstUser.id,
    },
  };
  authMiddleware(forgedRequest, responseMock().response, () => undefined);
  assert.equal(forgedRequest.user, undefined, 'legacy headers must never select a user');

  const authenticatedRequest: any = {
    headers: { cookie: `aegis_session=${secondToken}` },
  };
  authMiddleware(authenticatedRequest, responseMock().response, () => undefined);
  assert.equal(authenticatedRequest.user?.id, resolvedSecondUser.id);

  SessionService.revokeAll();
  if (createdFixture) db.data.users = db.data.users.filter((user) => user.id !== resolvedSecondUser.id);
});

test('session cookies are persistent, script-inaccessible, and HTTP-compatible', () => {
  const response = responseMock();
  SessionService.setCookie(response.response, 'opaque-token');
  const cookie = response.getHeader('set-cookie');

  assert.match(cookie || '', /^aegis_session=/);
  assert.match(cookie || '', /; Path=\//);
  assert.match(cookie || '', /; HttpOnly/);
  assert.doesNotMatch(cookie || '', /; Secure/);
  assert.match(cookie || '', /; SameSite=Strict/);
  assert.doesNotMatch(cookie || '', /; Domain=/);
  assert.match(cookie || '', /; Max-Age=[1-9]\d*/);
});

test('protected middleware fails closed without a valid server session', () => {
  const response = responseMock();
  let calledNext = false;

  requireAuthentication({ headers: {} } as any, response.response, () => {
    calledNext = true;
  });

  assert.equal(calledNext, false);
  assert.equal(response.getStatus(), 401);
  assert.deepEqual(response.getBody(), { success: false, error: 'Authentication required' });
});

test('state-changing requests require an exact same-origin browser request', () => {
  const makeRequest = (origin?: string): any => ({
    method: 'POST',
    protocol: 'http',
    get: (name: string) => {
      const headers: Record<string, string | undefined> = {
        origin,
        host: '127.0.0.1:4000',
        'x-forwarded-host': '10.145.1.43:5173',
        'x-forwarded-proto': 'http',
      };
      return headers[name.toLowerCase()];
    },
  });

  const accepted = responseMock();
  let acceptedNext = false;
  sameOriginMutationMiddleware(
    makeRequest('http://10.145.1.43:5173'),
    accepted.response,
    () => { acceptedNext = true; }
  );
  assert.equal(acceptedNext, true);

  for (const origin of [undefined, 'http://evil.example']) {
    const rejected = responseMock();
    let rejectedNext = false;
    sameOriginMutationMiddleware(makeRequest(origin), rejected.response, () => {
      rejectedNext = true;
    });
    assert.equal(rejectedNext, false);
    assert.equal(rejected.getStatus(), 403);
  }
});

test('development empty-password login permits only an existing active directory user', async () => {
  const { LDAPAuthService } = await import('../server/services/ldap.service.js');
  
  // 1. Test auto auth for existing user (u.gasimli) with empty password
  const result1 = await LDAPAuthService.authenticateLDAP({
    usernameOrEmail: 'u.gasimli',
    password: '',
  });

  assert.equal(result1.success, true);
  assert.ok(result1.user);
  assert.equal(result1.user.username, 'u.gasimli');
  assert.equal(result1.user.ldapBindStatus, 'AUTHENTICATED');

  // 2. Test auto auth with domain prefix (EXPRESSBANK\elvin.novruzov)
  const result2 = await LDAPAuthService.authenticateLDAP({
    usernameOrEmail: 'EXPRESSBANK\\u.gasimli',
    password: '   ',
  });
  assert.equal(result2.success, true);
  assert.equal(result2.user.username, 'u.gasimli');

  // 3. Test auto auth with email format (u.gasimli@expressbank.az)
  const result3 = await LDAPAuthService.authenticateLDAP({
    usernameOrEmail: 'u.gasimli@expressbank.az',
  });
  assert.equal(result3.success, true);
  assert.equal(result3.user.username, 'u.gasimli');

  // 4. A username which is not already in the local AD directory cannot be provisioned by the bypass.
  const resultNew = await LDAPAuthService.authenticateLDAP({
    usernameOrEmail: 'dev.testuser',
    password: '',
  });
  assert.equal(resultNew.success, false);

  // 5. Test empty username is rejected
  const resultEmpty = await LDAPAuthService.authenticateLDAP({
    usernameOrEmail: '',
    password: '',
  });
  assert.equal(resultEmpty.success, false);
});
