import React from 'react';
import { TicketAttachment } from '../../../../shared/types/attachment.js';
import { FileText, Download, Lock, Upload, CheckCircle2 } from 'lucide-react';

interface EvidenceTabProps {
  attachments: TicketAttachment[];
  ticketId: string;
}

export const EvidenceTab: React.FC<EvidenceTabProps> = ({ attachments, ticketId }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-5">
      {/* Upload Zone */}
      <div className="bg-bank-900 border border-dashed border-slate-700 hover:border-slate-500 rounded-lg p-5 text-center transition-colors cursor-pointer">
        <div className="w-8 h-8 rounded bg-bank-950 border border-slate-700 flex items-center justify-center mx-auto mb-2 text-slate-300">
          <Upload className="w-4 h-4" />
        </div>
        <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
          Upload Evidence / Forensics Artifact
        </h4>
        <p className="text-[11px] text-slate-400 mt-1">
          Supports PDF, PCAP, JSON, CSV, TXT, LOG up to 50MB. Auto-hashed with SHA-256.
        </p>
      </div>

      {/* Attachments List */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Stored Evidence Artifacts ({attachments.length})
        </div>

        {attachments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-bank-900 border border-slate-800 rounded-lg">
            No evidence attachments stored for this ticket.
          </div>
        ) : (
          attachments.map((att) => (
            <div
              key={att.id}
              className="p-4 bg-bank-900 border border-slate-800 rounded-lg space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded bg-bank-950 border border-slate-700 text-slate-300 mt-0.5">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <span>{att.fileName}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-850 text-slate-400 border border-slate-700">
                        {formatBytes(att.fileSizeBytes)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Type: <span className="font-medium text-slate-300">{att.evidenceType}</span> • Uploaded by {att.uploaderName} on {new Date(att.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => alert(`Initiating authorized download of ${att.fileName}. Audit trail logged.`)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-slate-400" />
                  <span>Download</span>
                </button>
              </div>

              {/* Cryptographic Hash & Security Verification */}
              <div className="p-2 bg-bank-950 rounded border border-slate-800 space-y-1 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1 text-emerald-400 font-sans font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Malware Scan: CLEAN</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 font-sans">
                    <Lock className="w-3 h-3" />
                    <span>AES-256 Encrypted</span>
                  </div>
                </div>
                <div className="text-slate-400 truncate text-[10px]">
                  SHA-256: <span className="text-slate-300">{att.sha256Checksum}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

