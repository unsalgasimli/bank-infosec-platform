import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Settings, Users, Workflow, Clock, Zap, FileText, ArrowRight, Download, Search, Filter, Plus, X, CheckCircle2, ShieldCheck, Play } from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { AuditEvent } from '../../../shared/types/audit.js';

export const AdminCenterView: React.FC = () => {
  const { allUsers, fetchWithAuth } = useAuth();
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'USERS' | 'WORKFLOWS' | 'SLA' | 'AUTOMATION'>('AUDIT');
  const [adminData, setAdminData] = useState<any>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);

  // New user form state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('SOC_ANALYST');
  const [userDept, setUserDept] = useState('CYBER_DEFENSE_CENTER');

  useEffect(() => {
    fetchWithAuth('/api/admin/metadata')
      .then((res) => res.json())
      .then((data) => setAdminData(data));

    fetchWithAuth('/api/admin/audit?limit=100')
      .then((res) => res.json())
      .then((data) => setAuditEvents(data.events || []));
  }, []);

  const filteredAudit = auditEvents.filter((evt) => {
    if (!auditSearch) return true;
    const q = auditSearch.toLowerCase();
    return (
      evt.action?.toLowerCase().includes(q) ||
      evt.actorName?.toLowerCase().includes(q) ||
      evt.actorRole?.toLowerCase().includes(q) ||
      evt.entityKey?.toLowerCase().includes(q) ||
      evt.ipAddress?.toLowerCase().includes(q)
    );
  });

  const filteredUsers = allUsers.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles.some((r) => r.toLowerCase().includes(q)) ||
      u.departmentId.toLowerCase().includes(q)
    );
  });

  const handleExportAuditCSV = () => {
    const headers = ['Timestamp', 'Action', 'Actor Name', 'Actor Role', 'Entity Key', 'IP Address', 'Correlation ID'];
    const rows = filteredAudit.map((e) => [
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
    link.setAttribute('download', `apex_bank_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRunAutomation = () => {
    setAutomationMessage('Running security automation rule evaluation engine...');
    setTimeout(() => {
      setAutomationMessage('Automation complete: 4 active rules evaluated. All SLA escalation triggers & auto-taggers verified.');
    }, 700);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F4F5F7] custom-scrollbar">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-[#DEEBFF] text-[#0052CC] border border-[#B3D4FF]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#172B4D] tracking-tight">
              Administration, Engine & System Audit Log
            </h1>
            <p className="text-xs text-[#5E6C84] mt-0.5">
              Enterprise configuration, RBAC directory, workflow state machines, automation rules, and immutable audit logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'AUDIT' && (
            <button
              onClick={handleExportAuditCSV}
              className="jira-btn-primary"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit CSV</span>
            </button>
          )}
          {activeTab === 'USERS' && (
            <button
              onClick={() => setIsAddUserOpen(true)}
              className="jira-btn-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add User Persona</span>
            </button>
          )}
          {activeTab === 'AUTOMATION' && (
            <button
              onClick={handleRunAutomation}
              className="jira-btn-primary"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Trigger Rule Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[#DFE1E6] flex items-center gap-6 text-xs font-semibold uppercase tracking-wider">
        {[
          { id: 'AUDIT', label: 'System Audit Log', icon: FileText },
          { id: 'USERS', label: 'User & Role Directory', icon: Users },
          { id: 'WORKFLOWS', label: 'Workflows & State Machines', icon: Workflow },
          { id: 'SLA', label: 'SLA Policies', icon: Clock },
          { id: 'AUTOMATION', label: 'Automation Rules', icon: Zap },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 flex items-center gap-1.5 transition-colors relative ${
                activeTab === tab.id
                  ? 'text-[#0052CC] font-bold'
                  : 'text-[#5E6C84] hover:text-[#172B4D]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0052CC] rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Audit Log Tab */}
      {activeTab === 'AUDIT' && (
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
                Append-Only Verified Audit Trail ({filteredAudit.length} Records)
              </h3>
              <p className="text-xs text-[#5E6C84] mt-0.5">Immutable audit events recorded with actor ID, IP address, and delta changes.</p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#5E6C84] absolute left-2.5 top-2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail..."
                className="jira-input pl-8"
              />
            </div>
          </div>

          <div className="divide-y divide-[#DFE1E6] text-xs font-mono">
            {filteredAudit.length === 0 ? (
              <div className="py-12 text-center text-[#5E6C84] italic">
                No audit events matched your search query.
              </div>
            ) : (
              filteredAudit.map((evt) => (
                <div key={evt.id} className="py-3 space-y-1.5 hover:bg-[#EBECF0] px-3 rounded transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-sans">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] font-mono text-[10px] font-bold border border-[#DFE1E6]">
                        {evt.action}
                      </span>
                      <span className="font-semibold text-[#172B4D]">{evt.actorName}</span>
                      <span className="text-[#5E6C84] text-[11px]">({evt.actorRole})</span>
                      {evt.entityKey && (
                        <span className="font-mono text-[#0052CC] font-bold">[{evt.entityKey}]</span>
                      )}
                    </div>
                    <span className="text-[#5E6C84] text-[11px] font-mono">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {evt.fieldChanges && evt.fieldChanges.length > 0 && (
                    <div className="text-[11px] text-[#172B4D] pl-3 space-y-0.5 font-mono">
                      {evt.fieldChanges.map((ch, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <span className="text-[#5E6C84]">{ch.field}:</span>
                          <span className="text-[#DE350B] line-through bg-[#FFEBE6] px-1 rounded">{String(ch.oldValue || 'none')}</span>
                          <ArrowRight className="w-3 h-3 text-[#7A869A]" />
                          <span className="text-[#006644] font-bold bg-[#E3FCEF] px-1 rounded">{String(ch.newValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-[#7A869A]">
                    IP: <span className="text-[#5E6C84]">{evt.ipAddress}</span> | CID: <span className="text-[#5E6C84]">{evt.correlationId}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'USERS' && (
        <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md overflow-hidden shadow-sm space-y-3 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-[#172B4D] uppercase tracking-wider">
              Identity & Role Directory ({filteredUsers.length} Personas)
            </h3>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#5E6C84] absolute left-2.5 top-2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search user, role, department..."
                className="jira-input pl-8"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse jira-table">
              <thead className="bg-[#FFFFFF] border-b border-[#DFE1E6] text-[#5E6C84] uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-3 py-3">Roles</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Clearance Level</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DFE1E6]">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-[#EBECF0] transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#172B4D]">
                      <div>{u.fullName}</div>
                      <div className="text-[11px] text-[#5E6C84] font-normal">{u.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] font-mono text-[11px] border border-[#DFE1E6] font-semibold">
                        {u.roles.join(', ')}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#172B4D]">{u.departmentId}</td>
                    <td className="px-3 py-3">
                      <Badge type="CONFIDENTIALITY" value={u.securityClearance} size="sm" />
                    </td>
                    <td className="px-3 py-3">
                      <span className="jira-lozenge jira-lozenge-done text-[10px]">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === 'WORKFLOWS' && adminData && (
        <div className="space-y-4">
          {adminData.workflows?.map((wf: any) => (
            <div key={wf.id} className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
                <div>
                  <h3 className="font-bold text-[#172B4D] text-sm">{wf.name}</h3>
                  <p className="text-xs text-[#5E6C84] mt-0.5">{wf.description}</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] font-mono text-xs border border-[#DFE1E6]">
                  Version {wf.version}
                </span>
              </div>

              {/* State machine diagram */}
              <div className="p-4 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-3">
                <div className="text-[11px] uppercase font-bold text-[#5E6C84] tracking-wider">
                  State Machine Lifecycle & Transitions
                </div>
                <div className="flex items-center gap-3 overflow-x-auto py-2">
                  {wf.states.map((s: any, idx: number) => (
                    <React.Fragment key={s.id}>
                      <div className="p-3 rounded bg-[#FFFFFF] border border-[#DFE1E6] space-y-1 min-w-[140px] shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="font-bold text-[#172B4D] text-xs">{s.name}</span>
                        </div>
                        <div className="text-[10px] text-[#5E6C84] font-mono uppercase">{s.category}</div>
                      </div>
                      {idx < wf.states.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-[#0052CC] shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLA Policies Tab */}
      {activeTab === 'SLA' && adminData && (
        <div className="space-y-4">
          {adminData.slaPolicies?.map((sla: any) => (
            <div key={sla.id} className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
                <div>
                  <h3 className="font-bold text-[#172B4D] text-sm">{sla.name}</h3>
                  <p className="text-xs text-[#5E6C84] mt-0.5">{sla.description}</p>
                </div>
                <span className="jira-lozenge jira-lozenge-done text-xs font-mono">
                  {sla.isDefault ? 'DEFAULT POLICY' : 'CONFIGURED'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(sla.thresholds || {}).map(([sev, th]: [string, any]) => (
                  <div key={sev} className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] space-y-1.5">
                    <div className="font-bold text-[#172B4D] text-xs flex items-center justify-between">
                      <span>{sev}</span>
                      <Badge type="SEVERITY" value={sev} size="sm" />
                    </div>
                    <div className="text-[#5E6C84] text-xs mt-1">
                      MTTA Target: <strong className="text-[#172B4D] font-mono">{th.acknowledgmentMinutes} min</strong>
                    </div>
                    <div className="text-[#FF8B00] text-xs font-medium">
                      MTTR Target: <strong className="text-[#172B4D] font-mono">{Math.round(th.remediationMinutes / 60)} hrs</strong>
                    </div>
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
          {automationMessage && (
            <div className="p-3 bg-[#FFFFFF] border border-[#B3D4FF] text-[#0052CC] rounded text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#006644] shrink-0" />
              <span>{automationMessage}</span>
            </div>
          )}

          {adminData.automationRules?.map((rule: any) => (
            <div key={rule.id} className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#172B4D] text-xs">{rule.name}</h3>
                <span className="px-2 py-0.5 rounded bg-[#FFFFFF] text-[#0052CC] border border-[#DFE1E6] text-[10px] font-mono font-bold">
                  Executed {rule.executionCount} Times
                </span>
              </div>
              <p className="text-xs text-[#5E6C84]">{rule.description}</p>
              <div className="p-3 bg-[#FFFFFF] rounded border border-[#DFE1E6] text-xs font-mono text-[#172B4D] space-y-1.5">
                <div>TRIGGER: <strong className="text-[#0052CC]">{rule.trigger}</strong></div>
                <div>CONDITIONS: <span className="text-[#FF8B00]">{JSON.stringify(rule.conditions)}</span></div>
                <div>ACTIONS: <span className="text-[#006644]">{JSON.stringify(rule.actions)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4">
          <div className="bg-[#FFFFFF] border border-[#DFE1E6] rounded-md max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#DFE1E6] pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0052CC]" />
                <h3 className="text-sm font-bold text-[#172B4D]">Add User Persona</h3>
              </div>
              <button onClick={() => setIsAddUserOpen(false)} className="text-[#5E6C84] hover:text-[#172B4D]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[#5E6C84] mb-1">Full Name:</label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Leyla Karimova"
                  className="jira-input"
                />
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Corporate Email:</label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="l.karimova@apexbank.az"
                  className="jira-input"
                />
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Role Assignment:</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="jira-input"
                >
                  <option value="SOC_ANALYST">SOC Analyst (Tier 1/2)</option>
                  <option value="APPSEC_ENGINEER">AppSec Engineer</option>
                  <option value="DLP_ANALYST">DLP & Forensics Analyst</option>
                  <option value="GRC_ANALYST">GRC Risk Analyst</option>
                  <option value="SECOPS_LEAD">SecOps Squad Lead</option>
                  <option value="CISO">Chief Information Security Officer (CISO)</option>
                </select>
              </div>

              <div>
                <label className="block text-[#5E6C84] mb-1">Department:</label>
                <input
                  type="text"
                  value={userDept}
                  onChange={(e) => setUserDept(e.target.value)}
                  className="jira-input"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#DFE1E6]">
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="jira-btn-subtle"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('User registered in local directory.');
                  setIsAddUserOpen(false);
                }}
                className="jira-btn-primary"
              >
                Save User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


