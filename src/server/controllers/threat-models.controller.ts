import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { ThreatModelService } from '../services/threat-model.service.js';
import { ThreatControlCatalogService } from '../services/threat-control-catalog.service.js';
import { ThreatAnalysisService } from '../services/threat-analysis.service.js';
import { ThreatGovernanceAdminService } from '../services/threat-governance-admin.service.js';
import { ThreatReadinessService } from '../services/threat-readiness.service.js';
import { ThreatComplianceApplicabilityService } from '../services/threat-compliance-applicability.service.js';

const object = z.object({}).passthrough();
const modelInput = object.extend({ title: z.string().trim().min(1).max(255), description: z.string().max(10000).optional(), organizationId: z.string().trim().min(1).optional(), serviceId: z.string().trim().optional(), assetId: z.string().trim().optional(), projectId: z.string().trim().optional(), changeId: z.string().trim().optional(), releaseId: z.string().trim().optional(), criticality: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(), dataClassification: z.string().trim().optional(), businessOwnerId: z.string().trim().optional(), technicalOwnerId: z.string().trim().optional() });
const threatInput = object.extend({ title: z.string().trim().min(1).max(255), description: z.string().trim().min(1), attackScenario: z.string().trim().min(1), categories: z.array(z.string().trim().min(1)).min(1), inherentLikelihood: z.coerce.number().int().min(1).max(5), inherentImpact: z.coerce.number().int().min(1).max(5) });
const controlInput = object.extend({ title: z.string().trim().min(1).max(255), description: z.string().trim().min(1), controlType: z.string().trim().min(1) });
const verificationInput = object.extend({ verificationType: z.string().trim().min(1), testCase: z.string().trim().min(1), expectedResult: z.string().trim().min(1), result: z.enum(['NOT_RUN', 'PASS', 'FAIL', 'PARTIAL', 'EXPIRED']) });

export class ThreatModelsController {
  static complianceProfile=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,()=>ThreatComplianceApplicabilityService.profile(req.body,req.user!));
  static complianceProfileReview=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,()=>ThreatComplianceApplicabilityService.reviewProfile(req.body,req.user!));
  static complianceApplicability=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,()=>ThreatComplianceApplicabilityService.decide(this.param(req.params.id),req.body,req.user!));
  static readiness=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,async()=>({readiness:await ThreatReadinessService.get(this.param(req.params.id),req.user!)}));
  static coverageDisposition=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,()=>ThreatReadinessService.dispose(this.param(req.params.id),req.body,req.user!));
  static coverageReview=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,()=>ThreatReadinessService.review(this.param(req.params.id),req.body,req.user!));
  static businessCapability=(req:AuthenticatedRequest,res:Response)=>this.execute(req,res,()=>ThreatReadinessService.capability(this.param(req.params.id),req.body,req.user!));
  private static param(value: string | string[] | undefined): string { return Array.isArray(value) ? value[0] || '' : value || ''; }
  private static async execute(req: AuthenticatedRequest, res: Response, operation: () => Promise<unknown>, created = false): Promise<void> {
    try { res.status(created ? 201 : 200).json({ success: true, ...(await operation() as object) }); }
    catch (error) {
      const databaseCode = (error as { code?: string })?.code;
      const detail = error instanceof z.ZodError ? error.issues.map(issue => issue.message).join('; ') : error instanceof Error ? error.message : 'Threat Modeling operation failed.';
      const safeConstraint = ['Referenced architecture cannot be removed; resolve its links first','Flow endpoints must be distinct components in the current revision','Flow boundary must belong to the current revision','A flow crossing security zones requires a trust boundary'].includes(detail) ? detail : undefined;
      const status = databaseCode === '23505' ? 409 : databaseCode === '23503' || databaseCode === '23514' ? 400 : databaseCode === '55000' ? 409
        : /restricted|authority|only .* may|read-only|access|cannot approve|cannot independently verify/i.test(detail) ? 403
        : /immutable|changed by another|already consumed|no longer current/i.test(detail) ? 409
        : /not found/i.test(detail) ? 404
        : error instanceof z.ZodError || /required|invalid|must|cannot|blocked|maximum|expiry|expired|renewal|requires|exceed/i.test(detail) ? 400 : 500;
      const message = databaseCode === '23505' ? 'A duplicate security record already exists.' : databaseCode === '23503' ? 'A related record is unavailable.' : databaseCode === '23514' ? safeConstraint || 'Invalid security record relationship or state.' : databaseCode === '55000' ? 'Approved security history is immutable.' : status === 500 ? 'Threat Modeling operation failed. Contact the platform operator with the correlation ID.' : detail;
      res.status(status).json({ success:false,error:message,correlationId:req.correlationId });
    }
  }
  private static context(req: AuthenticatedRequest) { return { correlationId: req.correlationId, ipAddress: req.ip, userAgent: req.get('user-agent') }; }

  static list = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ threatModels: await ThreatModelService.list(req.user!, req.query) }));
  static downloadEvidence = async(req:AuthenticatedRequest,res:Response):Promise<void>=>{
    try{const evidence=await ThreatModelService.downloadEvidence(this.param(req.params.id),this.param(req.params.evidenceId),req.user!);res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');res.set('Content-Type','application/octet-stream');res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(evidence.fileName)}`);res.send(evidence.buffer);}
    catch(error){res.status(403).json({success:false,error:error instanceof Error?error.message:'Evidence download denied.'});}
  };
  static replaceCompliance = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({mapping:await ThreatGovernanceAdminService.replaceComplianceMapping(this.param(req.params.id),req.body,req.user!)}));
  static escalateException = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({review:await ThreatGovernanceAdminService.escalateException(this.param(req.params.id),this.param(req.params.exceptionId),req.body,req.user!)}),true);
  static lifecycle = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({lifecycle:await ThreatGovernanceAdminService.lifecycle(this.param(req.params.id),req.user!)}));
  static retire = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({request:await ThreatGovernanceAdminService.requestRetirement(this.param(req.params.id),req.body,req.user!)}),true);
  static decideRetirement = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({decision:await ThreatGovernanceAdminService.decideRetirement(this.param(req.params.id),this.param(req.params.requestId),req.body,req.user!)}));
  static retain = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({event:await ThreatGovernanceAdminService.retain(this.param(req.params.id),req.body,req.user!)}),true);
  static grants = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>await ThreatGovernanceAdminService.grants(this.param(req.params.id),req.user!));
  static grant = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({grant:await ThreatGovernanceAdminService.grant(this.param(req.params.id),req.body,req.user!)}),true);
  static revokeGrant = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({grant:await ThreatGovernanceAdminService.revoke(this.param(req.params.id),this.param(req.params.grantId),req.body,req.user!)}));
  static decideCompliance = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({decision:await ThreatGovernanceAdminService.decideCompliance(this.param(req.params.id),req.body,req.user!)}));
  static analysis = (req:AuthenticatedRequest,res:Response):Promise<void> => {res.set('Cache-Control','no-store');return this.execute(req,res,async()=>({analysis:await ThreatAnalysisService.list(this.param(req.params.id),req.query,req.user!)}));};
  static suggestThreats = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>await ThreatAnalysisService.suggest(this.param(req.params.id),req.body,req.user!));
  static importSuggestion = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({suggestion:await ThreatAnalysisService.importSuggestion(this.param(req.params.id),req.body,req.user!)}),true);
  static disposeSuggestion = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({disposition:await ThreatAnalysisService.decide(this.param(req.params.id),this.param(req.params.suggestionId),req.body,req.user!)}));
  static attackCase = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({attackCase:await ThreatAnalysisService.addCase(this.param(req.params.id),req.body,req.user!)}),true);
  static findingLinks = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({links:await ThreatModelService.findingLinks(this.param(req.params.id),req.user!)}));
  static linkFinding = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({link:await ThreatModelService.linkFinding(this.param(req.params.id),req.body,req.user!)}),true);
  static assessFinding = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({assessment:await ThreatModelService.assessFinding(this.param(req.params.id),this.param(req.params.linkId),req.body,req.user!)}),true);
  static controlCatalog = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({definitions:await ThreatControlCatalogService.list(req.query,req.user!)}));
  static createControlDefinition = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({definition:await ThreatControlCatalogService.create(object.parse(req.body),req.user!,this.context(req))}),true);
  static decideControlDefinition = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({decision:await ThreatControlCatalogService.decide(this.param(req.params.id),object.parse(req.body),req.user!,this.context(req))}));
  static catalogControl = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({control:await ThreatModelService.addControl(this.param(req.params.id),object.extend({catalogVersionId:z.string().min(1),implementationKey:z.string().trim().min(1)}).parse(req.body),req.user!)}),true);
  static mapControlThreat = (req:AuthenticatedRequest,res:Response):Promise<void> => this.execute(req,res,async()=>({control:await ThreatModelService.mapControlThreat(this.param(req.params.id),object.parse(req.body),req.user!)}));
  static governancePolicy = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ policy: await ThreatModelService.governancePolicy() }));
  static consumeReleaseAuthorization = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ releaseDecision: await ThreatModelService.consumeReleaseAuthorization(this.param(req.params.id), object.parse(req.body), req.user!) }));
  static updateGovernancePolicy = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ policy: await ThreatModelService.updateGovernancePolicy(object.parse(req.body), req.user!) }));
  static governanceDetail = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ governance: await ThreatModelService.governanceDetail(this.param(req.params.id), req.user!) }));
  static requestEmergency = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>({emergency:await ThreatModelService.requestEmergencyChange(this.param(req.params.id),object.parse(req.body),req.user!)}),true);
  static decideEmergency = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>({emergency:await ThreatModelService.decideEmergencyChange(this.param(req.params.id),this.param(req.params.emergencyId),object.parse(req.body),req.user!)}));
  static deployEmergency = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>({emergency:await ThreatModelService.recordEmergencyDeployment(this.param(req.params.id),this.param(req.params.emergencyId),object.parse(req.body),req.user!)}));
  static reviewEmergency = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>({emergency:await ThreatModelService.reviewEmergencyChange(this.param(req.params.id),this.param(req.params.emergencyId),object.parse(req.body),req.user!)}));
  static closeEmergency = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>({emergency:await ThreatModelService.closeEmergencyChange(this.param(req.params.id),this.param(req.params.emergencyId),req.user!)}));
  static linkRequirementControl = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ mapping: await ThreatModelService.linkRequirementControl(this.param(req.params.id), object.parse(req.body), req.user!) }));
  static updateScope = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => await ThreatModelService.updateScope(this.param(req.params.id), object.parse(req.body), req.user!));
  static requirement = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ requirement: await ThreatModelService.createRequirement(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static compliance = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ requirement: await ThreatModelService.addComplianceRequirement(object.parse(req.body), req.user!) }), true);
  static dataObject = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ dataObject: await ThreatModelService.addDataObject(this.param(req.params.id), object.parse(req.body), req.user!) }), true);
  static transitionThreat = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => ({ threat: await ThreatModelService.transitionThreat(this.param(req.params.id), object.parse(req.body), req.user!) }));
  static updateThreat = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>({threat:await ThreatModelService.updateThreat(this.param(req.params.id),object.parse(req.body),req.user!,this.context(req))}));
  static editArchitecture = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req,res,async()=>await ThreatModelService.editArchitecture(this.param(req.params.id),this.param(req.params.entityId),{...object.parse(req.body),kind:this.param(req.params.kind)},req.user!,this.context(req)));
  static threatLineage = (req: AuthenticatedRequest, res: Response): Promise<void> => { res.set('Cache-Control','no-store'); return this.execute(req,res,async()=>({lineage:await ThreatModelService.threatLineage(this.param(req.params.id),req.query,req.user!)})); };
  static exportSnapshot = (req: AuthenticatedRequest, res: Response): Promise<void> => { res.set('Cache-Control','no-store'); return this.execute(req, res, async () => ({ report: await ThreatModelService.exportSnapshot(this.param(req.params.id), this.param(req.params.revisionId), req.user!) })); };
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
  static authorizeRelease = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => { const input=z.object({releaseId:z.string().trim().min(1),emergencyChangeId:z.string().trim().min(1).optional()}).parse(req.body); return {releaseAuthorization:await ThreatModelService.authorizeRelease(this.param(req.params.id),input.releaseId,req.user!,input.emergencyChangeId)}; });
  static history = (req: AuthenticatedRequest, res: Response): Promise<void> => this.execute(req, res, async () => { const detail = await ThreatModelService.detail(this.param(req.params.id), req.user!); return { history: detail.history, approvals: detail.approvals, evidence: detail.evidence }; });
}
