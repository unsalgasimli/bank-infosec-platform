import React, { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import { BankApplication, BankAsset } from '../../../shared/types/asset.js';
import { TicketProjectCode, TicketCategory, TechnicalSeverity, BusinessPriority, BusinessImpact, ConfidentialityTier, SecurityDomain } from '../../../shared/types/ticket.js';
import { Shield, Flame, Bug, CheckCircle2, Lock, FileCode, Server } from 'lucide-react';

interface TicketCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  applications: BankApplication[];
  assets: BankAsset[];
  onCreated: (ticket: any) => void;
}

export const TicketCreateModal: React.FC<TicketCreateModalProps> = ({
  isOpen,
  onClose,
  applications,
  assets,
  onCreated,
}) => {
  const { currentUser, allUsers, fetchWithAuth } = useAuth();

  const [projectCode, setProjectCode] = useState<TicketProjectCode>('APPSEC');
  const [category, setCategory] = useState<TicketCategory>('VULNERABILITY');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [technicalSeverity, setTechnicalSeverity] = useState<TechnicalSeverity>('HIGH');
  const [businessPriority, setBusinessPriority] = useState<BusinessPriority>('P2_HIGH');
  const [businessImpact, setBusinessImpact] = useState<BusinessImpact>('SIGNIFICANT');
  const [confidentiality, setConfidentiality] = useState<ConfidentialityTier>('CONFIDENTIAL_SECURITY_ONLY');
  const [applicationId, setApplicationId] = useState(applications[0]?.id || '');
  const [assetId, setAssetId] = useState(assets[0]?.id || '');
  const [assigneeId, setAssigneeId] = useState(allUsers[0]?.id || '');

  // Finding specifics
  const [cweId, setCweId] = useState('CWE-89');
  const [cveId, setCveId] = useState('');
  const [cvssScore, setCvssScore] = useState(8.5);
  const [endpoint, setEndpoint] = useState('');
  const [filePath, setFilePath] = useState('');
  const [proofOfConcept, setProofOfConcept] = useState('');

  // Incident specifics
  const [incidentType, setIncidentType] = useState<any>('PHISHING');
  const [iocIps, setIocIps] = useState('');
  const [containmentActions, setContainmentActions] = useState('');

  // Exception specifics
  const [controlId, setControlId] = useState('SEC-CTRL-CRYPTO-04');
  const [justification, setJustification] = useState('');
  const [compensatingControls, setCompensatingControls] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleProjectChange = (code: TicketProjectCode) => {
    setProjectCode(code);
    switch (code) {
      case 'SOC':
        setCategory('INCIDENT');
        break;
      case 'DLP':
        setCategory('DLP_ALERT');
        setConfidentiality('HIGHLY_RESTRICTED_HR_LEGAL');
        break;
      case 'GRC':
        setCategory('SECURITY_EXCEPTION');
        break;
      case 'AUDIT':
        setCategory('AUDIT_FINDING');
        break;
      case 'IAM':
        setCategory('IAM_REQUEST');
        break;
      case 'APPSEC':
      case 'VM':
      default:
        setCategory('VULNERABILITY');
        break;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);

    const payload: any = {
      projectCode,
      category,
      title,
      description,
      technicalSeverity,
      businessPriority,
      businessImpact,
      confidentiality,
      applicationId: applicationId || undefined,
      assetId: assetId || undefined,
      assigneeId: assigneeId || undefined,
      tags: [projectCode, category],
    };

    if (category === 'VULNERABILITY') {
      payload.findingDetails = {
        vulnerabilityTitle: title,
        cweId,
        cveId: cveId || undefined,
        cvssScore: Number(cvssScore),
        endpoint: endpoint || undefined,
        filePath: filePath || undefined,
        proofOfConcept: proofOfConcept || undefined,
        scannerSource: 'MANUAL',
      };
      payload.cvssScore = Number(cvssScore);
    } else if (category === 'INCIDENT' || category === 'DLP_ALERT') {
      payload.incidentDetails = {
        incidentType,
        detectionSource: 'SIEM_CORRELATION',
        iocs: {
          ipAddresses: iocIps ? iocIps.split(',').map((s) => s.trim()) : [],
        },
        containmentActions: containmentActions || undefined,
      };
    } else if (category === 'SECURITY_EXCEPTION') {
      payload.exceptionDetails = {
        requestedControlId: controlId,
        requestedControlName: 'Mandatory Cryptographic & Access Control Standard',
        businessJustification: justification,
        compensatingControls: compensatingControls,
        riskOwnerId: currentUser?.id,
        effectiveDate: new Date().toISOString().split('T')[0],
        expirationDate: new Date(Date.now() + 86400000 * 90).toISOString().split('T')[0],
        autoRenew: false,
        reviewFrequencyDays: 30,
      };
    }

    try {
      const res = await fetchWithAuth('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        onCreated(data.ticket);
        onClose();
      } else {
        alert(`Error creating ticket: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to create ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Banking Security Ticket / Case"
      subtitle="Contextual schema automatically dynamically configures for bank security operations."
      maxWidth="4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Project Selection Tabs */}
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Security Project & Domain
          </label>
          <div className="grid grid-cols-5 gap-2">
            {[
              { code: 'APPSEC', label: 'AppSec & Pentest', icon: FileCode },
              { code: 'SOC', label: 'SOC & Incidents', icon: Flame },
              { code: 'VM', label: 'Vulnerability Mgmt', icon: Bug },
              { code: 'GRC', label: 'GRC & Exceptions', icon: CheckCircle2 },
              { code: 'DLP', label: 'DLP & Insider', icon: Lock },
            ].map((proj) => {
              const Icon = proj.icon;
              const isSelected = projectCode === proj.code;
              return (
                <button
                  type="button"
                  key={proj.code}
                  onClick={() => handleProjectChange(proj.code as any)}
                  className={`p-2.5 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400 font-bold shadow-md'
                      : 'bg-bank-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[11px]">{proj.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title and Description */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Ticket Summary / Title (Mandatory)</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Unauthenticated BOLA parameter in Funds Transfer API"
              className="w-full bg-bank-950 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Comprehensive Description & Findings Context</label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide full technical context, reproduction steps, observed impacts, and error outputs..."
              className="w-full bg-bank-950 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Severity, Priority, Confidentiality Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-bank-950 p-3 rounded-lg border border-slate-800">
          <div>
            <label className="block text-slate-400 text-[11px] font-bold mb-1">Technical Severity</label>
            <select
              value={technicalSeverity}
              onChange={(e) => setTechnicalSeverity(e.target.value as any)}
              className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
              <option value="INFORMATIONAL">INFORMATIONAL</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] font-bold mb-1">Business Priority</label>
            <select
              value={businessPriority}
              onChange={(e) => setBusinessPriority(e.target.value as any)}
              className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
            >
              <option value="P1_URGENT">P1_URGENT</option>
              <option value="P2_HIGH">P2_HIGH</option>
              <option value="P3_MEDIUM">P3_MEDIUM</option>
              <option value="P4_LOW">P4_LOW</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] font-bold mb-1">Confidentiality Tier</label>
            <select
              value={confidentiality}
              onChange={(e) => setConfidentiality(e.target.value as any)}
              className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
            >
              <option value="INTERNAL">INTERNAL</option>
              <option value="RESTRICTED">RESTRICTED</option>
              <option value="CONFIDENTIAL_SECURITY_ONLY">CONFIDENTIAL_SECURITY_ONLY</option>
              <option value="HIGHLY_RESTRICTED_HR_LEGAL">HIGHLY_RESTRICTED_HR_LEGAL</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] font-bold mb-1">Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.roles[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Affected Application & Asset */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Affected Banking Application</label>
            <select
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              className="w-full bg-bank-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
            >
              <option value="">-- None / Non-Application --</option>
              {applications.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.criticality})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Affected Infrastructure Asset (CMDB)</label>
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-full bg-bank-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
            >
              <option value="">-- None / App-Only --</option>
              {assets.map((ast) => (
                <option key={ast.id} value={ast.id}>
                  {ast.name} ({ast.assetType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Context Fields for Vulnerabilities */}
        {category === 'VULNERABILITY' && (
          <div className="bg-bank-950 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">Vulnerability Locus & CVSS</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">CWE ID</label>
                <input
                  type="text"
                  value={cweId}
                  onChange={(e) => setCweId(e.target.value)}
                  placeholder="e.g. CWE-89"
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">CVE ID (if applicable)</label>
                <input
                  type="text"
                  value={cveId}
                  onChange={(e) => setCveId(e.target.value)}
                  placeholder="e.g. CVE-2026-21894"
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">CVSS Score (0-10)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={cvssScore}
                  onChange={(e) => setCvssScore(parseFloat(e.target.value))}
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Endpoint / URL</label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="e.g. /api/v2/transfers/authorize"
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Source File & Line</label>
                <input
                  type="text"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="e.g. src/main/java/PaymentService.java:88"
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Proof of Concept (POC Payload)</label>
              <textarea
                rows={2}
                value={proofOfConcept}
                onChange={(e) => setProofOfConcept(e.target.value)}
                placeholder="HTTP request or code payload demonstrating exploitability..."
                className="w-full bg-bank-900 border border-slate-700 rounded p-2 text-xs text-emerald-400 font-mono"
              />
            </div>
          </div>
        )}

        {/* Dynamic Context Fields for Security Exceptions */}
        {category === 'SECURITY_EXCEPTION' && (
          <div className="bg-bank-950 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Security Exception Parameters</h4>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Policy Control ID</label>
              <input
                type="text"
                value={controlId}
                onChange={(e) => setControlId(e.target.value)}
                className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Business Justification (Mandatory)</label>
              <textarea
                rows={2}
                required
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Detail business continuity or customer impact justifying exception..."
                className="w-full bg-bank-900 border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Compensating Controls (Mandatory)</label>
              <textarea
                rows={2}
                required
                value={compensatingControls}
                onChange={(e) => setCompensatingControls(e.target.value)}
                placeholder="Explain additional security controls that reduce residual risk..."
                className="w-full bg-bank-900 border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
          </div>
        )}

        {/* Dynamic Context Fields for SOC / DLP Incidents */}
        {(category === 'INCIDENT' || category === 'DLP_ALERT') && (
          <div className="bg-bank-950 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Incident Telemetry & IOCs</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Incident Type</label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value as any)}
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                >
                  <option value="PHISHING">PHISHING</option>
                  <option value="CREDENTIAL_DUMPING">CREDENTIAL_DUMPING</option>
                  <option value="DATA_EXFILTRATION">DATA_EXFILTRATION</option>
                  <option value="RANSOMWARE">RANSOMWARE</option>
                  <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED_ACCESS</option>
                  <option value="DDOS">DDOS</option>
                  <option value="INSIDER_THREAT">INSIDER_THREAT</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Attacker IP Addresses (Comma-separated)</label>
                <input
                  type="text"
                  value={iocIps}
                  onChange={(e) => setIocIps(e.target.value)}
                  placeholder="e.g. 185.220.101.5, 45.154.255.88"
                  className="w-full bg-bank-900 border border-slate-700 rounded p-1.5 text-xs text-white font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Immediate Containment Actions</label>
              <textarea
                rows={2}
                value={containmentActions}
                onChange={(e) => setContainmentActions(e.target.value)}
                placeholder="Describe host isolation, credential revocation, or firewall blocking applied..."
                className="w-full bg-bank-900 border border-slate-700 rounded p-2 text-xs text-white"
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !title.trim()}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all hover:scale-105 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating Case...' : 'Create Security Ticket'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
