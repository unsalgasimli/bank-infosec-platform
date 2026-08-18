import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { storageService, ALLOWED_MIME_TYPES } from '../services/storage.service.js';
import { db } from '../db/database.js';
import { AuditService } from '../services/audit.service.js';
import { AuthService } from '../services/auth.service.js';
import { TicketAttachment, EvidenceType } from '../../shared/types/attachment.js';

export class StorageController {
  /**
   * Upload artifact for a ticket (Forensic PCAP, scan report, approval evidence)
   */
  public static async uploadArtifact(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    const { ticketId, fileName, fileBase64, mimeType, evidenceType, isForensicArtifact } = req.body;

    if (!ticketId || !fileName || !fileBase64) {
      res.status(400).json({ success: false, error: 'ticketId, fileName, and fileBase64 are required.' });
      return;
    }

    const ticket = db.data.tickets.find((t) => t.id === ticketId || t.key === ticketId);
    if (!ticket) {
      res.status(404).json({ success: false, error: 'Ticket not found' });
      return;
    }

    // Check ABAC write access
    const check = AuthService.canAccessResource({
      user,
      action: 'WRITE',
      resourceType: 'TICKET',
      resource: ticket,
    });

    if (!check.allowed) {
      res.status(403).json({ success: false, error: check.reason || 'Not authorized to upload artifacts to this ticket' });
      return;
    }

    try {
      const buffer = Buffer.from(fileBase64, 'base64');
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
      const check = AuthService.canAccessResource({
        user,
        action: 'READ',
        resourceType: 'TICKET',
        resource: ticket,
      });

      if (!check.allowed) {
        res.status(403).json({ success: false, error: check.reason });
        return;
      }
    }

    try {
      const storageKey = `bank-artifacts/${attachment.id}-${attachment.fileName}`;
      const downloadUrl = await storageService.getDownloadUrl(storageKey);

      attachment.downloadCount = (attachment.downloadCount || 0) + 1;
      db.persist();

      AuditService.log({
        actor: user,
        action: 'ATTACHMENT_DOWNLOADED',
        entityType: 'ATTACHMENT',
        entityId: attachment.id,
        entityKey: ticket?.key,
        metadata: {
          fileName: attachment.fileName,
          sha256Checksum: attachment.sha256Checksum,
        },
      });

      res.json({
        success: true,
        downloadUrl,
        fileName: attachment.fileName,
        sha256Checksum: attachment.sha256Checksum,
        expiresInSeconds: 900,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * Direct download endpoint for local storage
   */
  public static async downloadDirect(req: AuthenticatedRequest, res: Response): Promise<void> {
    const storageKey = req.query.key as string;
    if (!storageKey) {
      res.status(400).send('Missing storage key parameter');
      return;
    }

    try {
      const { buffer, mimeType } = await storageService.getFileBuffer(storageKey);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${storageKey.split('-').slice(1).join('-') || 'artifact'}"`);
      res.send(buffer);
    } catch (error: any) {
      res.status(404).send(error.message || 'File not found');
    }
  }
}
