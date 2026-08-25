import React, { useState } from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { CheckCircle2, Plus, Search, Filter, X, ShieldAlert, Clock, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';

interface SecurityExceptionsViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const SecurityExceptionsView: React.FC<SecurityExceptionsViewProps> = ({
  tickets,
  onSelectTicket,
}) => {
  const { fetchWithAuth } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PENDING' | 'CLOSED'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [controlId, setControlId] = useState('NIST-800-53-AC-2');
  const [justification, setJustification] = useState('');
  const [compensatingControls, setCompensatingControls] = useState('');
  const [expiryDays, setExpiryDays] = useState(90);

  const exceptionTickets = tickets.filter(
    (t) => t.category === 'SECURITY_EXCEPTION' || t.projectCode === 'GRC'
  );

  const filteredExceptions = exceptionTickets.filter((t) => {
    if (statusFilter === 'ACTIVE' && t.statusCategory !== 'IN_PROGRESS') return false;
    if (statusFilter === 'PENDING' && t.statusCategory !== 'TO_DO') return false;
    if (statusFilter === 'CLOSED' && t.statusCategory !== 'DONE') return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.exceptionDetails?.requestedControlId?.toLowerCase().includes(q) ||
        t.exceptionDetails?.businessJustification?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCreateException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    try {
      const res = await fetchWithAuth('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectCode: 'GRC',
          category: 'SECURITY_EXCEPTION',
          securityDomain: 'GRC',
          title: `[Policy Exception] ${title}`,
          description: `Policy Control: ${controlId}\nJustification: ${justification}\nCompensating Controls: ${compensatingControls}`,
          technicalSeverity: 'MEDIUM',
          businessPriority: 'P2_HIGH',
          confidentiality: 'INTERNAL',
          exceptionDetails: {
            policyControl: controlId,
            requestedControlId: controlId,
            businessJustification: justification,
            compensatingControls: compensatingControls,
            durationDays: expiryDays,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setTitle('');
        setJustification('');
        setCompensatingControls('');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-semantic-warning-soft text-semantic-warning-bright border border-semantic-warning-border-strong">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight">
              Security Policy Exceptions & Risk Acceptances
            </h1>
            <p className="text-xs text-semantic-jira-muted mt-0.5">
              Time-bound regulatory exemptions with validated compensating controls and dual-control sign-off.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="px-3 py-1 bg-semantic-warning-soft text-semantic-warning-bright border border-semantic-warning-border-strong rounded font-mono text-xs font-bold">
            {exceptionTickets.length} Active Exceptions
          </span>
          <button
            onClick={() => setIsModalOpen(true)}
            className="jira-btn-primary"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Request Security Exception</span>
          </button>
        </div>
      </div>

      {/* Filter tabs and search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-jira-border pb-2 text-xs">
        <div className="flex items-center gap-1">
          {[
            { id: 'ALL', label: 'All Exceptions' },
            { id: 'ACTIVE', label: 'Active & Approved' },
            { id: 'PENDING', label: 'Under Review' },
            { id: 'CLOSED', label: 'Expired / Revoked' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-semantic-jira-brand text-white font-semibold shadow-sm'
                  : 'bg-semantic-panel text-semantic-jira-muted hover:text-semantic-jira-primary border border-semantic-jira-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-semantic-jira-muted absolute left-2.5 top-2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exceptions..."
            className="jira-input pl-8"
          />
        </div>
      </div>

      {/* Exception List */}
      <div className="space-y-3">
        {filteredExceptions.length === 0 ? (
          <div className="py-16 text-center text-semantic-jira-muted text-xs italic bg-semantic-panel rounded-md border border-semantic-jira-border">
            No policy exceptions found matching this filter.
          </div>
        ) : (
          filteredExceptions.map((t) => {
            const exc = t.exceptionDetails;
            return (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t)}
                className="p-4 bg-semantic-panel border border-semantic-jira-border hover:border-semantic-jira-brand rounded-md cursor-pointer transition-colors space-y-2.5 shadow-sm group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge type="PROJECT" value={t.projectCode} />
                    <span className="font-mono font-bold text-semantic-jira-primary text-xs group-hover:text-semantic-jira-brand transition-colors">
                      {t.key}
                    </span>
                    <span className="jira-lozenge jira-lozenge-inprogress text-caption">
                      {t.statusName}
                    </span>
                    {exc?.requestedControlId && (
                      <span className="px-1.5 py-0.2 rounded bg-semantic-panel text-semantic-warning-bright font-mono text-caption border border-semantic-warning-border-strong">
                        {exc.requestedControlId}
                      </span>
                    )}
                  </div>
                  <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                </div>

                <h3 className="text-xs font-semibold text-semantic-jira-primary group-hover:text-semantic-jira-brand leading-snug">
                  {t.title}
                </h3>

                {exc && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-semantic-panel rounded border border-semantic-jira-border text-xs">
                    <div>
                      <span className="text-semantic-jira-muted font-bold text-caption uppercase">Business Justification:</span>
                      <p className="text-semantic-jira-primary mt-0.5 text-label leading-relaxed">{exc.businessJustification}</p>
                    </div>
                    <div>
                      <span className="text-semantic-success font-bold text-caption uppercase">Compensating Controls:</span>
                      <p className="text-semantic-jira-primary mt-0.5 text-label leading-relaxed">{exc.compensatingControls}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Request Exception Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-dsDialog flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-semantic-panel border border-semantic-jira-border rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-semantic-jira-border pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-semantic-jira-brand" />
                <h3 className="text-sm font-bold text-semantic-jira-primary">Request Security Policy Exception</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-semantic-jira-muted hover:text-semantic-jira-primary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateException} className="space-y-3 text-xs">
              <div>
                <label className="block text-semantic-jira-muted mb-1">Exception Title:</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Temporary Port 22 SSH Ingress on Payment Gateway Test Node"
                  required
                  className="jira-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Policy Control Mandate:</label>
                  <select
                    value={controlId}
                    onChange={(e) => setControlId(e.target.value)}
                    className="jira-input"
                  >
                    <option value="NIST-800-53-AC-2">NIST AC-2 (Account Management / SSH)</option>
                    <option value="NIST-800-53-SC-8">NIST SC-8 (Transmission Confidentiality TLS 1.3)</option>
                    <option value="PCI-DSS-REQ-8">PCI-DSS Req 8 (MFA Enforcement)</option>
                    <option value="ISO-27001-A9">ISO 27001 A.9 (Access Control Separation)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-semantic-jira-muted mb-1">Requested Duration:</label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(Number(e.target.value))}
                    className="jira-input"
                  >
                    <option value={30}>30 Days (Standard)</option>
                    <option value={60}>60 Days (Extended)</option>
                    <option value={90}>90 Days (Quarterly Maximum)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Business Justification & Impact:</label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Describe operational necessity, vendor delay, or project dependency..."
                  rows={2}
                  className="jira-input"
                />
              </div>

              <div>
                <label className="block text-semantic-jira-muted mb-1">Validated Compensating Controls:</label>
                <textarea
                  value={compensatingControls}
                  onChange={(e) => setCompensatingControls(e.target.value)}
                  placeholder="e.g. Ingress restricted strictly to Bastion IP (10.200.4.5), MFA enforced, session video recorded..."
                  rows={2}
                  className="jira-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-semantic-jira-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="jira-btn-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="jira-btn-primary"
                >
                  Submit for CISO Sign-off
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
