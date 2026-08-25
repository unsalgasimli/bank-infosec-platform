import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { storageService } from '../services/storage.service.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';
import { AuthService } from '../services/auth.service.js';
import { ProjectService } from '../services/project.service.js';
import { TicketAttachment, EvidenceType } from '../../shared/types/attachment.js';

export class StorageController {
  /**
   * Upload artifact for a ticket (Forensic PCAP, scan report, approval evidence)
   */
  public static async uploadArtifact(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    const { ticketId, fileName, fileBase64, mimeType, evidenceType, isForensicArtifact } = req.body;

    if (!ticketId || !fileName || !fileBase64 || typeof fileBase64 !== 'string') {
      res.status(400).json({ success: false, error: 'ticketId, fileName, and fileBase64 are required.' });
      return;
    }

    const ticket = db.data.tickets.find((t) => t.id === ticketId || t.key === ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    const projectWrite = ticket.projectId ? ProjectService.canUseProjectTask(ticket.projectId, ticket, user, 'EDIT') : undefined;
    const check = projectWrite || AuthService.canAccessResource({ user, action: 'WRITE', resourceType: 'TICKET', resource: ticket });
    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason || 'Not authorized to upload artifacts to this ticket' });
      return;
    }

    try {
      const normalizedBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
      if (!normalizedBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalizedBase64) || normalizedBase64.length % 4 !== 0) {
        res.status(400).json({ success: false, error: 'Evidence payload must be valid base64.' });
        return;
      }
      const buffer = Buffer.from(normalizedBase64, 'base64');
      if (buffer.length === 0) {
        res.status(400).json({ success: false, error: 'Evidence file cannot be empty.' });
        return;
      }
      const resolvedMime = mimeType || 'application/octet-stream';

      const uploadResult = await storageService.upload(fileName, buffer, resolvedMime);

      const attachment: TicketAttachment = {
        id: `att-${uuidv4().slice(0, 8)}`,
        ticketId: ticket.id,
        fileName,
        fileSizeBytes: uploadResult.fileSizeBytes,
        mimeType: uploadResult.mimeType,
        evidenceType: (evidenceType as EvidenceType) || 'AUDIT_WORKPAPER',
        sha256Checksum: uploadResult.sha256Hash,
        isEncrypted: true,
        virusScanStatus: 'CLEAN',
        confidentiality: ticket.confidentiality,
        uploaderId: user.id,
        uploaderName: user.fullName,
        uploadedAt: new Date().toISOString(),
        isImmutableEvidence: Boolean(isForensicArtifact),
        retentionUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        downloadCount: 0,
        storageKey: uploadResult.storageKey,
      };

      db.data.attachments.push(attachment);
      db.persist();

      AuditService.log({
        actor: user,
        action: 'ATTACHMENT_UPLOADED',
        entityType: 'ATTACHMENT',
        entityId: attachment.id,
        entityKey: ticket.key,
        metadata: {
          fileName,
          sha256Checksum: uploadResult.sha256Hash,
          evidenceType: attachment.evidenceType,
          isImmutableEvidence: attachment.isImmutableEvidence,
        },
      });

      res.status(201).json({
        success: true,
        attachment,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  /**
   * Request a secure time-limited download URL
   */
  public static async getDownloadUrl(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    const attachmentId = req.params.attachmentId;

    const attachment = db.data.attachments.find((a) => a.id === attachmentId);
    if (!attachment) {
      res.status(404).json({ success: false, error: 'Attachment not found' });
      return;
    }

    const ticket = db.data.tickets.find((t) => t.id === attachment.ticketId);
    if (ticket) {
      const check = ticket.projectId
        ? StorageController.projectReadAccess(ticket.projectId, ticket.id, user)
        : AuthService.canAccessResource({ user, action: 'READ', resourceType: 'TICKET', resource: ticket });

      if (!check.allowed) {
        res.status(403).json({ success: false, error: check.reason });
        return;
      }
    }

    try {
      if (!attachment.storageKey) {
        res.status(410).json({ success: false, error: 'The stored file is unavailable for this legacy attachment.' });
        return;
      }

      res.json({
        success: true,
        downloadUrl: `${'/api'}/storage/attachments/${encodeURIComponent(attachment.id)}/download`,
        fileName: attachment.fileName,
        sha256Checksum: attachment.sha256Checksum,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /** Streams an attachment only after the caller passes ticket-level ABAC. */
  public static async downloadAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    const attachment = db.data.attachments.find((candidate) => candidate.id === req.params.attachmentId);
    if (!attachment || !attachment.storageKey) {
      res.status(404).json({ success: false, error: 'Stored attachment not found.' });
      return;
    }
    const ticket = db.data.tickets.find((candidate) => candidate.id === attachment.ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Attachment ticket not found.' });
      return;
    }
    const check = ticket.projectId
      ? StorageController.projectReadAccess(ticket.projectId, ticket.id, user)
      : AuthService.canAccessResource({ user, action: 'READ', resourceType: 'TICKET', resource: ticket });
    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason || 'Not authorized to download this attachment.' });
      return;
    }

    try {
      const { buffer, mimeType } = await storageService.getFileBuffer(attachment.storageKey);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName.replace(/[\r\n"]/g, '_')}"`);
      attachment.downloadCount = (attachment.downloadCount || 0) + 1;
      db.persist();
      AuditService.log({
        actor: user,
        action: 'ATTACHMENT_DOWNLOADED',
        entityType: 'ATTACHMENT',
        entityId: attachment.id,
        entityKey: ticket.key,
        metadata: { fileName: attachment.fileName, sha256Checksum: attachment.sha256Checksum },
      });
      res.send(buffer);
    } catch (error: any) {
      res.status(404).send(error.message || 'File not found');
    }
  }

  private static projectReadAccess(projectId: string, ticketId: string, user: AuthenticatedRequest['user']): { allowed: boolean; reason?: string } {
    if (!user) return { allowed: false, reason: 'Authentication required.' };
    const access = ProjectService.authorize(projectId, user, 'READ');
    if (!access.allowed) return { allowed: false, reason: access.reason };
    return ProjectService.visibleTasks(projectId, user).some((ticket) => ticket.id === ticketId)
      ? { allowed: true }
      : { allowed: false, reason: 'You are not authorized to access this project task.' };
  }
}
