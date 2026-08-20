import React, { useState } from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { Lock, ShieldAlert, FileText, UserX, Search, Filter, HardDrive, Cloud, Mail, Bot, Plus, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface DLPViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const DLPView: React.FC<DLPViewProps> = ({ tickets, onSelectTicket }) => {
  const { currentUser, fetchWithAuth } = useAuth();
  const [vectorFilter, setVectorFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [caseTitle, setCaseTitle] = useState('');
  const [employeeAccount, setEmployeeAccount] = useState('');
  const [vector, setVector] = useState('USB_DEVICE');
  const [dataClass, setDataClass] = useState('PCI_DSS_PAN');
  const [evidenceNotes, setEvidenceNotes] = useState('');

  const dlpTickets = tickets.filter((t) => t.category === 'DLP_ALERT' || t.projectCode === 'DLP');

  const canViewDLP = currentUser?.roles.some((r) =>
    ['CISO', 'INFOSEC_ADMIN', 'INFOSEC_MANAGER', 'DLP_ANALYST'].includes(r)
  );

  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseTitle) return;

    try {
      const res = await fetchWithAuth('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectCode: 'DLP',
          category: 'DLP_ALERT',
          securityDomain: 'DLP',
          title: `[DLP-${vector}] ${caseTitle}`,
          description: `Employee Target: ${employeeAccount || 'sAMAccount: unknown'}\nData Classification: ${dataClass}\nEvidence & Findings: ${evidenceNotes}`,
          technicalSeverity: 'HIGH',
          businessPriority: 'P2_HIGH',
          confidentiality: 'HIGHLY_RESTRICTED_HR_LEGAL',
          tags: ['dlp-forensics', vector.toLowerCase(), dataClass.toLowerCase()],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsCreateModalOpen(false);
        setCaseTitle('');
        setEvidenceNotes('');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-[#EBECF0] text-[#C0B6F2] border border-[#DFE1E6]">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
              Data Loss Prevention (DLP) & Insider Threat Forensics
            </h1>
            <p className="text-xs text-[#5E6C84] mt-0.5">
              Restricted investigation of customer PII leakage, unapproved cloud uploads, SWIFT data movements, and Shadow AI exfiltration.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Badge type="CONFIDENTIALITY" value="HIGHLY_RESTRICTED_HR_LEGAL" />
          {canViewDLP && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="jira-btn-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create DLP Case</span>
            </button>
          )}
        </div>
      </div>

      {!canViewDLP ? (
        <div className="p-12 text-center bg-[#FFFFFF] border border-[#FFBDAD] rounded-md space-y-4 max-w-xl mx-auto my-12 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[#FFEBE6] border border-[#FFBDAD] flex items-center justify-center text-[#DE350B] mx-auto">
            <UserX className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#172B4D] uppercase tracking-wider">Access Restricted by ABAC Policy</h3>
            <p className="text-xs text-[#5E6C84] leading-relaxed">
              Your active profile (<strong>{currentUser?.fullName}</strong> / {currentUser?.roles[0]}) lacks the mandatory <strong>DLP_ANALYST</strong> or <strong>CISO</strong> clearance level required to view confidential employee data exfiltration cases.
            </p>
          </div>

          <p className="text-xs text-[#5E6C84]">
            Giriş yalnız öz Active Directory hesabınızla mümkündür. Lazımi rolu bank administratorundan tələb edin.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Vector Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DFE1E6] pb-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A869A] mr-1">Vector:</span>
              {[
                { id: 'ALL', label: 'All Vectors' },
                { id: 'USB', label: 'USB Devices' },
                { id: 'CLOUD', label: 'Cloud Storage' },
                { id: 'EMAIL', label: 'Email Outbound' },
                { id: 'SHADOW_AI', label: 'Shadow AI / LLM' },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVectorFilter(v.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                    vectorFilter === v.id
                      ? 'bg-[#0052CC] text-white font-semibold shadow-sm'
                      : 'bg-[#FFFFFF] text-[#5E6C84] hover:text-[#172B4D] border border-[#DFE1E6]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#5E6C84] absolute left-2.5 top-2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search DLP tickets & users..."
                className="jira-input pl-8"
              />
            </div>
          </div>

          {/* Cases List */}
          <div className="space-y-3">
            {dlpTickets.length === 0 ? (
              <div className="py-16 text-center text-[#5E6C84] text-xs italic bg-[#FFFFFF] rounded-md border border-[#DFE1E6]">
                No DLP forensic investigations found.
              </div>
            ) : (
              dlpTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onSelectTicket(t)}
                  className="p-4 bg-[#FFFFFF] border border-[#DFE1E6] hover:border-[#0052CC] rounded-md cursor-pointer transition-colors space-y-2.5 shadow-sm group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge type="PROJECT" value={t.projectCode} />
                      <span className="font-mono font-bold text-[#172B4D] text-xs group-hover:text-[#0052CC] transition-colors">
                        {t.key}
                      </span>
                      <span className="jira-lozenge jira-lozenge-inprogress text-[10px]">
                        {t.statusName}
                      </span>
                      <Badge type="CONFIDENTIALITY" value={t.confidentiality} size="sm" />
                    </div>
                    <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                  </div>

                  <h3 className="text-xs font-semibold text-[#172B4D] group-hover:text-[#0052CC] leading-snug">
                    {t.title}
                  </h3>
                  <p className="text-[11px] text-[#5E6C84] line-clamp-2 leading-relaxed">{t.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Create DLP Case Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#0052CC]" />
                <h3 className="text-sm font-bold text-[#172B4D]">Create Confidential DLP Investigation</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-[#5E6C84] hover:text-[#172B4D]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCase} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#5E6C84] mb-1">Incident Summary:</label>
                <input
                  type="text"
                  value={caseTitle}
                  onChange={(e) => setCaseTitle(e.target.value)}
                  placeholder="e.g. Unapproved Customer Data Upload to Personal WeTransfer"
                  required
                  className="jira-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#5E6C84] mb-1">Suspect Employee (sAMAccount):</label>
                  <input
                    type="text"
                    value={employeeAccount}
                    onChange={(e) => setEmployeeAccount(e.target.value)}
                    placeholder="APEXBANK\e.mammadov"
                    className="jira-input font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#5E6C84] mb-1">Exfiltration Vector:</label>
                  <select
                    value={vector}
                    onChange={(e) => setVector(e.target.value)}
                    className="jira-input"
                  >
                    <option value="USB_DEVICE">USB Mass Storage Device</option>
                    <option value="CLOUD_STORAGE">Cloud File Share (Google Drive / Dropbox)</option>
                    <option value="EMAIL_EXFIL">Corporate Email Attachment</option>
                    <option value="SHADOW_AI">Shadow AI / Public LLM Prompt</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Data Classification Breached:</label>
                <select
                  value={dataClass}
                  onChange={(e) => setDataClass(e.target.value)}
                  className="jira-input"
                >
                  <option value="PCI_DSS_PAN">PCI-DSS (Credit / Debit Cardholder PAN)</option>
                  <option value="CUSTOMER_PII">Customer Banking PII & FIN Codes</option>
                  <option value="SWIFT_SECRET">SWIFT Gateway Wire Transfer Records</option>
                  <option value="CORE_BANK_SOURCE">Core Banking Switch Source Code</option>
                </select>
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Forensic Evidence & Log Snippet:</label>
                <textarea
                  value={evidenceNotes}
                  onChange={(e) => setEvidenceNotes(e.target.value)}
                  placeholder="Symantec DLP Agent Rule Match: PCI-DSS Regex found 420 occurrences in file customers_export.csv on host APEX-WS-1049..."
                  rows={3}
                  className="jira-input font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE1E6]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="jira-btn-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="jira-btn-primary"
                >
                  Register Forensic Case
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

