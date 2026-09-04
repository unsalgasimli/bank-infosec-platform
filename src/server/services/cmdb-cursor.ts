import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { stableJson } from '../../shared/utils/cmdb-discovery-contract.js';

const cursorSchema = z.object({
  version: z.literal(2), scope: z.string().length(64),
  insertionSnapshot: z.string().max(4096).regex(/^\d+:\d+:(?:\d+(?:,\d+)*)?$/),
  snapshotAt: z.string().min(20).max(64).refine((value) => Number.isFinite(Date.parse(value))),
  expiresAt: z.number().int().positive(),
  boundary: z.object({ id: z.string().min(1).max(64), value: z.string().max(4096).nullable() }).strict().nullable(),
}).strict();
export type AssetCursor = z.infer<typeof cursorSchema>;
const invalid = () => Object.assign(new Error('Asset cursor is invalid, expired, or belongs to different filters. Refresh the inventory.'), { statusCode: 400, code: 'INVALID_ASSET_CURSOR' });

export function assetCursorScope(actorId: string, filters: Record<string, unknown>): string {
  const { page, cursor, pagination, includeTotal, ...scope } = filters;
  for (const [key, value] of Object.entries(scope)) if (Array.isArray(value)) scope[key] = [...new Set(value)].sort();
  return createHash('sha256').update(stableJson({ actorId, filters: scope })).digest('hex');
}

export function encodeAssetCursor(cursor: AssetCursor, secret: string): string {
  const payload = Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function decodeAssetCursor(token: string, scope: string, secret: string, now = Date.now()): AssetCursor {
  try {
    if (token.length > 8192) throw invalid();
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) throw invalid();
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
    const value = cursorSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (value.scope !== scope || value.expiresAt <= now) throw invalid();
    return value;
  } catch { throw invalid(); }
}

/** Same-direction tie key enables a real row-comparison index seek, including nulls. */
export function assetCursorBoundary(column: string, direction: 'ASC' | 'DESC', boundary: NonNullable<AssetCursor['boundary']>, params: unknown[]): string {
  if (!/^a\.(name|ci_number|environment|lifecycle_state|criticality|last_seen_at|updated_at)$/.test(column)) throw new Error('Unsupported cursor sort column.');
  params.push(boundary.id);
  const id = `$${params.length}`;
  const comparison = direction === 'DESC' ? '<' : '>';
  if (boundary.value === null) return direction === 'DESC'
    ? `((${column} IS NULL AND a.id<${id}) OR ${column} IS NOT NULL)`
    : `(${column} IS NULL AND a.id>${id})`;
  params.push(boundary.value);
  const value = `$${params.length}${column.endsWith('_at') ? '::timestamptz' : '::text'}`;
  return `((${column},a.id)${comparison}(${value},${id})${direction === 'ASC' ? ` OR ${column} IS NULL` : ''})`;
}
