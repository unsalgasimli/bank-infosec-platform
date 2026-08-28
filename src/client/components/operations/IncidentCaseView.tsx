import React, { useState } from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import {
  Flame,
  ShieldAlert,
  Terminal,
  Clock,
  ArrowRight,
  Zap,
  Radio,
  ShieldCheck,
  Activity,
  Plus,
} from 'lucide-react';
import { useI18n } from '../../context/I18nContext.js';

interface IncidentCaseViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const IncidentCaseView: React.FC<IncidentCaseViewProps> = ({ tickets, onSelectTicket }) => {
  const { t } = useI18n();
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');

  const incidentTickets = tickets.filter((t) => t.category === 'INCIDENT' || t.projectCode === 'SOC');

  const filteredIncidents = incidentTickets.filter((t) => {
    if (phaseFilter === 'ALL') return true;
    return (
      t.incidentDetails?.incidentPhase === phaseFilter ||
      t.statusName?.toUpperCase().includes(phaseFilter)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-semantic-jira-blocked-surface text-semantic-danger-strong border border-semantic-jira-blocked-border">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-semantic-jira-primary tracking-tight">
              {t('SOC Security Incident Command Center')}
            </h1>
            <p className="text-xs text-semantic-jira-muted mt-0.5">
              {t('NIST SP 800-61 / ISO 27035 incident triage, containment, MITRE ATT&CK attribution, and regulatory escalation.')}
            </p>
          </div>
        </div>

      </div>

      {/* SIEM / EDR ingestion status */}
      <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-semantic-warning-bright" />
            <h3 className="text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">
              SIEM / EDR ingestion
            </h3>
          </div>
          <span className="text-caption font-mono text-semantic-jira-muted">SOC Rule Engine Webhook</span>
        </div>

        <p className="text-xs text-semantic-jira-muted leading-relaxed">
          Incident cases are created only by authenticated SIEM/EDR integrations or an authorized manual request. Demo threat generation is disabled.
        </p>
      </div>

      {/* NIST Lifecycle Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-semantic-jira-border pb-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-caption font-bold uppercase tracking-wider text-semantic-jira-muted-light mr-1.5">NIST Stage:</span>
          {[
            { id: 'ALL', label: 'All Incidents' },
            { id: 'TRIAGE', label: 'Detection & Triage' },
            { id: 'CONTAINMENT', label: 'Containment' },
            { id: 'ERADICATION', label: 'Eradication' },
            { id: 'RECOVERY', label: 'Recovery & Post-Incident' },
          ].map((stage) => (
            <button
              key={stage.id}
              onClick={() => setPhaseFilter(stage.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                phaseFilter === stage.id
                  ? 'bg-semantic-jira-brand text-white font-semibold shadow-sm'
                  : 'bg-semantic-panel text-semantic-jira-muted hover:text-semantic-jira-primary border border-semantic-jira-border'
              }`}
            >
              {stage.label}
            </button>
          ))}
        </div>

        <span className="text-label text-semantic-jira-muted font-mono">
          {filteredIncidents.length} Active Cases
        </span>
      </div>

      {/* Cases List */}
      <div className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <div className="py-16 text-center text-semantic-jira-muted text-xs italic bg-semantic-panel rounded-md border border-semantic-jira-border">
            No incident cases found in this NIST lifecycle stage.
          </div>
        ) : (
          filteredIncidents.map((t) => (
            <div
              key={t.id}
              onClick={() => onSelectTicket(t)}
              className="p-4 bg-semantic-panel border border-semantic-jira-border hover:border-semantic-jira-brand rounded-md cursor-pointer transition-colors space-y-2.5 shadow-sm group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge type="PROJECT" value={t.projectCode} />
                  <span className="font-mono font-bold text-semantic-jira-primary text-xs group-hover:text-semantic-jira-brand transition-colors">
                    {t.key}
                  </span>
                  <span className="jira-lozenge jira-lozenge-inprogress text-caption">
                    {t.statusName}
                  </span>
                  <Badge type="CONFIDENTIALITY" value={t.confidentiality} size="sm" />
                </div>
                <div className="flex items-center gap-3">
                  <Badge type="SEVERITY" value={t.technicalSeverity} />
                  <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                </div>
              </div>

              <h3 className="text-xs font-semibold text-semantic-jira-primary group-hover:text-semantic-jira-brand leading-snug">
                {t.title}
              </h3>
              <p className="text-label text-semantic-jira-muted line-clamp-2 leading-relaxed">{t.description}</p>

              {/* MITRE ATT&CK Preview */}
              {t.incidentDetails?.mitreAttack && t.incidentDetails.mitreAttack.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-semantic-jira-border">
                  <span className="text-caption text-semantic-jira-muted uppercase font-bold">MITRE TTPs:</span>
                  {t.incidentDetails.mitreAttack.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded bg-semantic-panel border border-semantic-jira-blocked-border text-semantic-danger-strong font-mono text-caption"
                    >
                      {m.techniqueId} - {m.techniqueName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

    </div>
  );
};
