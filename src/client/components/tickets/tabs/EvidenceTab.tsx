import React, { useRef, useState } from 'react';
import { TicketAttachment, EvidenceType } from '../../../../shared/types/attachment.js';
import { FileText, Download, Lock, Upload, CheckCircle2, AlertTriangle, Loader2, Copy, Check, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.js';

interface EvidenceTabProps {
  attachments: TicketAttachment[];
  ticketId: string;
  onRefresh: () => Promise<void> | void;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const evidenceTypes: EvidenceType[] = [
  'PEN_TEST_REPORT', 'SAST_SCAN_LOG', 'DAST_REPORT', 'POC_SCRIPT', 'NETWORK_PCAP',
  'EDR_FORENSIC_DUMP', 'CONFIG_FILE', 'AUDIT_WORKPAPER', 'CHANGE_APPROVAL', 'EXECUTIVE_SIGN_OFF',
];

const readable = (value: string) => value.replaceAll('_', ' ');

export const EvidenceTab: React.FC<EvidenceTabProps> = ({ attachments, ticketId, onRefresh }) => {
  const { fetchWithAuth } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('AUDIT_WORKPAPER');
  const [isImmutableEvidence, setIsImmutableEvidence] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${sizes[index]}`;
  };

  const handleCopyHash = (id: string, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHashId(id);
    setTimeout(() => setCopiedHashId(null), 2000);
  };

  const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The selected file could not be read.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const commaIndex = value.indexOf(',');
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };
    reader.readAsDataURL(file);
  });

  const uploadFile = async (file?: File) => {
    if (!file || isUploading) return;
    setError(null);
    if (file.size === 0) return setError('Empty files cannot be submitted as evidence.');
    if (file.size > MAX_UPLOAD_BYTES) return setError(`"${file.name}" is ${formatBytes(file.size)}. The maximum evidence size is 25 MB.`);

    setIsUploading(true);
    try {
      const fileBase64 = await readAsBase64(file);
      const response = await fetchWithAuth('/api/storage/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, fileName: file.name, fileBase64, mimeType: file.type || 'application/octet-stream', evidenceType, isForensicArtifact: isImmutableEvidence }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Evidence upload failed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await onRefresh();
    } catch (cause: any) {
      setError(cause.message || 'Evidence upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadAttachment = async (attachment: TicketAttachment) => {
    setError(null);
    setDownloadingId(attachment.id);
    try {
      const authorization = await fetchWithAuth(`/api/storage/attachments/${attachment.id}/url`);
      const authorizationData = await authorization.json();
      if (!authorization.ok || !authorizationData.success) throw new Error(authorizationData.error || 'Evidence download could not be authorized.');
      const response = await fetchWithAuth(authorizationData.downloadUrl);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Evidence download failed.');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = attachment.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      await onRefresh();
    } catch (cause: any) {
      setError(cause.message || 'Evidence download failed.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload Zone */}
      <section className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/30 p-6 shadow-xs transition-all hover:bg-blue-50/50">
        <input ref={fileInputRef} type="file" className="sr-only" onChange={(event) => uploadFile(event.target.files?.[0])} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="w-full text-center disabled:cursor-not-allowed disabled:opacity-60 group">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-semantic-jira-brand group-hover:scale-105 transition-transform shadow-xs">
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          </div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">{isUploading ? 'Uploading and hashing evidence…' : 'Upload Evidence or Forensic Artifact'}</h4>
          <p className="mt-1 text-label text-slate-500 max-w-md mx-auto">Supported formats: PDF, PCAP, JSON, CSV, TXT, LOG, image or ZIP up to 25 MB. Each upload is SHA-256 hashed and scanned for malware.</p>
        </button>
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-blue-200/60 pt-4 md:grid-cols-[1fr_auto] items-center">
          <label className="text-label font-bold text-slate-700">
            Evidence Classification
            <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceType)} disabled={isUploading} className="jira-input mt-1.5 w-full text-xs bg-white">
              {evidenceTypes.map((type) => <option key={type} value={type}>{readable(type)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer pt-4 md:pt-0">
            <input type="checkbox" checked={isImmutableEvidence} onChange={(event) => setIsImmutableEvidence(event.target.checked)} disabled={isUploading} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            <span>Mark as immutable forensic evidence</span>
          </label>
        </div>
      </section>

      {/* Evidence Items List */}
      <div className="space-y-3.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
          <span>Stored Evidence Artifacts ({attachments.length})</span>
        </div>
        {attachments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
            No evidence attachments are stored for this ticket yet.
          </div>
        ) : (
          attachments.map((attachment) => (
            <article key={attachment.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-slate-500 shadow-xs">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-900">
                      <span className="truncate max-w-sm">{attachment.fileName}</span>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-caption font-normal text-slate-600">
                        {formatBytes(attachment.fileSizeBytes)}
                      </span>
                      {attachment.isImmutableEvidence && (
                        <span className="rounded-full bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 text-caption font-bold">
                          Immutable
                        </span>
                      )}
                    </div>
                    <div className="text-label text-slate-500">
                      <strong className="text-slate-700">{readable(attachment.evidenceType)}</strong> · Uploaded by {attachment.uploaderName} on {new Date(attachment.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadAttachment(attachment)}
                  disabled={downloadingId === attachment.id}
                  className="jira-btn-secondary shrink-0 disabled:opacity-50"
                >
                  {downloadingId === attachment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5 text-slate-600" />}
                  <span>{downloadingId === attachment.id ? 'Preparing…' : 'Download'}</span>
                </button>
              </div>

              {/* Hash & Security info box */}
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-3 font-mono text-xs">
                <div className="flex items-center justify-between text-label flex-wrap gap-2">
                  <span className={`flex items-center gap-1.5 font-sans font-bold ${attachment.virusScanStatus === 'CLEAN' ? 'text-emerald-700' : attachment.virusScanStatus === 'QUARANTINED' ? 'text-rose-700' : 'text-amber-700'}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Malware Scan: {attachment.virusScanStatus}
                  </span>
                  {attachment.isEncrypted && (
                    <span className="flex items-center gap-1 font-sans text-slate-600 text-label">
                      <Lock className="h-3 w-3 text-slate-400" /> AES-256 Encrypted at Rest
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-caption text-slate-500 pt-1 border-t border-slate-200/60">
                  <span className="truncate">SHA-256: <span className="text-slate-800 font-bold">{attachment.sha256Checksum}</span></span>
                  <button
                    type="button"
                    onClick={() => handleCopyHash(attachment.id, attachment.sha256Checksum)}
                    className="text-slate-500 hover:text-slate-800 shrink-0 font-sans font-semibold flex items-center gap-1"
                  >
                    {copiedHashId === attachment.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedHashId === attachment.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

