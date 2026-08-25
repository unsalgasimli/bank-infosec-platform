import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Lock,
  MessageSquare,
  Sparkles,
  Download,
  Plus,
  Shield,
  FileText,
  User,
  Share2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { ProofingDocument, ProofingAnnotation } from '../../../shared/types/proofing.js';

interface DocumentProofingModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle?: string;
}

export const DocumentProofingModal: React.FC<DocumentProofingModalProps> = ({
  isOpen,
  onClose,
  documentTitle = 'SWIFT Alliance Gateway Perimeter DC1 Topology Diagram.pdf',
}) => {
  const { fetchWithAuth, currentUser } = useAuth();
  const [documentData, setDocumentData] = useState<ProofingDocument | null>(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadDocument = async () => {
    try {
      const res = await fetchWithAuth('/api/proofing');
      const data = await res.json();
      if (data.success && data.documents && data.documents.length > 0) {
        setDocumentData(data.documents[0]);
      }
    } catch (err) {
      console.error('Failed to load proofing documents', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDocument();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddAnnotation = async () => {
    if (!newComment.trim() || !documentData) return;
    try {
      setIsSubmitting(true);
      const res = await fetchWithAuth(`/api/proofing/${documentData.id}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: 40 + Math.random() * 30,
          y: 35 + Math.random() * 30,
          comment: newComment.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDocumentData(data.document);
        setNewComment('');
      }
    } catch (err) {
      console.error('Failed to add annotation', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOff = async () => {
    if (!documentData) return;
    try {
      const res = await fetchWithAuth(`/api/proofing/${documentData.id}/sign-off`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setDocumentData(data.document);
      }
    } catch (err) {
      console.error('Failed to sign off document', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-semantic-primary/60 backdrop-blur-sm flex items-center justify-center z-dsOverlay p-4">
      <div className="w-full max-w-5xl h-[85vh] bg-semantic-panel rounded-xl border border-semantic-surface-alt shadow-wrike-lg flex flex-col overflow-hidden select-none">
        {/* Proofing Header */}
        <div className="bg-semantic-panel border-b border-semantic-surface-alt px-5 py-3 flex items-center justify-between shrink-0 shadow-wrike-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-semantic-success-surface text-semantic-brand border border-semantic-success-border flex items-center justify-center font-bold text-xs">
              <FileText className="w-4 h-4 text-semantic-brand" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-semantic-primary">{documentData?.title || documentTitle}</h3>
                <span className="px-2 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success text-caption font-bold border border-semantic-success-border">
                  Wrike Proofing v{documentData?.version || '2.4'}
                </span>
              </div>
              <span className="text-label text-semantic-jira-muted-alt">
                Collaborate, markup coordinates, and grant cryptographic CISO approval sign-offs.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {documentData?.isSignedOff ? (
              <span className="px-3 py-1.5 rounded-lg bg-semantic-success-surface text-semantic-success border border-semantic-success-border font-bold text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>CISO Approved ({documentData.signatureHash?.substring(0, 10)}...)</span>
              </span>
            ) : (
              <button
                onClick={handleSignOff}
                className="wrike-btn-primary text-xs py-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Dual-Control Sign Off</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-semantic-subtle text-semantic-jira-muted-alt hover:text-semantic-primary font-bold ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Proofing Workspace: Left Canvas + Right Annotations Stream */}
        <div className="flex-1 flex overflow-hidden">
          {/* Visual Document Canvas */}
          <div className="flex-1 bg-semantic-page-muted p-6 flex items-center justify-center overflow-auto relative">
            <div className="w-[640px] h-[400px] bg-semantic-panel border-2 border-semantic-surface-alt rounded-xl shadow-wrike-md p-6 relative flex flex-col justify-between">
              {/* Architecture Diagram Visual */}
              <div className="flex items-center justify-between border-b border-semantic-surface-alt pb-3">
                <div className="flex items-center gap-2 font-bold text-xs text-semantic-primary">
                  <Shield className="w-4 h-4 text-semantic-brand" />
                  <span>Apex Bank Tier-1 Security Perimeter Architecture</span>
                </div>
                <span className="text-caption font-mono text-semantic-jira-muted-alt">
                  Classification: {documentData?.classification || 'RESTRICTED'}
                </span>
              </div>

              {/* Topology Blocks */}
              <div className="grid grid-cols-3 gap-4 my-auto text-center text-xs">
                <div className="p-3 bg-semantic-subtle border border-semantic-surface-alt rounded-lg">
                  <div className="font-bold text-semantic-primary">External Internet</div>
                  <div className="text-caption text-semantic-jira-muted-alt mt-0.5">DMZ / WAN</div>
                </div>
                <div className="p-3 bg-semantic-success-surface border border-semantic-success-border rounded-lg">
                  <div className="font-bold text-semantic-success">Palo Alto Perimeter FW</div>
                  <div className="text-caption text-semantic-success mt-0.5">10.100.1.1</div>
                </div>
                <div className="p-3 bg-semantic-info-surface border border-semantic-info-border rounded-lg">
                  <div className="font-bold text-semantic-info">SWIFT Alliance Gateway</div>
                  <div className="text-caption text-semantic-info mt-0.5">10.100.20.14</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-caption font-mono text-semantic-jira-muted-alt">
                <span>Document ID: ARCH-2026-088</span>
                {documentData?.signedAt && (
                  <span className="text-semantic-success">Signed: {new Date(documentData.signedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* Coordinate Pins */}
              {(documentData?.annotations || []).map((ann, idx) => (
                <div
                  key={ann.id}
                  style={{ top: `${ann.y}%`, left: `${ann.x}%` }}
                  className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-semantic-brand text-white font-bold text-xs flex items-center justify-center shadow-wrike-lg border-2 border-white cursor-pointer hover:scale-110 transition-transform"
                  title={`${ann.authorName}: ${ann.comment}`}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          </div>

          {/* Right Threaded Annotations Pane */}
          <div className="w-80 bg-semantic-panel border-l border-semantic-surface-alt p-4 flex flex-col justify-between shrink-0 overflow-y-auto custom-scrollbar">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-semantic-surface-alt pb-2">
                <span className="text-xs font-bold text-semantic-primary flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-semantic-brand" />
                  <span>Feedback Pins ({documentData?.annotations?.length || 0})</span>
                </span>
                <span className="text-caption text-semantic-success font-mono font-bold">Live DB Sync</span>
              </div>

              {/* Comments Stream */}
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {(documentData?.annotations || []).map((ann, idx) => (
                  <div key={ann.id} className="p-2.5 bg-semantic-subtle rounded-lg border border-semantic-surface-alt space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="w-4 h-4 rounded-full bg-semantic-brand text-white font-bold text-micro flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-caption font-bold text-semantic-primary">{ann.authorName}</span>
                    </div>
                    <p className="text-xs text-semantic-brand-ink leading-relaxed pt-1">
                      {ann.comment}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Add New Markup Comment */}
            <div className="pt-3 border-t border-semantic-surface-alt space-y-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add pin annotation to database..."
                className="wrike-input text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddAnnotation();
                }}
              />
              <button
                onClick={handleAddAnnotation}
                disabled={!newComment.trim() || isSubmitting}
                className="w-full wrike-btn-primary text-xs py-1.5 justify-center disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Saving Pin...' : 'Pin Markup Comment'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
