import crypto from 'crypto';
import { TicketApprovalChain, ApprovalStep, ApprovalDecision } from '../../shared/types/approval.js';
import { BankUser } from '../../shared/types/auth.js';
import { db } from '../db/database.js';
import { AuditService } from './audit.service.js';

export class ApprovalService {
  public static getApprovalChainForTicket(ticketId: string): TicketApprovalChain | undefined {
    return db.data.approvals.find((a) => a.ticketId === ticketId);
  }

  public static getPendingApprovalsForUser(user: BankUser): { chain: TicketApprovalChain; step: ApprovalStep }[] {
    const results: { chain: TicketApprovalChain; step: ApprovalStep }[] = [];

    for (const chain of db.data.approvals) {
      if (chain.status !== 'PENDING') continue;

      // In sequential chain, find the first pending step
      const currentStep = chain.steps.find((s) => s.status === 'PENDING');
      if (!currentStep) continue;

      // Check if user is assigned or has required role
      const isAssigned = currentStep.assignedApproverId === user.id;
      const hasRole = currentStep.requiredRole && user.roles.includes(currentStep.requiredRole);
      const isSuper = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');

      if (isAssigned || hasRole || isSuper) {
        results.push({ chain, step: currentStep });
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

    // Role check
    const isAssigned = step.assignedApproverId === user.id;
    const hasRole = step.requiredRole && user.roles.includes(step.requiredRole);
    const isSuper = user.roles.includes('PLATFORM_ADMIN') || user.roles.includes('CISO');

    if (!isAssigned && !hasRole && !isSuper) {
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
      const delegatedUser = db.data.users.find((u) => u.id === delegatedToUserId);
      if (delegatedUser) {
        step.assignedApproverId = delegatedUser.id;
        step.assignedApproverName = delegatedUser.fullName;
        step.status = 'PENDING';
      }
    }

    // Evaluate overall chain status
    const anyRejected = chain.steps.some((s) => s.status === 'REJECTED');
    const allApproved = chain.steps.every((s) => s.status === 'APPROVED');

    if (anyRejected) {
      chain.status = 'REJECTED';
      chain.completedAt = timestamp;
    } else if (allApproved) {
      chain.status = 'APPROVED';
      chain.completedAt = timestamp;
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
      },
    });

    db.persist();
    return { success: true, chain };
  }
}
