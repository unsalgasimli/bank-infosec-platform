import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Settings, Users, Workflow, Clock, Zap, FileText, ArrowRight } from 'lucide-react';
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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-bank-950">
      <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-bank-950 text-blue-400 border border-slate-800">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Administration & System Audit Log
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Enterprise configuration, RBAC directory, workflow state machines, automation rules, and audit records.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-6 text-xs font-semibold uppercase tracking-wider">
        {[
          { id: 'AUDIT', label: 'System Audit Log', icon: FileText },
          { id: 'USERS', label: 'User & Role Directory', icon: Users },
          { id: 'WORKFLOWS', label: 'Workflows & States', icon: Workflow },
          { id: 'SLA', label: 'SLA Policies', icon: Clock },
          { id: 'AUTOMATION', label: 'Automation Rules', icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 flex items-center gap-1.5 transition-colors relative ${
                activeTab === tab.id
                  ? 'text-blue-400 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Audit Log Tab */}
      {activeTab === 'AUDIT' && (
        <div className="bg-bank-900 border border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Audit Log ({auditEvents.length} Recent Records)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Append-Only Verified</span>
          </div>

          <div className="divide-y divide-slate-800 text-xs font-mono">
            {auditEvents.map((evt) => (
              <div key={evt.id} className="py-2.5 space-y-1 hover:bg-slate-800/30 px-2 rounded transition-colors">
                <div className="flex items-center justify-between font-sans">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.2 rounded bg-slate-850 text-blue-300 font-mono text-[10px] font-semibold border border-slate-700">
                      {evt.action}
                    </span>
                    <span className="font-semibold text-white">{evt.actorName}</span>
                    <span className="text-slate-500 text-[11px]">({evt.actorRole})</span>
                    {evt.entityKey && <span className="font-mono text-blue-400 font-semibold">[{evt.entityKey}]</span>}
                  </div>
                  <span className="text-slate-400 text-[11px]">
                    {new Date(evt.timestamp).toLocaleString()}
                  </span>
                </div>

                {evt.fieldChanges && evt.fieldChanges.length > 0 && (
                  <div className="text-[11px] text-slate-300 pl-3 space-y-0.5">
                    {evt.fieldChanges.map((ch, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-slate-400">{ch.field}:</span>
                        <span className="text-red-400 line-through">{String(ch.oldValue || 'none')}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-emerald-400 font-semibold">{String(ch.newValue)}</span>
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
        <div className="bg-bank-900 border border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-bank-950 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-2.5">Employee Name</th>
                <th className="px-3 py-2.5">Roles</th>
                <th className="px-3 py-2.5">Department</th>
                <th className="px-3 py-2.5">Clearance</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {allUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 font-semibold text-white">
                    <div>{u.fullName}</div>
                    <div className="text-[11px] text-slate-400 font-normal">{u.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-850 text-blue-300 font-mono text-[10px] border border-slate-700">
                      {u.roles.join(', ')}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{u.departmentId}</td>
                  <td className="px-3 py-2.5">
                    <Badge type="CONFIDENTIALITY" value={u.securityClearance} size="sm" />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded bg-bank-950 text-emerald-400 border border-emerald-900 text-[10px] font-mono">
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
        <div className="space-y-3">
          {adminData.workflows?.map((wf: any) => (
            <div key={wf.id} className="bg-bank-900 border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-xs">{wf.name}</h3>
                <span className="px-1.5 py-0.2 rounded bg-bank-950 text-blue-300 font-mono text-[10px] border border-slate-750">v{wf.version}</span>
              </div>
              <p className="text-[11px] text-slate-400">{wf.description}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {wf.states.map((s: any) => (
                  <div key={s.id} className="px-2 py-0.5 rounded bg-bank-950 border border-slate-700 text-xs font-mono flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
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
        <div className="space-y-3">
          {adminData.slaPolicies?.map((sla: any) => (
            <div key={sla.id} className="bg-bank-900 border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-xs">{sla.name}</h3>
                <span className="px-2 py-0.5 rounded bg-bank-950 text-emerald-400 border border-emerald-900 text-[10px] font-mono">
                  {sla.isDefault ? 'DEFAULT' : 'CONFIGURED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{sla.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 text-xs">
                {Object.entries(sla.thresholds || {}).map(([sev, th]: [string, any]) => (
                  <div key={sev} className="p-2 bg-bank-950 rounded border border-slate-800">
                    <div className="font-semibold text-white">{sev}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">Ack: {th.acknowledgmentMinutes}m</div>
                    <div className="text-amber-300 text-[11px] font-semibold">Remediate: {Math.round(th.remediationMinutes / 60)}h</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automation Rules Tab */}
      {activeTab === 'AUTOMATION' && adminData && (
        <div className="space-y-3">
          {adminData.automationRules?.map((rule: any) => (
            <div key={rule.id} className="bg-bank-900 border border-slate-800 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-xs">{rule.name}</h3>
                <span className="px-2 py-0.5 rounded bg-bank-950 text-blue-300 border border-slate-700 text-[10px] font-mono">
                  Executed {rule.executionCount} Times
                </span>
              </div>
              <p className="text-[11px] text-slate-400">{rule.description}</p>
              <div className="p-2.5 bg-bank-950 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div>TRIGGER: <strong className="text-blue-400">{rule.trigger}</strong></div>
                <div>CONDITIONS: <span className="text-amber-300">{JSON.stringify(rule.conditions)}</span></div>
                <div>ACTIONS: <span className="text-emerald-400">{JSON.stringify(rule.actions)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

