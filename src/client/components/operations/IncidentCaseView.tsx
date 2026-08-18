import React, { useState } from 'react';
import { Ticket } from '../../../shared/types/ticket.js';
import { Badge } from '../common/Badge.js';
import { SLARing } from '../common/SLARing.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  Flame,
  ShieldAlert,
  Terminal,
  Clock,
  ArrowRight,
  Zap,
  Radio,
  Play,
  X,
  AlertOctagon,
  ShieldCheck,
  Activity,
  Plus,
} from 'lucide-react';

interface IncidentCaseViewProps {
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
}

export const IncidentCaseView: React.FC<IncidentCaseViewProps> = ({ tickets, onSelectTicket }) => {
  const { fetchWithAuth } = useAuth();
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationLog, setSimulationLog] = useState<string | null>(null);
  const [isWarRoomModalOpen, setIsWarRoomModalOpen] = useState(false);

  const incidentTickets = tickets.filter((t) => t.category === 'INCIDENT' || t.projectCode === 'SOC');

  const filteredIncidents = incidentTickets.filter((t) => {
    if (phaseFilter === 'ALL') return true;
    return (
      t.incidentDetails?.incidentPhase === phaseFilter ||
      t.statusName?.toUpperCase().includes(phaseFilter)
    );
  });

  const handleSimulateSIEM = async (scenario: 'PRIV_ESC' | 'SWIFT_ANOMALY' | 'RANSOMWARE_CANARY') => {
    setIsSimulating(true);
    setSimulationLog(null);
    try {
      const res = await fetchWithAuth('/api/incidents/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const data = await res.json();
      if (data.success) {
        setSimulationLog(`🚨 Real-time SIEM Alert Ingested: Created P1 Case [${data.ticket.key}] - ${data.ticket.title}`);
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setSimulationLog('SIEM ingestion failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-[#FFEBE6] text-[#DE350B] border border-[#FFBDAD]">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
              SOC Security Incident Command Center
            </h1>
            <p className="text-xs text-[#5E6C84] mt-0.5">
              NIST SP 800-61 / ISO 27035 incident triage, containment, MITRE ATT&CK attribution, and regulatory escalation.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsWarRoomModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#DE350B] hover:bg-[#BF2600] text-white text-xs font-bold shadow-sm transition-colors"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Declare P1 War Room</span>
          </button>
        </div>
      </div>

      {/* SIEM Threat Simulation Bar */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-4 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#FF8B00]" />
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              Live SIEM / EDR Ingestion Simulator
            </h3>
          </div>
          <span className="text-[10px] font-mono text-[#5E6C84]">SOC Rule Engine Webhook</span>
        </div>

        <p className="text-xs text-[#5E6C84] leading-relaxed">
          Trigger real-time SIEM correlated threats to test automated ticket generation, MITRE ATT&CK mapping, and SLA escalation tracking.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => handleSimulateSIEM('SWIFT_ANOMALY')}
            disabled={isSimulating}
            className="jira-btn-secondary py-1 text-xs"
          >
            <Play className="w-3 h-3 text-[#DE350B]" />
            <span>Simulate SWIFT Payment Batch Anomaly</span>
          </button>
          <button
            onClick={() => handleSimulateSIEM('PRIV_ESC')}
            disabled={isSimulating}
            className="jira-btn-secondary py-1 text-xs"
          >
            <Play className="w-3 h-3 text-[#FF8B00]" />
            <span>Simulate DC Kerberos / LSASS Credential Dump</span>
          </button>
          <button
            onClick={() => handleSimulateSIEM('RANSOMWARE_CANARY')}
            disabled={isSimulating}
            className="jira-btn-secondary py-1 text-xs"
          >
            <Play className="w-3 h-3 text-[#C0B6F2]" />
            <span>Simulate Ransomware Canary Tripwire</span>
          </button>
        </div>

        {simulationLog && (
          <div className="p-2.5 rounded bg-[#FFFFFF] border border-[#FFBDAD] text-xs font-mono text-[#DE350B]">
            {simulationLog}
          </div>
        )}
      </div>

      {/* NIST Lifecycle Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#DFE1E6] pb-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A869A] mr-1.5">NIST Stage:</span>
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
                  ? 'bg-[#0052CC] text-white font-semibold shadow-sm'
                  : 'bg-[#FFFFFF] text-[#5E6C84] hover:text-[#172B4D] border border-[#DFE1E6]'
              }`}
            >
              {stage.label}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-[#5E6C84] font-mono">
          {filteredIncidents.length} Active Cases
        </span>
      </div>

      {/* Cases List */}
      <div className="space-y-3">
        {filteredIncidents.length === 0 ? (
          <div className="py-16 text-center text-[#5E6C84] text-xs italic bg-[#FFFFFF] rounded-md border border-[#DFE1E6]">
            No incident cases found in this NIST lifecycle stage.
          </div>
        ) : (
          filteredIncidents.map((t) => (
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
                <div className="flex items-center gap-3">
                  <Badge type="SEVERITY" value={t.technicalSeverity} />
                  <SLARing remainingMinutes={t.slaRemainingMinutes} state={t.slaState} size="sm" />
                </div>
              </div>

              <h3 className="text-xs font-semibold text-[#172B4D] group-hover:text-[#0052CC] leading-snug">
                {t.title}
              </h3>
              <p className="text-[11px] text-[#5E6C84] line-clamp-2 leading-relaxed">{t.description}</p>

              {/* MITRE ATT&CK Preview */}
              {t.incidentDetails?.mitreAttack && t.incidentDetails.mitreAttack.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[#DFE1E6]">
                  <span className="text-[10px] text-[#5E6C84] uppercase font-bold">MITRE TTPs:</span>
                  {t.incidentDetails.mitreAttack.map((m, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded bg-[#FFFFFF] border border-[#FFBDAD] text-[#DE350B] font-mono text-[10px]"
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

      {/* P1 War Room Declaration Modal */}
      {isWarRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#FFBDAD] rounded-md max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#FFBDAD]/60 pb-3">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-[#DE350B] animate-pulse" />
                <h3 className="text-sm font-bold text-[#172B4D] uppercase">Declare P1 Security War Room</h3>
              </div>
              <button onClick={() => setIsWarRoomModalOpen(false)} className="text-[#5E6C84] hover:text-[#172B4D]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#172B4D] leading-relaxed">
              Declaring a Priority 1 Major Incident immediately activates the 24/7 incident response bridge, notifies the CISO and Incident Commander, and initiates regulatory clock tracking (CBAR / NIST notifications).
            </p>

            <div className="p-3 bg-[#FFFFFF] rounded border border-[#FFBDAD]/40 space-y-2 text-xs font-mono text-[#172B4D]">
              <div>• Bridge URL: <span className="text-[#0052CC]">https://meet.apexbank.internal/ir-war-room-alpha</span></div>
              <div>• Lead Responder: <span className="text-[#006644]">SOC Incident Commander on duty</span></div>
              <div>• Escalation SLA: <strong className="text-[#DE350B]">15 Minutes MTTA</strong></div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE1E6]">
              <button
                onClick={() => setIsWarRoomModalOpen(false)}
                className="jira-btn-subtle"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('P1 War Room bridge activated. Automated SMS/Teams broadcast dispatched to SecOps Squad.');
                  setIsWarRoomModalOpen(false);
                }}
                className="px-4 py-1.5 rounded bg-[#DE350B] hover:bg-[#BF2600] text-white text-xs font-bold"
              >
                Confirm & Launch Bridge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


