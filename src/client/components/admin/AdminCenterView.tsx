import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Settings, Users, Workflow, Clock, Zap, ShieldAlert, FileText, ArrowRight } from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { AuditEvent } from '../../../shared/types/audit.js';

export const AdminCenterView: React.FC = () => {
  const { allUsers, fetchWithAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'USERS' | 'WORKFLOWS' | 'SLA' | 'AUTOMATION' | 'AUDIT'>('AUDIT');
  const [adminData, setAdminData] = useState<any>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    fetchWithAuth('/api/admin/metadata')
      .then((res) => res.json())
      .then((data) => setAdminData(data));

    fetchWithAuth('/api/admin/audit?limit=100')
      .then((res) => res.json())
      .then((data) => setAuditEvents(data.events || []));
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-blue-950 text-blue-400 border border-blue-800">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Bank Administration & System Audit Log
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enterprise configuration, RBAC directory, workflow state machines, automation rules, and tamper-resistant audit records.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-6 text-xs font-bold uppercase tracking-wider">
        {[
          { id: 'AUDIT', label: 'Complete Audit Log Trail', icon: FileText },
          { id: 'USERS', label: 'Bank User & Role Directory', icon: Users },
          { id: 'WORKFLOWS', label: 'Workflows & State Machines', icon: Workflow },
          { id: 'SLA', label: 'SLA Banking Policies', icon: Clock },
          { id: 'AUTOMATION', label: 'Automation Rules', icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 flex items-center gap-2 transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Audit Log Tab */}
      {activeTab === 'AUDIT' && (
        <div className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Immutable System Audit Log ({auditEvents.length} Recent Records)
            </h3>
            <span className="text-xs text-slate-400 font-mono">SHA-256 Tamper Sealed</span>
          </div>

          <div className="divide-y divide-slate-800 text-xs font-mono">
            {auditEvents.map((evt) => (
              <div key={evt.id} className="py-3 space-y-1 hover:bg-slate-800/30 px-2 rounded transition-colors">
                <div className="flex items-center justify-between font-sans">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-[10px] font-bold">
                      {evt.action}
                    </span>
                    <span className="font-bold text-white">{evt.actorName}</span>
                    <span className="text-slate-500">({evt.actorRole})</span>
                    {evt.entityKey && <span className="font-mono text-navy-300 font-bold">[{evt.entityKey}]</span>}
                  </div>
                  <span className="text-slate-400 text-[11px]">
                    {new Date(evt.timestamp).toLocaleString()}
                  </span>
                </div>

                {evt.fieldChanges && evt.fieldChanges.length > 0 && (
                  <div className="text-[11px] text-slate-300 pl-4 space-y-0.5">
                    {evt.fieldChanges.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-slate-400">{ch.field}:</span>
                        <span className="text-red-400 line-through">{String(ch.oldValue || 'none')}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-emerald-400 font-bold">{String(ch.newValue)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-slate-600">IP: {evt.ipAddress} | CID: {evt.correlationId}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'USERS' && (
        <div className="bg-bank-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-bank-950 border-b border-slate-800 text-slate-400 uppercase font-bold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee Name</th>
                <th className="px-3 py-3">Roles</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Clearance</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {allUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-white">
                    <div>{u.fullName}</div>
                    <div className="text-[11px] text-slate-400 font-normal">{u.email}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-blue-300 font-mono text-[10px] font-bold">
                      {u.roles.join(', ')}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-300">{u.departmentId}</td>
                  <td className="px-3 py-3">
                    <Badge type="CONFIDENTIALITY" value={u.securityClearance} size="sm" />
                  </td>
                  <td className="px-3 py-3">
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono">
                      ACTIVE
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === 'WORKFLOWS' && adminData && (
        <div className="space-y-4">
          {adminData.workflows?.map((wf: any) => (
            <div key={wf.id} className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm">{wf.name}</h3>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono text-xs">v{wf.version}</span>
              </div>
              <p className="text-xs text-slate-400">{wf.description}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                {wf.states.map((s: any) => (
                  <div key={s.id} className="px-2.5 py-1 rounded bg-bank-950 border border-slate-700 text-xs font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-200">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLA Policies Tab */}
      {activeTab === 'SLA' && adminData && (
        <div className="space-y-4">
          {adminData.slaPolicies?.map((sla: any) => (
            <div key={sla.id} className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm">{sla.name}</h3>
                <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-mono font-bold">
                  {sla.isDefault ? 'DEFAULT' : 'CONFIGURED'}
                </span>
              </div>
              <p className="text-xs text-slate-400">{sla.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs">
                {Object.entries(sla.thresholds || {}).map(([sev, th]: [string, any]) => (
                  <div key={sev} className="p-2.5 bg-bank-950 rounded-lg border border-slate-800">
                    <div className="font-bold text-white">{sev}</div>
                    <div className="text-slate-400 text-[11px] mt-1">Ack: {th.acknowledgmentMinutes}m</div>
                    <div className="text-amber-400 text-[11px] font-bold">Remediate: {Math.round(th.remediationMinutes / 60)}h</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automation Rules Tab */}
      {activeTab === 'AUTOMATION' && adminData && (
        <div className="space-y-4">
          {adminData.automationRules?.map((rule: any) => (
            <div key={rule.id} className="bg-bank-900 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-sm">{rule.name}</h3>
                <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-xs font-mono font-bold">
                  Executed {rule.executionCount} Times
                </span>
              </div>
              <p className="text-xs text-slate-400">{rule.description}</p>
              <div className="p-3 bg-bank-950 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div>TRIGGER: <strong className="text-blue-400">{rule.trigger}</strong></div>
                <div>CONDITIONS: <span className="text-amber-400">{JSON.stringify(rule.conditions)}</span></div>
                <div>ACTIONS: <span className="text-emerald-400">{JSON.stringify(rule.actions)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
