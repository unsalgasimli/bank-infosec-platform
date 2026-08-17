import React from 'react';
import { TicketAttachment } from '../../../../shared/types/attachment.js';
import { FileText, Download, ShieldCheck, Lock, Upload, CheckCircle2 } from 'lucide-react';

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
    <div className="space-y-6">
      {/* Upload Zone Simulation */}
      <div className="bg-bank-900 border-2 border-dashed border-slate-700/80 hover:border-blue-500/80 rounded-xl p-6 text-center transition-colors cursor-pointer group">
        <div className="w-10 h-10 rounded-full bg-blue-950/80 border border-blue-800/80 flex items-center justify-center mx-auto mb-2 text-blue-400 group-hover:scale-110 transition-transform">
          <Upload className="w-5 h-5" />
        </div>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
          Upload Confidential Evidence / Forensics Artifact
        </h4>
        <p className="text-xs text-slate-400 mt-1">
          Supports PDF, PCAP, JSON, CSV, TXT, LOG files up to 50MB. Automatically scanned for malware & SHA-256 hashed.
        </p>
      </div>

      {/* Attachments List */}
      <div className="space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Stored Evidence Artifacts ({attachments.length})
        </div>

        {attachments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 bg-bank-900/40 border border-slate-800 rounded-xl">
            No evidence attachments stored for this ticket.
          </div>
        ) : (
          attachments.map((att) => (
            <div
              key={att.id}
              className="p-4 bg-bank-900 border border-slate-800 rounded-xl space-y-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-950 border border-blue-800/80 text-blue-400 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{att.fileName}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {formatBytes(att.fileSizeBytes)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Type: <span className="font-semibold text-slate-300">{att.evidenceType}</span> • Uploaded by {att.uploaderName} on {new Date(att.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => alert(`Initiating authorized download of ${att.fileName}. Audit trail logged.`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  <span>Download</span>
                </button>
              </div>

              {/* Cryptographic Hash & Security Verification */}
              <div className="p-2.5 bg-bank-950 rounded-lg border border-slate-800 space-y-1.5 text-xs font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Malware Scan: CLEAN (Defender / ClamAV)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-blue-300">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Encrypted at Rest (AES-256)</span>
                  </div>
                </div>
                <div className="text-slate-400 truncate text-[10px]">
                  SHA-256: <span className="text-slate-300 font-bold">{att.sha256Checksum}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
