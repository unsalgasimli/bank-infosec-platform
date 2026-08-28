import React, { useState, useEffect } from 'react';
import {
  FileCheck,
  Download,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { AuditEvent } from '../../../shared/types/audit.js';

export const AuditComplianceView: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchWithAuth('/api/admin/audit?limit=100')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAuditEvents(data.events || []);
      })
      .catch((err) => console.error('Failed to load audit logs', err));
  }, []);

  const filteredEvents = auditEvents.filter((e) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      e.actorName.toLowerCase().includes(q) ||
      e.entityKey?.toLowerCase().includes(q) ||
      e.ipAddress.toLowerCase().includes(q)
    );
  });

  const exportAuditCSV = () => {
    const headers = ['Timestamp', 'Action', 'Actor Name', 'Actor Role', 'Entity Key', 'IP Address', 'Correlation ID'];
    const rows = filteredEvents.map((e) => [
      `"${e.timestamp}"`,
      `"${e.action}"`,
      `"${e.actorName}"`,
      `"${e.actorRole}"`,
      `"${e.entityKey || ''}"`,
      `"${e.ipAddress}"`,
      `"${e.correlationId}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `apex_bank_compliance_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-semantic-subtle custom-scrollbar select-none">
      {/* Header Banner */}
      <div className="wrike-card p-6 bg-gradient-to-r from-semantic-panel via-semantic-subtle to-semantic-success-surface/30 border border-semantic-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-semantic-success text-white flex items-center justify-center font-bold shadow-md">
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-primary">{t('Audit & Regulatory Compliance')}</h1>
            <p className="text-xs text-semantic-muted mt-0.5">
              {t('Continuous regulatory control assurance, gap remediation workflows, and append-only audit trail logs.')}
            </p>
          </div>
        </div>

        <button
          onClick={exportAuditCSV}
          className="wrike-btn-secondary text-xs py-2 px-3.5"
        >
          <Download className="w-4 h-4" />
          <span>{t('Export Audit Log')}</span>
        </button>
      </div>

      <div className="wrike-card p-4 text-xs text-semantic-muted border border-semantic-border">
        {t('Compliance scores and certification claims are not shown until they are received from an approved control-assessment integration. The audit trail below contains only persisted system activity.')}
      </div>

      {/* Verified Immutable Audit Trail Table */}
      <div className="wrike-card p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-border pb-3">
          <div>
            <h2 className="font-bold text-sm text-semantic-primary">
              {t('Verified Append-Only Audit Trail')} ({filteredEvents.length} {t('Events')})
            </h2>
            <p className="text-xs text-semantic-muted mt-0.5">{t('Immutable record of ticket transitions, comments, and authorizations.')}</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2 text-semantic-placeholder" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('Search audit trail...')}
              className="w-full bg-semantic-panel border border-semantic-border-strong rounded-lg pl-9 pr-3 py-1.5 text-xs text-semantic-primary outline-none"
            />
          </div>
        </div>

        <div className="divide-y divide-semantic-border text-xs font-mono">
          {filteredEvents.length === 0 ? (
            <div className="py-8 text-center text-semantic-muted italic">{t('No audit events found.')}</div>
          ) : (
            filteredEvents.slice(0, 10).map((evt) => (
              <div key={evt.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-semantic-subtle px-2 rounded transition-colors">
                <div className="flex items-center gap-2.5 font-sans">
                  <span className="px-2 py-0.5 rounded bg-semantic-info-surface text-semantic-info font-mono text-caption font-bold border border-semantic-info-border">
                    {evt.action}
                  </span>
                  <span className="font-bold text-semantic-primary">{evt.actorName}</span>
                  <span className="text-semantic-muted text-label">({evt.actorRole})</span>
                  {evt.entityKey && <span className="font-mono font-bold text-semantic-info">[{evt.entityKey}]</span>}
                </div>
                <div className="text-label text-semantic-muted font-mono">
                  {new Date(evt.timestamp).toLocaleString()} • IP: {evt.ipAddress}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
