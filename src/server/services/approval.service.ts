import crypto from 'crypto';
import { TicketApprovalChain, ApprovalStep, ApprovalDecision, ApproverResolverType } from '../../shared/types/approval.js';
import { BankRole, BankUser } from '../../shared/types/auth.js';
import { Ticket } from '../../shared/types/ticket.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';
import { AutomationService } from './automation.service.js';

export class ApprovalService {
  public static getApprovalChainForTicket(ticketId: string): TicketApprovalChain | undefined {
    return db.data.approvals.find((a) => a.ticketId === ticketId);
  }

  /**
   * Resolve dynamic approver users based on enterprise role/relationship.
   */
  public static resolveApprovers(
    resolverType: ApproverResolverType,
    ticket: Ticket,
    role?: BankRole
  ): BankUser[] {
    const requester = db.data.users.find((u) => u.id === (ticket.requesterId || ticket.reporterId));
    const dept = db.data.departments.find((d) => d.id === ticket.departmentId);

    switch (resolverType) {
      case 'REQUESTER_MANAGER': {
        const manager = requester?.managerId ? db.data.users.find((u) => u.id === requester.managerId) : undefined;
        if (manager && manager.isActive) return [manager];
        const deptId = ticket.departmentId || requester?.departmentId || db.data.departments[0]?.id;
        const resolvedDept = db.data.departments.find((d) => d.id === deptId);
        if (resolvedDept?.managerId) {
          const deptMgr = db.data.users.find((u) => u.id === resolvedDept.managerId && u.isActive);
          if (deptMgr) return [deptMgr];
        }
        return [];
      }
      case 'DEPARTMENT_HEAD': {
        if (dept?.managerId) {
          const deptMgr = db.data.users.find((u) => u.id === dept.managerId && u.isActive);
          if (deptMgr) return [deptMgr];
        }
        return [];
      }
      case 'SERVICE_OWNER': {
        if (ticket.applicationId) {
          const app = db.data.applications.find((a) => a.id === ticket.applicationId);
          if (app?.ownerId) {
            const owner = db.data.users.find((u) => u.id === app.ownerId && u.isActive);
            if (owner) return [owner];
          }
        }
        return db.data.users.filter((u) => u.roles.includes('INFOSEC_MANAGER') && u.isActive);
      }
      case 'ASSET_OWNER': {
        if (ticket.assetId) {
          const asset = db.data.assets.find((a) => a.id === ticket.assetId);
          if (asset?.ownerId) {
            const owner = db.data.users.find((u) => u.id === asset.ownerId && u.isActive);
            if (owner) return [owner];
          }
        }
        return db.data.users.filter((u) => u.roles.includes('INFOSEC_MANAGER') && u.isActive);
      }
      case 'CAB_BOARD': {
        return db.data.users.filter(
          (u) => (u.roles.includes('CISO') || u.roles.includes('PLATFORM_ADMIN') || u.roles.includes('INFOSEC_MANAGER')) && u.isActive
        );
      }
      case 'ROLE': {
        if (role) {
          return db.data.users.filter((u) => u.roles.includes(role) && u.isActive);
        }
        return db.data.users.filter((u) => u.roles.includes('INFOSEC_MANAGER') && u.isActive);
      }
      default:
        return db.data.users.filter((u) => u.roles.includes('INFOSEC_MANAGER') && u.isActive);
    }
  }

  public static getPendingApprovalsForUser(user: BankUser): { chain: TicketApprovalChain; step: ApprovalStep }[] {
    const results: { chain: TicketApprovalChain; step: ApprovalStep }[] = [];

    for (const chain of db.data.approvals) {
      if (chain.status !== 'PENDING') continue;

      const pendingSteps = (chain.mode || 'SEQUENTIAL') === 'SEQUENTIAL'
        ? chain.steps.filter((s) => s.status === 'PENDING').slice(0, 1)
        : chain.steps.filter((s) => s.status === 'PENDING');

      for (const currentStep of pendingSteps) {
        const isAssigned = currentStep.assignedApproverId === user.id;
        const isCandidate = currentStep.candidateUserIds?.includes(user.id);
        const hasRole = currentStep.requiredRole && user.roles.includes(currentStep.requiredRole);
        const isSuper = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');
        if (isAssigned || isCandidate || hasRole || isSuper) {
          results.push({ chain, step: currentStep });
        }
      }
    }

    return results;
  }

  public static submitDecision(params: {
    chainId: string;
    stepId: string;
    decision: ApprovalDecision;
    user: BankUser;
    comments?: string;
    delegatedToUserId?: string;
  }): { success: boolean; chain?: TicketApprovalChain; error?: string } {
    const { chainId, stepId, decision, user, comments, delegatedToUserId } = params;

    const chain = db.data.approvals.find((c) => c.id === chainId);
    if (!chain) return { success: false, error: 'Approval chain not found.' };

    const step = chain.steps.find((s) => s.id === stepId);
    if (!step) return { success: false, error: 'Approval step not found.' };

    if (step.status !== 'PENDING') {
      return { success: false, error: 'This approval step has already been processed.' };
    }

    if (chain.preventSelfApproval && chain.requesterId === user.id) {
      return { success: false, error: 'Separation-of-duties policy prevents the requester from approving their own request.' };
    }
    if (decision === 'REJECTED' && chain.commentsMandatoryOnReject && !comments?.trim()) {
      return { success: false, error: 'A rejection comment is required by policy.' };
    }
    if (decision === 'DELEGATED' && !chain.allowDelegation) {
      return { success: false, error: 'Delegation is not allowed by this approval policy.' };
    }

    if ((chain.mode || 'SEQUENTIAL') === 'SEQUENTIAL') {
      const currentStep = chain.steps.find((candidate) => candidate.status === 'PENDING');
      if (currentStep?.id !== step.id) {
        return { success: false, error: 'Approval stages must be completed in sequence.' };
      }
    }

    // Role check
    const isAssigned = step.assignedApproverId === user.id;
    const isCandidate = step.candidateUserIds?.includes(user.id);
    const hasRole = step.requiredRole && user.roles.includes(step.requiredRole);
    const isSuper = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');

    if (!isAssigned && !isCandidate && !hasRole && !isSuper) {
      return { success: false, error: 'User is not authorized to sign this approval step.' };
    }

    const timestamp = new Date().toISOString();
    
    // Generate immutable cryptographic signature hash
    const signaturePayload = `${chain.ticketId}:${step.id}:${user.id}:${decision}:${timestamp}:${comments || ''}`;
    const signatureHash = 'sha256-' + crypto.createHash('sha256').update(signaturePayload).digest('hex');

    step.status = decision;
    step.decisionByUserId = user.id;
    step.decisionByUserName = user.fullName;
    step.decisionAt = timestamp;
    step.comments = comments;
    step.immutableSignatureHash = signatureHash;

    if (decision === 'DELEGATED' && delegatedToUserId) {
      step.delegatedToUserId = delegatedToUserId;
      step.delegationHistory ||= [];
      step.delegationHistory.push({
        fromUserId: user.id,
        toUserId: delegatedToUserId,
        delegatedAt: timestamp,
        reason: comments,
      });

      const delegatedUser = db.data.users.find((u) => u.id === delegatedToUserId);
      if (delegatedUser) {
        step.assignedApproverId = delegatedUser.id;
        step.assignedApproverName = delegatedUser.fullName;
        step.status = 'PENDING';
      }
    }

    // Evaluate overall chain status based on quorum mode
    const approvedCount = chain.steps.filter((candidate) => candidate.status === 'APPROVED').length;
    const rejectedCount = chain.steps.filter((candidate) => candidate.status === 'REJECTED').length;
    const pendingCount = chain.steps.filter((candidate) => candidate.status === 'PENDING').length;
    const totalCount = chain.steps.length;
    const mode = chain.mode || 'SEQUENTIAL';

    let isApproved = false;
    let isRejected = false;

    if (mode === 'ANY_ONE') {
      isApproved = approvedCount >= 1;
      isRejected = pendingCount === 0 && approvedCount === 0;
    } else if (mode === 'N_OF_M' && chain.quorumCount) {
      isApproved = approvedCount >= chain.quorumCount;
      isRejected = (totalCount - rejectedCount) < chain.quorumCount;
    } else if (mode === 'PERCENTAGE_QUORUM' && chain.quorumPercentage) {
      const required = Math.ceil((chain.quorumPercentage / 100) * totalCount);
      isApproved = approvedCount >= required;
      isRejected = (totalCount - rejectedCount) < required;
    } else if (mode === 'MAJORITY') {
      const majority = Math.floor(totalCount / 2) + 1;
      isApproved = approvedCount >= majority;
      isRejected = rejectedCount >= majority || (approvedCount + pendingCount < majority);
    } else {
      // ALL / SEQUENTIAL / PARALLEL
      isApproved = approvedCount === totalCount;
      isRejected = rejectedCount >= 1;
    }

    if (isApproved || isRejected) {
      chain.status = isApproved ? 'APPROVED' : 'REJECTED';
      chain.completedAt = timestamp;

      const ticket = db.data.tickets.find((t) => t.id === chain.ticketId);
      if (ticket) {
        if (isApproved) {
          AutomationService.triggerEvent('APPROVAL_COMPLETED', ticket, user);
        } else {
          AutomationService.triggerEvent('APPROVAL_REJECTED', ticket, user);
        }
      }
    }

    // Audit event
    const ticket = db.data.tickets.find((t) => t.id === chain.ticketId);
    AuditService.log({
      actor: user,
      action: 'APPROVAL_DECISION',
      entityType: 'APPROVAL',
      entityId: chain.id,
      entityKey: ticket?.key,
      metadata: {
        stepNumber: step.stepNumber,
        stepName: step.name,
        decision,
        comments,
        signatureHash,
        chainStatus: chain.status,
      },
    });

    db.persist();
    return { success: true, chain };
  }

  /**
   * Reset approval chain to PENDING when protected material fields are modified.
   */
  public static triggerReapproval(ticket: Ticket, modifiedFields: string[], actor: BankUser): void {
    const chain = db.data.approvals.find((c) => c.ticketId === ticket.id);
    if (!chain || chain.status === 'REJECTED') return;

    const protectedFields = new Set(['technicalSeverity', 'confidentiality', 'businessImpact', 'affectedAssetIds', 'riskScore']);
    const hits = modifiedFields.filter((f) => protectedFields.has(f));

    if (hits.length > 0 && chain.status === 'APPROVED') {
      chain.status = 'PENDING';
      chain.completedAt = undefined;
      for (const step of chain.steps) {
        if (step.requiresReapprovalOnChange !== false) {
          step.status = 'PENDING';
          step.decisionAt = undefined;
          step.decisionByUserId = undefined;
          step.decisionByUserName = undefined;
          step.comments = `[Reapproval required due to changes in ${hits.join(', ')}]`;
        }
      }
      AuditService.log({
        actor,
        action: 'TICKET_UPDATED',
        entityType: 'APPROVAL',
        entityId: chain.id,
        entityKey: ticket.key,
        metadata: {
          reapprovalReason: `Material change in ${hits.join(', ')}`,
          resetChainId: chain.id,
        },
      });
      db.persist();
    }
  }
}
