import type { Request, Response } from 'express';
import { z } from 'zod';
import { ApprovalService } from '../services/approval.service.js';
import { logger } from '../services/logger.service.js';
import { OrchestrationError, WorkflowOrchestrationService } from '../services/workflow-orchestration.service.js';
import { WorkflowPreflightService } from '../services/workflow-preflight.service.js';
import { WorkflowRuntimeService } from '../services/workflow-runtime.service.js';
import { WorkflowTriggerService } from '../services/workflow-trigger.service.js';
import { db } from '../db/database.js';

const contextSchema = z.record(z.unknown());
const launchSchema = z.object({ context: contextSchema.default({}), idempotencyKey: z.string().trim().min(8).max(160).optional(), workflowVersion: z.number().int().positive().optional(), requestTypeId: z.string().trim().optional(), title: z.string().trim().max(255).optional() });

export class OrchestrationController {
  private static actor(req: Request) { return (req as any).user; }
  private static fail(res: Response, error: any, message: string) {
    logger.error({ err: error }, message);
    const status = error instanceof OrchestrationError ? error.statusCode : error?.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ success: false, error: error.message, details: error.details || error.issues });
  }

  public static catalog(req: Request, res: Response) {
    try { res.json({ success: true, ...WorkflowOrchestrationService.catalogPayload(OrchestrationController.actor(req), String(req.query.q || '')) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to load workflow catalog'); }
  }

  public static template(req: Request, res: Response) {
    try { res.json({ success: true, ...WorkflowOrchestrationService.getTemplate(String(req.params.id)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to load workflow template'); }
  }

  public static requestTypes(req: Request, res: Response) {
    try { res.json({ success: true, requestTypes: WorkflowOrchestrationService.catalogPayload(OrchestrationController.actor(req)).requestTypes }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to load request types'); }
  }

  public static governanceMetadata(_req: Request, res: Response) {
    try {
      res.json({
        success: true,
        connectors: db.data.connectorDefinitions.map(({ credentialReferenceIds: _credentials, ...connector }) => connector),
        notificationPolicies: db.data.notificationPoliciesV2,
        businessCalendars: db.data.businessCalendarsV2,
        assignmentRules: db.data.assignmentRulesV2,
      });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to load orchestration governance metadata'); }
  }

  public static requestForm(req: Request, res: Response) {
    try {
      const resolved = WorkflowOrchestrationService.resolveVisibleFields(String(req.params.id), (req.query.values ? JSON.parse(String(req.query.values)) : {}), OrchestrationController.actor(req));
      res.json({ success: true, ...resolved, sections: resolved.sections.map((section) => ({ ...section, fields: section.fields.filter((field) => field.readable !== false) })) });
    }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to resolve request form'); }
  }

  public static validateForm(req: Request, res: Response) {
    try { res.json({ success: true, validation: WorkflowOrchestrationService.validateSubmission(String(req.params.id), contextSchema.parse(req.body?.values || req.body || {}), OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to validate request form'); }
  }

  public static launchTemplate(req: Request, res: Response) {
    try {
      const input = launchSchema.parse(req.body || {});
      const { template } = WorkflowOrchestrationService.getTemplate(String(req.params.id));
      const result = WorkflowRuntimeService.launch({ workflowDefinitionId: template.workflowDefinitionId, workflowVersion: input.workflowVersion || template.publishedWorkflowVersion, requestTypeId: input.requestTypeId, context: input.context, actor: OrchestrationController.actor(req), idempotencyKey: input.idempotencyKey, title: input.title });
      res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to launch workflow template'); }
  }

  public static quickWork(req: Request, res: Response) {
    try {
      const input = z.object({ requestTypeId: z.string().min(1), values: contextSchema, idempotencyKey: z.string().trim().min(8).max(160).optional() }).parse(req.body);
      const result = WorkflowRuntimeService.launchQuickWork({ ...input, actor: OrchestrationController.actor(req) });
      res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to create quick work item'); }
  }

  public static instances(req: Request, res: Response) {
    try { res.json({ success: true, instances: WorkflowRuntimeService.listInstances(OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to list workflow instances'); }
  }

  public static execution(req: Request, res: Response) {
    try { res.json({ success: true, execution: WorkflowRuntimeService.getExecution(String(req.params.id), OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to load workflow execution'); }
  }

  public static completeWorkItem(req: Request, res: Response) {
    try { res.json({ success: true, execution: WorkflowRuntimeService.completeWorkItem(String(req.params.workItemId), OrchestrationController.actor(req), contextSchema.parse(req.body?.output || {})) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to complete work item'); }
  }

  public static decideApproval(req: Request, res: Response) {
    try {
      const input = z.object({ stepId: z.string().min(1), decision: z.enum(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'DELEGATED']), comments: z.string().max(5000).optional(), delegatedToUserId: z.string().optional() }).parse(req.body);
      const execution = WorkflowRuntimeService.getExecution(String(req.params.id), OrchestrationController.actor(req));
      const node = execution.nodes.find((item: any) => item.approvalChainId === String(req.params.chainId));
      const definitionNode = node && WorkflowOrchestrationService.getVersion(execution.instance.workflowDefinitionId, execution.instance.workflowVersion).nodes.find((item) => item.id === node.nodeId);
      if (input.decision === 'REJECTED' && definitionNode?.approval?.commentsMandatoryOnReject && !input.comments?.trim()) throw new OrchestrationError('A rejection comment is required by the approval policy.', 400);
      if (input.decision === 'DELEGATED' && !definitionNode?.approval?.allowDelegation) throw new OrchestrationError('Delegation is not allowed for this approval.', 403);
      const result = ApprovalService.submitDecision({ chainId: String(req.params.chainId), stepId: input.stepId, decision: input.decision, user: OrchestrationController.actor(req), comments: input.comments, delegatedToUserId: input.delegatedToUserId });
      if (!result.success) throw new OrchestrationError(result.error || 'Approval decision failed.', 400);
      res.json({ success: true, chain: result.chain, execution: WorkflowRuntimeService.synchronizeApproval(String(req.params.chainId), OrchestrationController.actor(req)) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to decide workflow approval'); }
  }

  public static cancel(req: Request, res: Response) {
    try { res.json({ success: true, execution: WorkflowRuntimeService.cancel(String(req.params.id), OrchestrationController.actor(req), String(req.body?.reason || 'Cancelled by authorized user.')) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to cancel workflow'); }
  }

  public static migrate(req: Request, res: Response) {
    try {
      const input = z.object({ targetVersion: z.number().int().positive() }).parse(req.body);
      res.json({ success: true, execution: WorkflowRuntimeService.migrateInstance(String(req.params.id), input.targetVersion, OrchestrationController.actor(req)) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to migrate workflow instance'); }
  }

  public static addRelation(req: Request, res: Response) {
    try {
      const input = z.object({ targetType: z.enum(['WORKFLOW_INSTANCE', 'WORK_ITEM', 'TICKET', 'ASSET', 'APPLICATION']), targetId: z.string().min(1), relationType: z.enum(['PARENT', 'CHILD', 'BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATES', 'CAUSED_BY', 'REMEDIATES', 'IMPLEMENTS', 'DEPLOYS', 'TRIGGERED_BY']), metadata: contextSchema.optional() }).parse(req.body);
      res.status(201).json({ success: true, ...WorkflowRuntimeService.addRelation(String(req.params.id), input, OrchestrationController.actor(req)) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to relate workflow work'); }
  }

  public static requeueDeadLetter(req: Request, res: Response) {
    try {
      res.json({ success: true, execution: WorkflowRuntimeService.requeueDeadLetter(String(req.params.id), String(req.params.deadLetterId), OrchestrationController.actor(req)) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to requeue dead-letter workflow action'); }
  }

  public static advance(req: Request, res: Response) {
    try { WorkflowRuntimeService.advance(String(req.params.id), req.body?.now ? new Date(String(req.body.now)) : new Date(), OrchestrationController.actor(req)); res.json({ success: true, execution: WorkflowRuntimeService.getExecution(String(req.params.id), OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to advance workflow'); }
  }

  public static preflight(req: Request, res: Response) {
    try {
      const definitionId = String(req.params.id);
      const version = WorkflowOrchestrationService.getVersion(definitionId, req.body?.version || Number(req.query.version) || undefined);
      res.json({ success: true, preflight: WorkflowPreflightService.validate(version, OrchestrationController.actor(req)) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to validate workflow'); }
  }

  public static simulate(req: Request, res: Response) {
    try { res.json({ success: true, simulation: WorkflowOrchestrationService.simulate(String(req.params.id), req.body?.version, contextSchema.parse(req.body?.context || {}), OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to simulate workflow'); }
  }

  public static saveDraft(req: Request, res: Response) {
    try { res.status(201).json({ success: true, ...WorkflowOrchestrationService.saveDraft(req.body, OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to save workflow draft'); }
  }

  public static publish(req: Request, res: Response) {
    try { res.json({ success: true, ...WorkflowOrchestrationService.publish(String(req.params.id), Number(req.params.version), OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to publish workflow'); }
  }

  public static compareVersions(req: Request, res: Response) {
    try { res.json({ success: true, comparison: WorkflowOrchestrationService.compareVersions(String(req.params.id), Number(req.query.from), Number(req.query.to), OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to compare workflow versions'); }
  }

  public static cloneTemplate(req: Request, res: Response) {
    try {
      const mode = z.enum(['CLONE', 'FORK']).default('CLONE').parse(req.body?.mode);
      res.status(201).json({ success: true, ...WorkflowOrchestrationService.cloneTemplate(String(req.params.id), OrchestrationController.actor(req), mode) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to clone workflow template'); }
  }

  public static lifecycle(req: Request, res: Response) {
    try {
      const lifecycle = z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED']).parse(req.body?.lifecycle);
      res.json({ success: true, ...WorkflowOrchestrationService.setLifecycle(String(req.params.id), lifecycle, OrchestrationController.actor(req)) });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to update workflow lifecycle'); }
  }

  public static emitTrigger(req: Request, res: Response) {
    try {
      const input = z.object({ idempotencyKey: z.string().min(8).max(200), triggerType: z.enum(['RECORD_EVENT', 'DATE_EVENT', 'SCHEDULE', 'EXTERNAL_EVENT', 'DEVOPS_EVENT', 'HR_EVENT', 'IT_EVENT']), eventName: z.string().min(1).max(200), recordType: z.string().max(100).optional(), source: z.string().min(1).max(100), context: contextSchema.default({}) }).parse(req.body);
      const result = WorkflowTriggerService.emit(input, OrchestrationController.actor(req));
      res.status(result.replayed ? 200 : 202).json({ success: true, ...result });
    } catch (error) { OrchestrationController.fail(res, error, 'Failed to process workflow trigger'); }
  }

  public static analytics(req: Request, res: Response) {
    try { res.json({ success: true, analytics: WorkflowRuntimeService.analytics(OrchestrationController.actor(req)) }); }
    catch (error) { OrchestrationController.fail(res, error, 'Failed to load workflow analytics'); }
  }
}
