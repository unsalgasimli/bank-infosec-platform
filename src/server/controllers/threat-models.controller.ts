import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { ThreatModelService } from '../services/threat-model.service.js';

const object = z.object({}).passthrough();
const modelInput = object.extend({ title: z.string().trim().min(1).max(255), description: z.string().max(10000).optional(), organizationId: z.string().trim().min(1).optional(), serviceId: z.string().trim().optional(), assetId: z.string().trim().optional(), projectId: z.string().trim().optional(), changeId: z.string().trim().optional(), releaseId: z.string().trim().optional(), criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(), dataClassification: z.string().trim().optional(), businessOwnerId: z.string().trim().optional(), technicalOwnerId: z.string().trim().optional() });
const threatInput = object.extend({ title: z.string().trim().min(1).max(255), description: z.string().trim().min(1), attackScenario: z.string().trim().min(1), categories: z.array(z.string().trim().min(1)).min(1), inherentLikelihood: z.coerce.number().int().min(1).max(5), inherentImpact: z.coerce.number().int().min(1).max(5) });
const controlInput = object.extend({ title: z.string().trim().min(1).max(255), description: z.string().trim().min(1), controlType: z.string().trim().min(1) });
const verificationInput = object.extend({ verificationType: z.string().trim().min(1), testCase: z.string().trim().min(1), expectedResult: z.string().trim().min(1), result: z.enum(['NOT_RUN', 'PASS', 'FAIL', 'PARTIAL', 'EXPIRED']) });

export class ThreatModelsController {
  private static param(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] || '' : value || ''; }
  private static async execute(req: AuthenticatedRequest, res: Response, operation: () => Promise<unknown>, created = false): Promise<void> {
    try { res.status(created ? 201 : 200).json({ success: true, ...(await operation() as object) }); }
    catch (error) { const detail = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join('; ') : error instanceof Error ? error.message : 'Threat Modeling operation failed.'; const status = error instanceof z.ZodError || /required|invalid|must be|at least|cannot be self/i.test(detail) ? 400 : /not found/i.test(detail) ? 404 : /restricted|authority|only .* may|read-only|access/i.test(detail) ? 403 : /immutable|changed by another/i.test(detail) ? 409 : 500; res.status(status).json({ success: false, error: detail }); }
  }
  private static context(req: AuthenticatedRequest) { return { correlationId: req.correlationId, ip: req.ip, userAgent: req.get('user-agent') }; }

  static list = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ threatModels: await ThreatModelService.list(req.user!) }));
  static policy = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ policy: await ThreatModelService.policy(req.user!, String(req.query.organizationId || 'org-bank')) }));
  static updatePolicy = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ policy: await ThreatModelService.updatePolicy(z.object({ organizationId: z.string().trim().min(1).optional(), policy: z.record(z.unknown()) }).parse(req.body), req.user!) }));
  static report = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ report: await ThreatModelService.governanceReport(req.user!) }));
  static migrationBacklog = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ backlog: await ThreatModelService.listMigrationBacklog(req.user!, String(req.query.organizationId || 'org-bank')) }));
  static upsertMigrationBacklog = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ backlogItem: await ThreatModelService.upsertMigrationBacklog(object.parse(req.body), req.user!) }), true);
  static get = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => await ThreatModelService.detail(this.param(req.params.id), req.user!));
  static revision = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => await ThreatModelService.revisionDetail(this.param(req.params.id), this.param(req.params.revisionId), req.user!));
  static create = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ ...(await ThreatModelService.create(modelInput.parse(req.body), req.user!, this.context(req))) }), true);
  static assess = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ assessment: await ThreatModelService.assessApplicability(object.parse({ ...req.body, threatModelId: this.param(req.params.id) }), req.user!, this.context(req)) }), true);
  static createRevision = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ revision: await ThreatModelService.createRevision(this.param(req.params.id), object.parse(req.body), req.user!, this.context(req)) }), true);
  static addComponent = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ component: await ThreatModelService.addComponent(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static addDataFlow = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ dataFlow: await ThreatModelService.addDataFlow(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static addBoundary = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ trustBoundary: await ThreatModelService.addTrustBoundary(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static addThreat = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ threat: await ThreatModelService.addThreat(this.param(req.params.id), threatInput.parse(req.body), req.user!) }), true);
  static addControl = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ control: await ThreatModelService.addControl(this.param(req.params.id), controlInput.parse(req.body), req.user!) }), true);
  static verifyControl = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ verification: await ThreatModelService.recordVerification(this.param(req.params.id), verificationInput.parse(req.body), req.user!) }), true);
  static calculateResidual = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ threat: await ThreatModelService.calculateResidualRisk(this.param(req.params.id), object.parse(req.body), req.user!) }));
  static linkEnterpriseRisk = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ enterpriseRisk: await ThreatModelService.linkEnterpriseRisk(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static requestRiskAcceptance = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ exception: await ThreatModelService.requestRiskAcceptance(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static decideRiskAcceptance = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ exception: await ThreatModelService.decideRiskAcceptance(this.param(req.params.id), object.parse(req.body), req.user!) }));
  static linkEvidence = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ evidence: await ThreatModelService.linkEvidence(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static submit = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => await ThreatModelService.submit(this.param(req.params.id), req.user!));
  static requestChanges = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => await ThreatModelService.requestChanges(this.param(req.params.id), object.parse(req.body), req.user!));
  static approve = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => await ThreatModelService.decideApproval(this.param(req.params.id), object.parse(req.body), req.user!));
  static releaseGate = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ releaseGate: await ThreatModelService.releaseGate(this.param(req.params.id), req.user!) }));
  static authorizeRelease = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ releaseAuthorization: await ThreatModelService.authorizeRelease(this.param(req.params.id), z.object({ releaseId: z.string().trim().min(1) }).parse(req.body).releaseId, req.user!) }));
  static history = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => { const detail = await ThreatModelService.detail(this.param(req.params.id), req.user!); return { history: detail.history, approvals: detail.approvals, evidence: detail.evidence }; });
}
