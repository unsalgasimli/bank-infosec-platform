import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';

export class AssetsController {
  public static listAssets(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, assets: db.data.assets });
  }

  public static listApplications(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, applications: db.data.applications });
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

    const newRisk = {
      id: `risk-${Date.now()}`,
      riskCode: `RISK-2026-${String(count).padStart(4, '0')}`,
      title: body.title,
      description: body.description,
      ownerId: body.ownerId || user.id,
      departmentId: body.departmentId || user.departmentId,
      affectedApplicationIds: body.affectedApplicationIds || [],
      affectedAssetIds: body.affectedAssetIds || [],
      likelihood: body.likelihood || 3,
      impact: body.impact || 3,
      inherentScore: (body.likelihood || 3) * (body.impact || 3),
      inherentRating: body.inherentRating || 'MEDIUM',
      existingControls: body.existingControls || '',
      residualLikelihood: body.residualLikelihood || 2,
      residualImpact: body.residualImpact || 2,
      residualScore: (body.residualLikelihood || 2) * (body.residualImpact || 2),
      residualRating: body.residualRating || 'LOW',
      treatmentStrategy: body.treatmentStrategy || 'MITIGATE',
      treatmentPlan: body.treatmentPlan || '',
      treatmentDeadline: body.treatmentDeadline || new Date(Date.now() + 86400000 * 90).toISOString(),
      status: 'IDENTIFIED' as const,
      linkedTicketIds: body.linkedTicketIds || [],
      createdAt: now,
      updatedAt: now,
    };

    db.data.risks.unshift(newRisk);
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
}

export class AdminController {
  public static getMetadata(req: AuthenticatedRequest, res: Response): void {
    res.json({
      success: true,
      users: db.data.users,
      divisions: db.data.divisions,
      departments: db.data.departments,
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
