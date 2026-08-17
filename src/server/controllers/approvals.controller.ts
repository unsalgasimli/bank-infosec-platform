import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { ApprovalService } from '../services/approval.service.js';
import { DedupService } from '../services/dedup.service.js';
import { db } from '../db/database.js';

export class ApprovalsController {
  public static listPending(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const pending = ApprovalService.getPendingApprovalsForUser(user);
    res.json({ success: true, pending });
  }

  public static submitDecision(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const chainId = req.params.chainId as string;
    const stepId = req.params.stepId as string;
    const { decision, comments, delegatedToUserId } = req.body;

    const result = ApprovalService.submitDecision({
      chainId,
      stepId,
      decision,
      user,
      comments,
      delegatedToUserId,
    });


    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  }
}

export class FindingsController {
  public static ingest(req: AuthenticatedRequest, res: Response): void {
    const user = req.user!;
    const payload = req.body;

    const result = DedupService.ingestFinding(payload, user);
    res.status(result.action === 'CREATED' ? 201 : 200).json({
      success: true,
      action: result.action,
      ticket: result.ticket,
    });
  }
}
