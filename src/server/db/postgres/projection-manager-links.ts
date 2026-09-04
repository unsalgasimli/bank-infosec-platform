import type pg from 'pg';

/** Reconcile the complete snapshot after inserts, without clearing/rebuilding unchanged edges. */
export async function persistManagerLinks(
  client: Pick<pg.PoolClient, 'query'>,
  users: Array<{ id: string; managerId?: string }>,
  departments: Array<{ id: string; managerId?: string; source_payload?: { managerId?: string }; sourcePayload?: { managerId?: string } }>,
): Promise<void> {
  const userIds = new Set(users.map((user) => user.id));
  const userLinks = users.map((user) => ({ id: user.id, managerId: user.managerId && user.managerId !== user.id && userIds.has(user.managerId) ? user.managerId : null }));
  const departmentLinks = departments.map((department) => {
    const managerId = department.managerId || department.source_payload?.managerId || department.sourcePayload?.managerId;
    return { id: department.id, managerId: managerId && userIds.has(managerId) ? managerId : null };
  });
  // Table names are closed constants, never external identifiers. Bound arrays
  // preserve null removals and bound packet size for large directory snapshots.
  for (const [table, links] of [['bank_users', userLinks], ['bank_departments', departmentLinks]] as const) {
    for (let start = 0; start < links.length; start += 1000) {
      const batch = links.slice(start, start + 1000);
      await client.query(`UPDATE ${table} target SET manager_id=incoming.manager_id,updated_at=NOW()
        FROM unnest($1::text[],$2::text[]) AS incoming(id,manager_id)
        WHERE target.id=incoming.id AND target.manager_id IS DISTINCT FROM incoming.manager_id`,
      [batch.map((link) => link.id), batch.map((link) => link.managerId)]);
    }
  }
}
