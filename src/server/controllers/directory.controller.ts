import { Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowTemplateService } from '../services/workflow-template.service.js';
import { config } from '../config/index.js';
import { DepartmentsRepository } from '../db/postgres/departments-repository.js';
import { pgClient } from '../db/postgres/client.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

const governancePatchSchema = z.object({
  accountType: z.enum(['HUMAN', 'SERVICE', 'TEST', 'TECHNICAL', 'PRIVILEGED']),
  organizationEligible: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Single read contract for every assignment picker in the client.
 * The service reloads the durable projection before reading, so the UI never
 * has to invent department, section, or employee records locally.
 */
export class DirectoryController {
  public static async governance(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (config.DB_TYPE !== 'postgres') {
      res.status(409).json({ success: false, error: 'Directory governance requires PostgreSQL.' });
      return;
    }
    try {
      const [summary, candidates] = await Promise.all([
        pgClient.query(`SELECT coalesce(source_payload->>'directoryAccountType', 'HUMAN') AS account_type, coalesce(source_payload->>'organizationEligible', 'true') AS organization_eligible, count(*)::int AS count FROM bank_users WHERE is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY' GROUP BY 1, 2 ORDER BY 1, 2`),
        pgClient.query(`SELECT id, username, full_name, title, department_id, section_id, coalesce(source_payload->>'directoryAccountType', 'HUMAN') AS account_type, coalesce(source_payload->>'organizationEligible', 'true') AS organization_eligible FROM bank_users WHERE is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY' AND coalesce(source_payload->>'organizationEligible', 'true') = 'false' ORDER BY account_type, username LIMIT 250`),
      ]);
      res.json({ success: true, summary: summary.rows, candidates: candidates.rows, policy: { placement: 'DN and title', groups: 'access only', syncSafe: true } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Directory governance could not be loaded.' });
    }
  }

  public static async updateGovernance(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (config.DB_TYPE !== 'postgres') {
      res.status(409).json({ success: false, error: 'Directory governance requires PostgreSQL.' });
      return;
    }
    const parsed = governancePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid directory governance override.' });
      return;
    }
    try {
      const result = await pgClient.transaction(async (client) => {
        const target = await client.query(`SELECT id, username, full_name, source_payload FROM bank_users WHERE id = $1 AND is_active = TRUE AND directory_source = 'ACTIVE_DIRECTORY' FOR UPDATE`, [String(req.params.id || '')]);
        if (target.rowCount !== 1) throw new Error('Active directory identity was not found.');
        const patch = { directoryAccountType: parsed.data.accountType, organizationEligible: parsed.data.organizationEligible, directoryGovernanceOverride: { reason: parsed.data.reason, updatedBy: req.user!.id, updatedAt: new Date().toISOString() } };
        await client.query(`UPDATE bank_users SET department_id = CASE WHEN $2::boolean THEN department_id ELSE NULL END, section_id = CASE WHEN $2::boolean THEN section_id ELSE NULL END, source_payload = coalesce(source_payload, '{}'::jsonb) || $3::jsonb, updated_at = NOW() WHERE id = $1`, [target.rows[0].id, parsed.data.organizationEligible, JSON.stringify(patch)]);
        await client.query(`INSERT INTO audit_events(id,event_type,action,actor_id,actor_name,actor_role,ip_address,user_agent,entity_type,entity_id,after_state,timestamp,source_payload) VALUES($1,'ADMIN_CONFIG_CHANGED','DIRECTORY_IDENTITY_OVERRIDDEN',$2,$3,$4,$5,'directory-governance','DIRECTORY_USER',$6,$7::jsonb,NOW(),$8::jsonb)`, [`aud-${uuidv4()}`, req.user!.id, req.user!.fullName, req.user!.roles[0] || 'PLATFORM_ADMIN', req.ip || 'unknown', target.rows[0].id, JSON.stringify(patch), JSON.stringify({ username: target.rows[0].username })]);
        return target.rows[0];
      });
      res.json({ success: true, identity: { id: result.id, username: result.username } });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error?.message || 'Directory override was not saved.' });
    }
  }

  public static async assignmentOptions(req: Request, res: Response): Promise<void> {
    if (config.DB_TYPE === 'postgres') {
      try {
        const options = await DepartmentsRepository.listAssignmentOptions({
          departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
          sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
          query: typeof req.query.query === 'string' ? req.query.query : undefined,
          offset: Number.parseInt(String(req.query.offset || '0'), 10),
          limit: Number.parseInt(String(req.query.limit || '100'), 10),
        });
        res.json({ success: true, ...options, teams: [] });
        return;
      } catch (error: any) {
        res.status(500).json({ success: false, error: error?.message || 'Directory assignment options could not be loaded.' });
        return;
      }
    }
    const metadata = WorkflowTemplateService.metadata();
    const offset = Number.parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.parseInt(String(req.query.limit || '100'), 10);
    const page = WorkflowTemplateService.assignmentOptions({
      departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
      sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
      query: typeof req.query.query === 'string' ? req.query.query : undefined,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 100,
    });

    res.json({
      success: true,
      directory: metadata.directory,
      departments: metadata.departments,
      sections: metadata.sections,
      teams: metadata.teams,
      users: page.users,
      total: page.total,
      nextOffset: page.nextOffset,
    });
  }
}
