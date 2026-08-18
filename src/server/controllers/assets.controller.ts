import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';

export class AssetsController {
  public static listAssets(req: AuthenticatedRequest, res: Response): void {
    res.json({ success: true, assets: db.data.assets });
  }

  public static createAsset(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const body = req.body;
    const now = new Date().toISOString();

    const newAsset = {
      id: `asset-${Date.now()}`,
      cmdbId: body.cmdbId || `CMDB-${Math.floor(1000 + Math.random() * 9000)}`,
      name: body.name,
      assetType: body.assetType || 'VIRTUAL_MACHINE',
      criticality: body.criticality || 'HIGH',
      environment: body.environment || 'PROD',
      ipAddress: body.ipAddress || '10.240.10.15',
      hostname: body.hostname || `${body.name.toLowerCase().replace(/\s+/g, '-')}.apexbank.internal`,
      ownerId: body.ownerId || user.id,
      ownerName: body.ownerName || user.fullName,
      departmentId: body.departmentId || user.departmentId,
      cloudProvider: body.cloudProvider || 'AZURE',
      cloudRegion: body.cloudRegion || 'westeurope',
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

    const newApp = {
      id: `app-${Date.now()}`,
      code: body.code || `APP-${body.name.substring(0, 4).toUpperCase()}`,
      name: body.name,
      description: body.description || '',
      criticality: body.criticality || 'TIER_1_CRITICAL',
      dataClassification: body.dataClassification || 'RESTRICTED',
      businessOwnerId: body.businessOwnerId || user.id,
      businessOwnerName: body.businessOwnerName || user.fullName,
      technicalOwnerId: body.technicalOwnerId || user.id,
      technicalOwnerName: body.technicalOwnerName || user.fullName,
      departmentId: body.departmentId || user.departmentId,
      techStack: Array.isArray(body.techStack) ? body.techStack : (body.techStack ? body.techStack.split(',').map((s: string) => s.trim()) : ['Java 21', 'Spring Boot']),
      gitRepositories: Array.isArray(body.gitRepositories) ? body.gitRepositories : (body.gitRepositories ? [body.gitRepositories] : ['https://gitlab.apexbank.internal/core/service']),
      connectedDatabases: Array.isArray(body.connectedDatabases) ? body.connectedDatabases : (body.connectedDatabases ? body.connectedDatabases.split(',').map((s: string) => s.trim()) : ['Oracle RAC PROD']),
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

export class IncidentsSimulatorController {
  public static simulateIncident(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const { scenario } = req.body;
    const now = new Date().toISOString();
    const count = db.data.tickets.length + 1;

    let title = 'Suspicious Privilege Escalation on Domain Controller';
    let description = 'Microsoft Defender for Identity detected LSASS memory injection and abnormal Kerberos ticket requests originating from Admin Bastion 02.';
    let mitre = [{ techniqueId: 'T1003.001', techniqueName: 'OS Credential Dumping: LSASS Memory' }, { techniqueId: 'T1078', techniqueName: 'Valid Accounts' }];
    let technicalSeverity: any = 'CRITICAL';
    let businessPriority: any = 'P1_BLOCKER';

    if (scenario === 'SWIFT_ANOMALY') {
      title = 'SWIFT Payment Gateway Out-of-Hours Batch Execution Anomaly';
      description = 'SIEM correlation rule SIEM-FIN-09 triggered: SWIFT Alliance Access server initiated MT103 wire transfers exceeding 500,000 AZN outside banking clearing hours.';
      mitre = [{ techniqueId: 'T1565.002', techniqueName: 'Data Manipulation: Transmitted Data' }, { techniqueId: 'T1071.001', techniqueName: 'Application Layer Protocol: Web Protocols' }];
      technicalSeverity = 'CRITICAL';
      businessPriority = 'P1_BLOCKER';
    } else if (scenario === 'RANSOMWARE_CANARY') {
      title = 'Ransomware Canary File Modification Detected on Core File Server';
      description = 'File Integrity Monitoring (FIM) detected rapid rename and encrypted header write on honeypot shares /shares/finance/canary_audit.xlsx.';
      mitre = [{ techniqueId: 'T1486', techniqueName: 'Data Encrypted for Impact' }];
      technicalSeverity = 'CRITICAL';
      businessPriority = 'P1_BLOCKER';
    } else if (scenario === 'DLP_EXFILTRATION') {
      title = 'High Volume Cardholder PAN Data Export to Personal Cloud';
      description = 'Symantec DLP Agent intercepted unencrypted zip archive containing 14,200 VISA/MasterCard PAN records uploaded to Google Drive.';
      mitre = [{ techniqueId: 'T1567.002', techniqueName: 'Exfiltration to Cloud Storage' }];
      technicalSeverity = 'HIGH';
      businessPriority = 'P2_HIGH';
    }

    const key = `SOC-2026-${String(count).padStart(4, '0')}`;
    const newIncident: any = {
      id: `tick-${Date.now()}`,
      key,
      projectCode: 'SOC',
      ticketTypeId: 'type-incident',
      ticketTypeName: 'Security Incident',
      category: scenario === 'DLP_EXFILTRATION' ? 'DLP_ALERT' : 'INCIDENT',
      securityDomain: scenario === 'DLP_EXFILTRATION' ? 'DLP' : 'SOC',
      title,
      description,
      statusId: 'INC_NEW',
      statusName: 'New Triage',
      statusCategory: 'TO_DO',
      workflowId: 'wf-incident-std',
      workflowVersion: 1,
      technicalSeverity,
      businessPriority,
      businessImpact: 'SEVERE',
      inherentRisk: 'CRITICAL',
      residualRisk: 'HIGH',
      riskScore: 90,
      confidentiality: scenario === 'DLP_EXFILTRATION' ? 'HIGHLY_RESTRICTED_HR_LEGAL' : 'CONFIDENTIAL_SECURITY_ONLY',
      restrictedUserIds: [],
      restrictedTeamIds: [],
      reporterId: user.id,
      securityOwnerId: user.id,
      assigneeId: user.id,
      teamId: 'team-soc',
      departmentId: 'dept-soc',
      applicationId: 'app-core-bank',
      assetId: 'asset-bastion-prod',
      watcherIds: [user.id],
      incidentDetails: {
        incidentPhase: 'TRIAGE',
        affectedHostnames: ['srv-bastion-02.apexbank.internal', 'dc01.apexbank.internal'],
        affectedIpAddresses: ['10.240.0.12', '10.240.1.5'],
        mitreAttack: mitre,
        regulatoryNotificationRequired: true,
        notificationDeadline: new Date(Date.now() + 86400000 * 3).toISOString(),
      },
      createdAt: now,
      updatedAt: now,
      detectedAt: now,
      dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
      remediationDeadline: new Date(Date.now() + 86400000 * 1).toISOString(),
      slaPolicyId: 'sla-tier1-banking',
      slaState: 'AT_RISK',
      slaRemainingMinutes: 45,
      version: 1,
      tags: ['siem-alert', 'simulated', 'p1-incident'],
    };

    db.data.tickets.unshift(newIncident);
    AuditService.log({
      actor: user,
      action: 'TICKET_CREATED',
      entityType: 'TICKET',
      entityId: newIncident.id,
      entityKey: newIncident.key,
      metadata: { scenario, title },
    });

    db.persist();
    res.status(201).json({ success: true, ticket: newIncident });
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

