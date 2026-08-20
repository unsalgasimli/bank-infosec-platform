import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';
import { v4 as uuidv4 } from 'uuid';

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
  public static getMetadata(req: AuthenticatedRequest, res: Response): void {
    db.reload();
    const directoryUsers = db.data.users.filter((user) => user.directorySource === 'ACTIVE_DIRECTORY');
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
}
