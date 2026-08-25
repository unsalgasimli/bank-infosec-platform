import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';
import { v4 as uuidv4 } from 'uuid';
import { isGenuineEmployeeOrIntern } from '../services/ldap-directory.data.js';
import { SLAService } from '../services/sla.service.js';
import { SLAMetricThresholds, SLAPolicy } from '../../shared/types/sla.js';
import { TechnicalSeverity } from '../../shared/types/ticket.js';

const SLA_SEVERITIES: TechnicalSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
const SLA_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseSlaThresholds(value: unknown): Record<TechnicalSeverity, SLAMetricThresholds> | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const thresholds = {} as Record<TechnicalSeverity, SLAMetricThresholds>;
  for (const severity of SLA_SEVERITIES) {
    const raw = input[severity];
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Record<string, unknown>;
    const parsed = {
      acknowledgmentMinutes: Number(candidate.acknowledgmentMinutes),
      firstResponseMinutes: Number(candidate.firstResponseMinutes),
      remediationMinutes: Number(candidate.remediationMinutes),
      resolutionMinutes: Number(candidate.resolutionMinutes),
    };
    if (Object.values(parsed).some((minutes) => !Number.isInteger(minutes) || minutes <= 0 || minutes > 5256000)) return null;
    thresholds[severity] = parsed;
  }
  return thresholds;
}

function normalizeSlaPayload(body: any, existing?: SLAPolicy): { policy?: SLAPolicy; error?: string } {
  for (const field of ['isActive', 'isDefault', 'businessHoursOnly', 'excludeWeekends', 'excludeHolidays']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') return { error: `${field} must be a boolean.` };
  }
  const name = String(body.name ?? existing?.name ?? '').trim();
  const description = String(body.description ?? existing?.description ?? '').trim();
  const timezone = String(body.timezone ?? existing?.timezone ?? '').trim();
  const businessStartTime = String(body.businessStartTime ?? existing?.businessStartTime ?? '09:00');
  const businessEndTime = String(body.businessEndTime ?? existing?.businessEndTime ?? '18:00');
  const thresholds = parseSlaThresholds(body.thresholds ?? existing?.thresholds);

  if (!name || name.length > 255) return { error: 'SLA policy name is required and must be at most 255 characters.' };
  if (description.length > 4000) return { error: 'SLA policy description must be at most 4000 characters.' };
  if (!timezone) return { error: 'Timezone is required.' };
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    return { error: `Invalid timezone: ${timezone}.` };
  }
  if (!SLA_TIME_PATTERN.test(businessStartTime) || !SLA_TIME_PATTERN.test(businessEndTime)) {
    return { error: 'Business hours must use HH:mm format.' };
  }
  if (!thresholds) return { error: 'Every severity must have four positive minute thresholds.' };

  const policy: SLAPolicy = {
    id: existing?.id || String(body.id || '').trim(),
    name,
    description,
    isActive: body.isActive ?? existing?.isActive ?? true,
    isDefault: Boolean(body.isDefault ?? existing?.isDefault ?? false),
    businessHoursOnly: Boolean(body.businessHoursOnly ?? existing?.businessHoursOnly ?? true),
    businessStartTime,
    businessEndTime,
    timezone,
    excludeWeekends: Boolean(body.excludeWeekends ?? existing?.excludeWeekends ?? true),
    excludeHolidays: Boolean(body.excludeHolidays ?? existing?.excludeHolidays ?? true),
    thresholds,
    createdAt: existing?.createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (policy.isDefault && policy.isActive === false) return { error: 'The default SLA policy must be active.' };
  return { policy };
}

export class AssetsController {
  public static listAssets(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, assets: db.data.assets });
  }

  public static createAsset(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body;
    const now = new Date().toISOString();
    if (!String(body.name || '').trim()) {
      res.status(400).json({ success: false, error: 'Asset name is required.' });
      return;
    }

    const newAsset = {
      id: `asset-${uuidv4()}`,
      cmdbId: body.cmdbId?.trim() || undefined,
      name: body.name.trim(),
      assetType: body.assetType || 'VIRTUAL_MACHINE',
      criticality: body.criticality || 'HIGH',
      environment: body.environment || 'PROD',
      ipAddress: body.ipAddress?.trim() || undefined,
      hostname: body.hostname?.trim() || undefined,
      ownerId: body.ownerId || user.id,
      ownerName: body.ownerName || user.fullName,
      departmentId: body.departmentId || user.departmentId,
      cloudProvider: body.cloudProvider?.trim() || undefined,
      cloudRegion: body.cloudRegion?.trim() || undefined,
      criticalFindingCount: 0,
      highFindingCount: 0,
      lastScannedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    db.data.assets.unshift(newAsset as any);
    AuditService.log({
      actor: user,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newAsset.id,
      metadata: { cmdbId: newAsset.cmdbId, name: newAsset.name },
    });

    db.persist();
    res.status(201).json({ success: true, asset: newAsset });
  }

  public static listApplications(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, applications: db.data.applications });
  }

  public static createApplication(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body;
    const now = new Date().toISOString();
    if (!String(body.name || '').trim() || !String(body.code || '').trim()) {
      res.status(400).json({ success: false, error: 'Application name and code are required.' });
      return;
    }

    const newApp = {
      id: `app-${uuidv4()}`,
      code: body.code.trim(),
      name: body.name.trim(),
      description: body.description || '',
      criticality: body.criticality || 'TIER_1_CRITICAL',
      dataClassification: body.dataClassification || 'RESTRICTED',
      businessOwnerId: body.businessOwnerId || user.id,
      businessOwnerName: body.businessOwnerName || user.fullName,
      technicalOwnerId: body.technicalOwnerId || user.id,
      technicalOwnerName: body.technicalOwnerName || user.fullName,
      departmentId: body.departmentId || user.departmentId,
      techStack: Array.isArray(body.techStack) ? body.techStack : (body.techStack ? body.techStack.split(',').map((s: string) => s.trim()) : []),
      gitRepositories: Array.isArray(body.gitRepositories) ? body.gitRepositories : (body.gitRepositories ? [body.gitRepositories] : []),
      connectedDatabases: Array.isArray(body.connectedDatabases) ? body.connectedDatabases : (body.connectedDatabases ? body.connectedDatabases.split(',').map((s: string) => s.trim()) : []),
      internetExposed: body.internetExposed ?? false,
      openVulnerabilitiesCount: 0,
      criticalVulnerabilitiesCount: 0,
      complianceScope: body.complianceScope || ['PCI_DSS', 'ISO27001'],
      createdAt: now,
      updatedAt: now,
    };

    db.data.applications.unshift(newApp as any);
    AuditService.log({
      actor: user,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newApp.id,
      metadata: { code: newApp.code, name: newApp.name },
    });

    db.persist();
    res.status(201).json({ success: true, application: newApp });
  }
}

export class RisksController {
  public static listRisks(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, risks: db.data.risks });
  }

  public static createRisk(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body;
    const count = db.data.risks.length + 1;
    const now = new Date().toISOString();

    const likelihood = Number(body.likelihood) || 3;
    const impact = Number(body.impact) || 3;
    const inherentScore = likelihood * impact;
    const inherentRating = inherentScore >= 16 ? 'CRITICAL' : inherentScore >= 10 ? 'HIGH' : inherentScore >= 5 ? 'MEDIUM' : 'LOW';

    const residualLikelihood = Number(body.residualLikelihood) || Math.max(1, likelihood - 1);
    const residualImpact = Number(body.residualImpact) || Math.max(1, impact - 1);
    const residualScore = residualLikelihood * residualImpact;
    const residualRating = residualScore >= 16 ? 'CRITICAL' : residualScore >= 10 ? 'HIGH' : residualScore >= 5 ? 'MEDIUM' : 'LOW';

    const newRisk = {
      id: `risk-${Date.now()}`,
      riskCode: `RISK-2026-${String(count).padStart(4, '0')}`,
      title: body.title,
      description: body.description,
      ownerId: body.ownerId || user.id,
      ownerName: body.ownerName || user.fullName,
      departmentId: body.departmentId || user.departmentId,
      affectedApplicationIds: body.affectedApplicationIds || [],
      affectedAssetIds: body.affectedAssetIds || [],
      likelihood,
      impact,
      inherentScore,
      inherentRating,
      existingControls: body.existingControls || '',
      residualLikelihood,
      residualImpact,
      residualScore,
      residualRating,
      treatmentStrategy: body.treatmentStrategy || 'MITIGATE',
      treatmentPlan: body.treatmentPlan || '',
      treatmentDeadline: body.treatmentDeadline || new Date(Date.now() + 86400000 * 90).toISOString().split('T')[0],
      status: 'IDENTIFIED' as const,
      linkedTicketIds: body.linkedTicketIds || [],
      createdAt: now,
      updatedAt: now,
    };

    db.data.risks.unshift(newRisk as any);
    AuditService.log({
      actor: user,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newRisk.id,
      metadata: { riskCode: newRisk.riskCode, title: newRisk.title },
    });

    db.persist();
    res.status(201).json({ success: true, risk: newRisk });
  }
}

export class KBController {
  public static listArticles(req: AuthenticatedRequest, res: Response): void {
    const { cwe, cve, domain } = req.query;
    let articles = db.data.kbArticles;

    if (cwe) {
      articles = articles.filter((a) => a.associatedCwes?.includes(cwe as string));
    }
    if (cve) {
      articles = articles.filter((a) => a.associatedCves?.includes(cve as string));
    }
    if (domain) {
      articles = articles.filter((a) => a.associatedDomains?.includes(domain as string));
    }

    res.json({ success: true, articles });
  }

  public static getArticleBySlug(req: AuthenticatedRequest, res: Response): void {
    const article = db.data.kbArticles.find((a) => a.slug === req.params.slug || a.id === req.params.slug);
    if (!article) {
      res.status(404).json({ success: false, error: 'Knowledge article not found' });
      return;
    }
    article.viewCount += 1;
    res.json({ success: true, article });
  }

  public static createArticle(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body;
    const now = new Date().toISOString();
    const slug = body.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const newArticle = {
      id: `kb-${Date.now()}`,
      slug,
      title: body.title,
      category: body.category || 'INCIDENT_RESPONSE',
      summary: body.summary || '',
      contentMarkdown: body.contentMarkdown || '',
      version: 1,
      authorId: user.id,
      authorName: user.fullName,
      authorRole: user.roles[0] || 'SECURITY_ENGINEER',
      approvedByCiso: true,
      lastReviewedAt: now.split('T')[0],
      tags: Array.isArray(body.tags) ? body.tags : (body.tags ? body.tags.split(',').map((t: string) => t.trim()) : ['playbook', 'sop']),
      viewCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    db.data.kbArticles.unshift(newArticle as any);
    AuditService.log({
      actor: user,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newArticle.id,
      metadata: { title: newArticle.title },
    });

    db.persist();
    res.status(201).json({ success: true, article: newArticle });
  }
}

export class AdminController {
  private static ensureSlaPolicies(): void {
    if (SLAService.ensurePoliciesInstalled()) db.persist();
  }

  public static getMetadata(req: AuthenticatedRequest, res: Response): void {
    db.reload();
    const directoryUsers = db.data.users.filter((user) =>
      user.directorySource === 'ACTIVE_DIRECTORY' &&
      isGenuineEmployeeOrIntern(user, user.distributionGroups || [], user.sAMAccountName || user.username)
    );
    const activeDirectoryDepartmentIds = new Set(directoryUsers.map((user) => user.departmentId));
    res.json({
      success: true,
      users: directoryUsers,
      divisions: db.data.divisions,
      departments: db.data.departments.filter((department) => activeDirectoryDepartmentIds.has(department.id)),
      teams: db.data.teams,
      workflows: db.data.workflows,
      slaPolicies: db.data.slaPolicies,
      automationRules: db.data.automationRules,
      queues: db.data.queues,
    });
  }

  public static getAuditTrail(req: AuthenticatedRequest, res: Response): void {
    const limit = parseInt(req.query.limit as string) || 100;
    res.json({ success: true, events: AuditService.getAllEvents(limit) });
  }

  public static listSlaPolicies(req: AuthenticatedRequest, res: Response): void {
    AdminController.ensureSlaPolicies();
    const policies = [...(db.data.slaPolicies || [])].sort((a, b) => a.name.localeCompare(b.name));
    res.json({ success: true, policies });
  }

  public static createSlaPolicy(req: AuthenticatedRequest, res: Response): void {
    AdminController.ensureSlaPolicies();
    const normalized = normalizeSlaPayload(req.body || {});
    if (normalized.error || !normalized.policy) {
      res.status(400).json({ success: false, error: normalized.error || 'Invalid SLA policy.' });
      return;
    }
    const policy = normalized.policy;
    policy.id = `sla-${uuidv4()}`;
    policy.createdAt = new Date().toISOString();

    if (db.data.slaPolicies.some((item) => item.name.trim().toLowerCase() === policy.name.toLowerCase())) {
      res.status(409).json({ success: false, error: 'An SLA policy with this name already exists.' });
      return;
    }
    if (policy.isDefault || !db.data.slaPolicies.some((item) => item.isDefault && item.isActive !== false)) {
      for (const item of db.data.slaPolicies) item.isDefault = false;
      policy.isDefault = true;
    }

    db.data.slaPolicies.push(policy);
    AuditService.log({
      actor: req.user!,
      action: 'ADMIN_CONFIG_CHANGED',
      entityType: 'SLA_POLICY',
      entityId: policy.id,
      metadata: { action: 'SLA_POLICY_CREATED', name: policy.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      correlationId: req.correlationId,
      persist: false,
    });
    db.persist();
    res.status(201).json({ success: true, policy });
  }

  public static updateSlaPolicy(req: AuthenticatedRequest, res: Response): void {
    AdminController.ensureSlaPolicies();
    const policy = db.data.slaPolicies.find((item) => item.id === req.params.id);
    if (!policy) {
      res.status(404).json({ success: false, error: 'SLA policy not found.' });
      return;
    }
    const normalized = normalizeSlaPayload(req.body || {}, policy);
    if (normalized.error || !normalized.policy) {
      res.status(400).json({ success: false, error: normalized.error || 'Invalid SLA policy.' });
      return;
    }
    const updated = normalized.policy;
    const duplicate = db.data.slaPolicies.find((item) => item.id !== policy.id && item.name.trim().toLowerCase() === updated.name.toLowerCase());
    if (duplicate) {
      res.status(409).json({ success: false, error: 'An SLA policy with this name already exists.' });
      return;
    }
    const wasDefault = policy.isDefault;
    const fieldChanges = Object.keys(updated).flatMap((field) => {
      const oldValue = (policy as any)[field];
      const newValue = (updated as any)[field];
      return JSON.stringify(oldValue) === JSON.stringify(newValue) ? [] : [{ field, oldValue, newValue }];
    });
    Object.assign(policy, updated);
    if (policy.isDefault) {
      for (const item of db.data.slaPolicies) if (item.id !== policy.id) item.isDefault = false;
    } else if (wasDefault && !db.data.slaPolicies.some((item) => item.id !== policy.id && item.isDefault && item.isActive !== false)) {
      policy.isDefault = true;
      res.status(400).json({ success: false, error: 'At least one active default SLA policy is required.' });
      return;
    }
    AuditService.log({
      actor: req.user!,
      action: 'ADMIN_CONFIG_CHANGED',
      entityType: 'SLA_POLICY',
      entityId: policy.id,
      fieldChanges,
      metadata: { action: 'SLA_POLICY_UPDATED', name: policy.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      correlationId: req.correlationId,
      persist: false,
    });
    db.persist();
    res.json({ success: true, policy });
  }

  public static deleteSlaPolicy(req: AuthenticatedRequest, res: Response): void {
    AdminController.ensureSlaPolicies();
    const policy = db.data.slaPolicies.find((item) => item.id === req.params.id);
    if (!policy) {
      res.status(404).json({ success: false, error: 'SLA policy not found.' });
      return;
    }
    if (policy.isDefault) {
      res.status(409).json({ success: false, error: 'The default SLA policy cannot be deleted. Set another policy as default first.' });
      return;
    }
    const references = [
      ...db.data.tickets.filter((ticket) => ticket.slaPolicyId === policy.id).map((ticket) => ticket.key || ticket.id),
      ...db.data.ticketSlaInstances.filter((metric) => metric.policyId === policy.id).map((metric) => metric.id),
      ...db.data.projects.filter((project) => project.slaPolicyId === policy.id).map((project) => project.id),
    ];
    if (references.length > 0) {
      res.status(409).json({ success: false, error: `This policy is referenced by ${references.length} persisted record(s) and cannot be deleted.` });
      return;
    }

    // Archive instead of physically removing policy history. The PostgreSQL
    // projection keeps the record and the existing policy ID remains auditable.
    policy.isActive = false;
    policy.updatedAt = new Date().toISOString();
    AuditService.log({
      actor: req.user!,
      action: 'ADMIN_CONFIG_CHANGED',
      entityType: 'SLA_POLICY',
      entityId: policy.id,
      fieldChanges: [{ field: 'isActive', oldValue: true, newValue: false }],
      metadata: { action: 'SLA_POLICY_ARCHIVED', name: policy.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      correlationId: req.correlationId,
      persist: false,
    });
    db.persist();
    res.json({ success: true, policy });
  }
}
