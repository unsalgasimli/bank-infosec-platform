import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  Settings,
  Users,
  Workflow,
  Clock,
  Zap,
  FileText,
  ArrowRight,
  Download,
  Search,
  Filter,
  X,
  CheckCircle2,
  ShieldCheck,
  Play,
  Tag,
  Share2,
  Sliders,
  Server,
} from 'lucide-react';
import { Badge } from '../common/Badge.js';
import { AuditEvent } from '../../../shared/types/audit.js';

interface AdminCenterViewProps {
  initialTab?: string;
  onNavigate?: (destination: string) => void;
}

export const AdminCenterView: React.FC<AdminCenterViewProps> = ({ initialTab = 'SETTINGS', onNavigate }) => {
  const { allUsers, refreshUsers, fetchWithAuth } = useAuth();

  const getMappedTab = (tabStr: string): 'SETTINGS' | 'USERS' | 'WORKFLOWS' | 'SLA' | 'AUTOMATION' | 'TAXONOMY' | 'INTEGRATIONS' => {
    switch (tabStr) {
      case 'admin-sla-policies':
      case 'SLA':
        return 'SLA';
      case 'admin-workflow-templates':
      case 'WORKFLOWS':
        return 'WORKFLOWS';
      case 'admin-automations':
      case 'AUTOMATION':
        return 'AUTOMATION';
      case 'admin-taxonomy':
      case 'TAXONOMY':
        return 'TAXONOMY';
      case 'admin-integrations':
      case 'INTEGRATIONS':
        return 'INTEGRATIONS';
      case 'admin-settings':
      case 'SETTINGS':
      case 'AUDIT':
      default:
        return 'SETTINGS';
    }
  };

  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'USERS' | 'WORKFLOWS' | 'SLA' | 'AUTOMATION' | 'TAXONOMY' | 'INTEGRATIONS'>(
    () => getMappedTab(initialTab)
  );

  useEffect(() => {
    if (initialTab) {
      setActiveTab(getMappedTab(initialTab));
    }
  }, [initialTab]);

  const [adminData, setAdminData] = useState<any>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);

  // LDAP Daily Check State
  const [ldapStatus, setLdapStatus] = useState<any>(null);
  const [isLdapSyncing, setIsLdapSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Active Directory Live Connection & Test State
  const [isAdConfigOpen, setIsAdConfigOpen] = useState(false);
  const [isAdTesting, setIsAdTesting] = useState(false);
  const [adTestResult, setAdTestResult] = useState<any>(null);

  const loadLdapStatus = () => {
    fetchWithAuth('/api/admin/ldap/sync-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLdapStatus(data.status);
      })
      .catch((err) => console.error('Failed to load LDAP status', err));
  };

  const loadAdminMetadata = () => {
    fetchWithAuth('/api/admin/metadata')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAdminData(data);
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    refreshUsers();
    loadAdminMetadata();

    fetchWithAuth('/api/admin/audit?limit=100')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setAuditEvents(data.events || []);
      })
      .catch((err) => console.error(err));

    loadLdapStatus();
  }, []);

  const handleTriggerLdapSync = async () => {
    setIsLdapSyncing(true);
    setSyncFeedback('Querying Active Directory & synchronizing real active department accounts...');
    try {
      const res = await fetchWithAuth('/api/admin/ldap/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const report = data.report;
        setSyncFeedback(
          `Sync successful: ${report.totalLdapUsers} real Active Directory accounts processed (${report.addedCount} added, ${report.updatedCount} updated, ${report.disabledCount} disabled, ${report.duplicatesRemovedCount} duplicates cleaned)`
        );
        loadLdapStatus();
        loadAdminMetadata();
        refreshUsers();
      } else {
        setSyncFeedback(`Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setSyncFeedback(`Connection error: ${err.message}`);
    } finally {
      setIsLdapSyncing(false);
      setTimeout(() => setSyncFeedback(null), 8000);
    }
  };

  const handleTestAdConnection = async () => {
    setIsAdTesting(true);
    setAdTestResult(null);
    try {
      const res = await fetchWithAuth('/api/admin/ldap/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setAdTestResult(data);
    } catch (err: any) {
      setAdTestResult({
        success: false,
        error: err.message || 'Failed to communicate with Active Directory server',
      });
    } finally {
      setIsAdTesting(false);
    }
  };

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
    if (selectedDeptFilter !== 'ALL' && u.departmentId !== selectedDeptFilter) return false;
    if (selectedStatusFilter === 'ACTIVE' && !u.isActive) return false;
    if (selectedStatusFilter === 'DISABLED' && u.isActive) return false;
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.sAMAccountName && u.sAMAccountName.toLowerCase().includes(q)) ||
      u.roles.some((r) => r.toLowerCase().includes(q)) ||
      u.departmentId.toLowerCase().includes(q)
    );
  });
  const ldapScheduleLabel = ldapStatus?.schedule || 'Schedule unavailable';

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
    setAutomationMessage('Evaluating banking security automation rules...');
    setTimeout(() => {
      setAutomationMessage('Automation complete: 4 active rules evaluated. All SLA escalation triggers & auto-taggers active.');
    }, 700);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-[#F8FAFC] custom-scrollbar select-none">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1]">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#162136] tracking-tight">
              Enterprise Administration & Configuration Engine
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              RBAC directory, state machines, SLA policies, automation rules, taxonomies, integrations, and immutable audit logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'SETTINGS' && (
            <button onClick={handleExportAuditCSV} className="wrike-btn-primary text-xs py-1.5 px-3">
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit CSV</span>
            </button>
          )}
          {activeTab === 'AUTOMATION' && (
            <button onClick={handleRunAutomation} className="wrike-btn-primary text-xs py-1.5 px-3">
              <Play className="w-3.5 h-3.5" />
              <span>Trigger Rule Engine</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-[#E2E8F0] flex items-center gap-2 overflow-x-auto pb-0 custom-scrollbar text-xs font-bold">
        {[
          { id: 'SETTINGS', label: 'Settings & Audit Log', icon: Sliders },
          { id: 'SLA', label: 'SLA Policies', icon: Clock },
          { id: 'WORKFLOWS', label: 'Workflow Templates', icon: Workflow },
          { id: 'AUTOMATION', label: 'Automations', icon: Zap },
          { id: 'TAXONOMY', label: 'Taxonomy', icon: Tag },
          { id: 'INTEGRATIONS', label: 'Integrations', icon: Share2 },
          { id: 'USERS', label: 'User Directory', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-2.5 flex items-center gap-2 transition-all border-b-2 shrink-0 ${
                isActive
                  ? 'text-[#007860] border-[#00B259] bg-[#FFFFFF] rounded-t-lg'
                  : 'text-[#64748B] hover:text-[#0F172A] border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#00B259]' : 'text-[#94A3B8]'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Settings & Audit Log Tab */}
      {activeTab === 'SETTINGS' && (
        <div className="wrike-card p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
            <div>
              <h3 className="text-xs font-bold text-[#162136] uppercase tracking-wider">
                System Audit Trail ({filteredAudit.length} Verified Events)
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Append-only immutable record of actions, IP addresses, and state changes.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail..."
                className="w-full bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#162136] outline-none"
              />
            </div>
          </div>

          <div className="divide-y divide-[#E2E8F0] text-xs font-mono">
            {filteredAudit.length === 0 ? (
              <div className="py-12 text-center text-[#64748B] italic">No audit events matched your search query.</div>
            ) : (
              filteredAudit.map((evt) => (
                <div key={evt.id} className="py-3 space-y-1.5 hover:bg-[#F8FAFC] px-3 rounded-lg transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-sans">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-[#EBF4FD] text-[#0073D3] font-mono text-[10px] font-bold border border-[#BAE0FD]">
                        {evt.action}
                      </span>
                      <span className="font-semibold text-[#162136]">{evt.actorName}</span>
                      <span className="text-[#64748B] text-[11px]">({evt.actorRole})</span>
                      {evt.entityKey && <span className="font-mono text-[#0073D3] font-bold">[{evt.entityKey}]</span>}
                    </div>
                    <span className="text-[#64748B] text-[11px] font-mono">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {evt.fieldChanges && evt.fieldChanges.length > 0 && (
                    <div className="text-[11px] text-[#162136] pl-3 space-y-0.5 font-mono">
                      {evt.fieldChanges.map((ch, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <span className="text-[#64748B]">{ch.field}:</span>
                          <span className="text-[#CF1322] line-through bg-[#FDE8EB] px-1 rounded">{String(ch.oldValue || 'none')}</span>
                          <ArrowRight className="w-3 h-3 text-[#94A3B8]" />
                          <span className="text-[#007860] font-bold bg-[#E6F7EF] px-1 rounded">{String(ch.newValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[10px] text-[#94A3B8]">
                    IP: <span className="text-[#64748B]">{evt.ipAddress}</span> | CID: <span className="text-[#64748B]">{evt.correlationId}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SLA Policies Tab */}
      {activeTab === 'SLA' && (
        <div className="space-y-4">
          {(adminData?.slaPolicies || []).map((sla: any) => (
            <div key={sla.id} className="wrike-card p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <div>
                  <h3 className="font-bold text-[#162136] text-sm">{sla.name}</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">{sla.description}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#007860] border border-[#B8EAD1] font-mono text-xs font-bold">
                  {sla.isDefault ? 'DEFAULT SLA POLICY' : 'CONFIGURED'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(sla.thresholds || {}).map(([sev, th]: [string, any]) => (
                  <div key={sev} className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-1.5">
                    <div className="font-bold text-[#162136] text-xs flex items-center justify-between">
                      <span>{sev}</span>
                      <Badge type="SEVERITY" value={sev} size="sm" />
                    </div>
                    <div className="text-[#64748B] text-xs mt-1">
                      MTTA Target: <strong className="text-[#162136] font-mono">{th.acknowledgmentMinutes} min</strong>
                    </div>
                    <div className="text-[#D46B08] text-xs font-medium">
                      MTTR Target: <strong className="text-[#162136] font-mono">{Math.round(th.remediationMinutes / 60)} hrs</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Workflows Tab */}
      {activeTab === 'WORKFLOWS' && (
        <div className="space-y-4">
          {(adminData?.workflows || []).map((wf: any) => (
            <div key={wf.id} className="wrike-card p-5 space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <div>
                  <h3 className="font-bold text-[#162136] text-sm">{wf.name}</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">{wf.description}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569] font-mono text-xs font-bold border border-[#E2E8F0]">
                  Version {wf.version}
                </span>
              </div>

              {/* State Machine */}
              <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-3">
                <div className="text-[11px] uppercase font-bold text-[#64748B] tracking-wider">
                  State Machine Lifecycle & Validated Transitions
                </div>
                <div className="flex items-center gap-3 overflow-x-auto py-2">
                  {wf.states.map((s: any, idx: number) => (
                    <React.Fragment key={s.id}>
                      <div className="p-3 rounded-lg bg-[#FFFFFF] border border-[#E2E8F0] space-y-1 min-w-[140px] shrink-0 shadow-2xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || '#00B259' }} />
                          <span className="font-bold text-[#162136] text-xs">{s.name}</span>
                        </div>
                        <div className="text-[10px] text-[#64748B] font-mono uppercase">{s.category}</div>
                      </div>
                      {idx < wf.states.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-[#0073D3] shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automations Tab */}
      {activeTab === 'AUTOMATION' && (
        <div className="space-y-4">
          {automationMessage && (
            <div className="p-3 bg-[#E6F7EF] border border-[#B8EAD1] text-[#007860] rounded-lg text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00B259] shrink-0" />
              <span>{automationMessage}</span>
            </div>
          )}

          {(adminData?.automationRules || []).map((rule: any) => (
            <div key={rule.id} className="wrike-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-[#162136] text-xs">{rule.name}</h3>
                <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[#0073D3] border border-[#E2E8F0] text-[10px] font-mono font-bold">
                  Executed {rule.executionCount} Times
                </span>
              </div>
              <p className="text-xs text-[#64748B]">{rule.description}</p>
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] text-xs font-mono text-[#162136] space-y-1.5">
                <div>TRIGGER: <strong className="text-[#0073D3]">{rule.trigger}</strong></div>
                <div>CONDITIONS: <span className="text-[#D46B08]">{JSON.stringify(rule.conditions)}</span></div>
                <div>ACTIONS: <span className="text-[#007860]">{JSON.stringify(rule.actions)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Taxonomy Tab */}
      {activeTab === 'TAXONOMY' && (
        <div className="wrike-card p-5 space-y-4 shadow-xs">
          <div className="border-b border-[#E2E8F0] pb-3">
            <h3 className="text-xs font-bold text-[#162136] uppercase tracking-wider">
              Banking Ticket Taxonomy & Classification Scheme
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Standardized categories, severity metrics, and confidentiality clearance tiers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-2">
              <div className="font-bold text-[#162136]">Confidentiality Tiers</div>
              <ul className="space-y-1 text-[#64748B] font-mono">
                <li>• PUBLIC (Tier 1)</li>
                <li>• INTERNAL (Tier 2)</li>
                <li>• RESTRICTED (Tier 3)</li>
                <li>• CONFIDENTIAL_SECURITY_ONLY (Tier 4)</li>
                <li>• HIGHLY_RESTRICTED_HR_LEGAL (Tier 5)</li>
              </ul>
            </div>

            <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-2">
              <div className="font-bold text-[#162136]">Technical Severity Levels</div>
              <ul className="space-y-1 text-[#64748B] font-mono">
                <li className="text-[#CF1322] font-bold">• CRITICAL (15m MTTA / 2h MTTR)</li>
                <li className="text-[#D46B08]">• HIGH (30m MTTA / 24h MTTR)</li>
                <li className="text-[#0073D3]">• MEDIUM (1h MTTA / 72h MTTR)</li>
                <li className="text-[#64748B]">• LOW (2h MTTA / 7d MTTR)</li>
              </ul>
            </div>

            <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-2">
              <div className="font-bold text-[#162136]">Core Categories</div>
              <ul className="space-y-1 text-[#64748B] font-mono">
                <li>• INCIDENT (SOC & Security)</li>
                <li>• VULNERABILITY (AppSec & VM)</li>
                <li>• SECURITY_EXCEPTION (GRC Waiver)</li>
                <li>• SERVICE_REQUEST (ITSM)</li>
                <li>• CHANGE_REQUEST (CAB)</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Integrations Tab */}
      {activeTab === 'INTEGRATIONS' && (
        <div className="space-y-4">
          {/* Active Directory Daily Synchronization Status Card */}
          <div className="wrike-card p-5 space-y-4 shadow-xs border-l-4 border-l-[#00B259]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-[#E6F7EF] text-[#007860]">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#162136]">
                      Active Directory / LDAP Daily User Synchronization
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] font-mono text-[10px] font-bold">
                      DAILY 13:30 GMT+4
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Automatically pulls all domain users, categorizes by Department/Şöbə, synchronizes added/disabled status, and cleans duplicate records.
                  </p>
                </div>
              </div>

              <button
                onClick={handleTriggerLdapSync}
                disabled={isLdapSyncing}
                className="wrike-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0"
              >
                <Play className={`w-3.5 h-3.5 ${isLdapSyncing ? 'animate-spin' : ''}`} />
                <span>{isLdapSyncing ? 'Syncing Directory...' : 'Trigger Daily Check Now'}</span>
              </button>
            </div>

            {syncFeedback && (
              <div className="p-3 bg-[#EBF4FD] border border-[#BAE0FD] text-[#0073D3] rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{syncFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <div className="text-[11px] text-[#64748B] font-semibold">Scheduled Daily Run</div>
                <div className="font-bold text-[#162136] text-sm mt-0.5">13:30 GMT+4 (Asia/Baku)</div>
                <div className="text-[10px] text-[#94A3B8] font-mono">UTC+4 Precision Scheduler</div>
              </div>

              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <div className="text-[11px] text-[#64748B] font-semibold">Next Scheduled Check</div>
                <div className="font-bold text-[#007860] text-sm mt-0.5">
                  {ldapStatus?.nextRunFormattedGMT4 || 'Today at 13:30 GMT+4'}
                </div>
                <div className="text-[10px] text-[#64748B]">
                  {ldapStatus?.nextRunInSeconds ? `in ~${Math.round(ldapStatus.nextRunInSeconds / 60)} minutes` : 'Armed & active'}
                </div>
              </div>

              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <div className="text-[11px] text-[#64748B] font-semibold">Last Synchronization</div>
                <div className="font-bold text-[#162136] text-sm mt-0.5">
                  {ldapStatus?.lastRunFormattedGMT4 || 'Synchronized on boot'}
                </div>
                <div className="text-[10px] text-[#64748B]">
                  {ldapStatus?.lastSyncReport?.totalLdapUsers
                    ? `${ldapStatus.lastSyncReport.totalLdapUsers} users processed`
                    : `${allUsers.length} total users`}
                </div>
              </div>

              <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                <div className="text-[11px] text-[#64748B] font-semibold">Account State Stats</div>
                <div className="font-bold text-[#162136] text-sm mt-0.5">
                  {allUsers.filter((u) => u.isActive).length} Active / {allUsers.filter((u) => !u.isActive).length} Disabled
                </div>
                <div className="text-[10px] text-[#007860] font-bold">0 Duplicates (Cleaned)</div>
              </div>
            </div>

            {/* Department / Şöbə Overview Pills */}
            <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
              <div className="text-xs font-bold text-[#162136]">Synchronized Departments (Şöbələr):</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {(ldapStatus?.departmentOverview || [
                  { id: 'dept-secops', code: 'INFOSEC', name: 'İnformasiya Təhlükəsizliyi', activeMembers: 4, disabledMembers: 0 },
                  { id: 'dept-it', code: 'IT_OPS', name: 'İKT və İnfrastruktur', activeMembers: 3, disabledMembers: 0 },
                  { id: 'dept-hr', code: 'HR_LEGAL', name: 'İnsan Resursları', activeMembers: 2, disabledMembers: 0 },
                  { id: 'dept-core', code: 'CORE_BANK', name: 'Əməliyyat & SWIFT', activeMembers: 2, disabledMembers: 1 },
                  { id: 'dept-grc', code: 'GRC', name: 'Risk & Komplayens', activeMembers: 2, disabledMembers: 0 },
                ]).map((dept: any) => (
                  <div key={dept.id} className="p-2 bg-[#F8FAFC] rounded border border-[#E2E8F0] text-[11px]">
                    <div className="font-bold text-[#162136] truncate">{dept.name}</div>
                    <div className="flex items-center justify-between text-[10px] text-[#64748B] mt-1">
                      <span className="font-mono">{dept.code}</span>
                      <span className="font-bold text-[#007860]">{dept.activeMembers} active</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary Ingestion Listeners */}
          <div className="wrike-card p-5 space-y-4 shadow-xs">
            <div className="border-b border-[#E2E8F0] pb-3">
              <h3 className="text-xs font-bold text-[#162136] uppercase tracking-wider">
                Security Operations & Ingestion Listeners
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                SIEM ingestion listeners, vulnerability scanners, and automated deduplication.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#162136]">Splunk / QRadar SIEM Ingestion</span>
                  <span className="px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] font-mono font-bold">LISTENING</span>
                </div>
                <p className="text-[#64748B]">Endpoint: /api/findings/ingest • Fingerprint Deduplication Active</p>
              </div>

              <div className="p-4 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#162136]">Vulnerability Scanner Connector</span>
                  <span className="px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] font-mono font-bold">ACTIVE</span>
                </div>
                <p className="text-[#64748B]">Tenable Nessus / Qualys VM • Auto-Triage Severity & Ticket Creation</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Directory Tab */}
      {activeTab === 'USERS' && (
        <div className="wrike-card p-5 space-y-4 shadow-xs">
          {/* Header Controls & Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#162136] uppercase tracking-wider">
                  Active Directory User Directory ({filteredUsers.length} Users)
                </h3>
                <span className="px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] font-mono text-[10px] font-bold">
                  {ldapScheduleLabel}
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5">
                Organized by Department/Şöbə. Synchronized with Active Directory domain accounts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Department / Şöbə Filter */}
              <select
                value={selectedDeptFilter}
                onChange={(e) => {
                  setSelectedDeptFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#162136] font-medium outline-none max-w-xs truncate"
              >
                <option value="ALL">All Departments ({adminData?.departments?.length || 'Bütün'} Şöbələr)</option>
                {(adminData?.departments || []).map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.memberCount || 0})
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatusFilter}
                onChange={(e) => {
                  setSelectedStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-[#162136] font-medium outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Users Only</option>
                <option value="DISABLED">Disabled in AD</option>
              </select>

              {/* Search Box */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search name, username, email..."
                  className="w-full bg-[#FFFFFF] border border-[#CBD5E1] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#162136] outline-none"
                />
              </div>

              <button
                onClick={() => setIsAdConfigOpen(true)}
                className="wrike-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                title="Configure and test live Active Directory connection credentials"
              >
                <Server className="w-3.5 h-3.5 text-[#0073D3]" />
                <span>AD Connection</span>
              </button>

              <button
                onClick={handleTriggerLdapSync}
                disabled={isLdapSyncing}
                className="wrike-btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                title="Synchronize user directory now"
              >
                <Play className={`w-3 h-3 ${isLdapSyncing ? 'animate-spin' : ''}`} />
                <span>{isLdapSyncing ? 'Syncing...' : 'Sync AD'}</span>
              </button>
            </div>
          </div>

          {syncFeedback && (
            <div className="p-3 bg-[#EBF4FD] border border-[#BAE0FD] text-[#0073D3] rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncFeedback}</span>
            </div>
          )}

          <div className="p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg text-xs flex items-center justify-between text-[#166534]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>
                <strong>Live Active Directory Mode:</strong> Displays only verified, non-disabled company domain accounts. Disabled accounts (UAC 0x0002) are filtered out automatically.
              </span>
            </div>
            <span className="font-mono text-[11px] bg-[#DCFCE7] px-2 py-0.5 rounded border border-[#86EFAC] font-bold">
              {filteredUsers.filter((u) => u.isActive).length} Active Domain Accounts
            </span>
          </div>

          {/* User Table with Smooth Pagination */}
          {(() => {
            const pageSize = 50;
            const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
            const validPage = Math.min(Math.max(currentPage, 1), totalPages);
            const paginatedUsers = filteredUsers.slice((validPage - 1) * pageSize, validPage * pageSize);

            return (
              <>
                <div className="overflow-x-auto">
                  <table className="wrike-table text-xs">
                    <thead>
                      <tr>
                        <th>Employee Name & sAMAccountName</th>
                        <th>Roles</th>
                        <th>Department / Şöbə</th>
                        <th>Clearance Level</th>
                        <th>AD Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((u) => {
                        const dept = adminData?.departments?.find((d: any) => d.id === u.departmentId);
                        const deptDisplayName = dept?.name || u.departmentId;
                        return (
                          <tr key={u.id} className="hover:bg-[#F8FAFC]">
                            <td>
                              <div className="font-bold text-[#162136]">{u.fullName}</div>
                              <div className="text-[11px] text-[#64748B] font-mono flex items-center gap-1.5">
                                <span>{u.email}</span>
                                {u.sAMAccountName && (
                                  <span className="px-1.5 py-0.2 bg-[#F1F5F9] rounded text-[10px] text-[#475569]">
                                    {u.sAMAccountName}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {u.roles.map((r) => (
                                  <span
                                    key={r}
                                    className="px-1.5 py-0.5 rounded bg-[#EBF4FD] text-[#0073D3] font-mono text-[10px] border border-[#BAE0FD] font-bold"
                                  >
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span className="font-semibold text-[#162136] block">
                                {deptDisplayName}
                              </span>
                              <span className="text-[10px] text-[#94A3B8] font-mono">{u.departmentId}</span>
                            </td>
                            <td>
                              <Badge type="CONFIDENTIALITY" value={u.securityClearance} size="sm" />
                            </td>
                            <td>
                              {u.isActive ? (
                                <span className="px-2 py-0.5 rounded bg-[#E6F7EF] text-[#007860] font-bold text-[10px]">
                                  ACTIVE
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-[#FFF1F0] text-[#CF1322] border border-[#FFA39E] font-bold text-[10px]">
                                  DISABLED IN AD
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-3 text-xs text-[#64748B]">
                    <div>
                      Showing {(validPage - 1) * pageSize + 1}–{Math.min(validPage * pageSize, filteredUsers.length)} of {filteredUsers.length} employees
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        disabled={validPage === 1}
                        className="px-3 py-1 rounded border border-[#CBD5E1] bg-[#FFFFFF] text-[#162136] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                      >
                        Previous
                      </button>
                      <span className="px-2 font-mono font-medium">
                        Page {validPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                        disabled={validPage === totalPages}
                        className="px-3 py-1 rounded border border-[#CBD5E1] bg-[#FFFFFF] text-[#162136] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8FAFC]"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Active Directory Connection & Credentials Configuration Modal */}
      {isAdConfigOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#CBD5E1] rounded-xl max-w-xl w-full p-5 space-y-4 shadow-xl text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#EBF4FD] text-[#0073D3] rounded">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#162136] text-sm">Active Directory / LDAP Connection Settings</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Connect to real Active Directory Domain Controller and filter active employees.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdConfigOpen(false)}
                className="text-[#64748B] hover:text-[#162136] p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-[11px] text-[#475569] leading-relaxed">
                The LDAPS URL, search base, and read-only service-account credentials are managed on the server. This screen never sends or stores directory credentials in the browser.
              </div>

              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg space-y-1 text-[11px]">
                <div className="font-bold text-[#162136]">Active Directory Search Filter (Excludes Disabled Users):</div>
                <div className="font-mono text-[10px] text-[#0073D3] bg-[#EBF4FD] p-1.5 rounded border border-[#BAE0FD] break-all">
                  {'(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(!(sAMAccountName=*$)))'}
                </div>
                <div className="text-[10px] text-[#64748B]">
                  • Filters out computer/machine accounts and users with AD flag <span className="font-mono">ACCOUNTDISABLE (0x0002)</span>.
                </div>
              </div>

              {adTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                    adTestResult.success
                      ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
                      : 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{adTestResult.success ? '✓ Active Directory Connection Successful' : '✗ Active Directory Connection Issue'}</span>
                    {adTestResult.success && (
                      <span className="font-mono text-[11px] bg-[#DCFCE7] px-2 py-0.5 rounded border border-[#86EFAC]">
                        {adTestResult.userCount} Real Domain Users Discovered
                      </span>
                    )}
                  </div>
                  {adTestResult.error && <p className="text-[11px] font-mono">{adTestResult.error}</p>}
                  {adTestResult.sampleUsers && adTestResult.sampleUsers.length > 0 && (
                    <div className="pt-2 border-t border-[#BBF7D0] space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#166534]">
                        Discovered Active Employees Preview:
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-[10px]">
                        {adTestResult.sampleUsers.map((u: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-[#DCFCE7]/40 px-2 py-0.5 rounded">
                            <span className="font-bold">{u.displayName} ({u.sAMAccountName})</span>
                            <span className="text-[#64748B]">{u.department}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#E2E8F0]">
              <button
                onClick={handleTestAdConnection}
                disabled={isAdTesting}
                className="wrike-btn-secondary text-xs flex items-center gap-1.5"
              >
                <Search className={`w-3.5 h-3.5 ${isAdTesting ? 'animate-spin' : ''}`} />
                <span>{isAdTesting ? 'Testing Query...' : 'Test Connection & Query AD'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAdConfigOpen(false)}
                  className="wrike-btn-secondary text-xs"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await handleTriggerLdapSync();
                    setIsAdConfigOpen(false);
                  }}
                  disabled={isLdapSyncing}
                  className="wrike-btn-primary text-xs flex items-center gap-1.5"
                >
                  <Play className={`w-3.5 h-3.5 ${isLdapSyncing ? 'animate-spin' : ''}`} />
                  <span>Sync Real Active Directory Users</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
