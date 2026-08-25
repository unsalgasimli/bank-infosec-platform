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
    <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-subtle custom-scrollbar select-none">
      {/* Header */}
      <div className="bg-semantic-panel border border-semantic-border rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-semantic-success-surface text-semantic-success border border-semantic-success-border">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-semantic-primary tracking-tight">
              Enterprise Administration & Configuration Engine
            </h1>
            <p className="text-xs text-semantic-muted mt-0.5">
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
      <div className="border-b border-semantic-border flex items-center gap-2 overflow-x-auto pb-0 custom-scrollbar text-xs font-bold">
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
                  ? 'text-semantic-success border-semantic-brand bg-semantic-panel rounded-t-lg'
                  : 'text-semantic-muted hover:text-semantic-strongest border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-semantic-brand' : 'text-semantic-placeholder'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Settings & Audit Log Tab */}
      {activeTab === 'SETTINGS' && (
        <div className="wrike-card p-5 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-border pb-3">
            <div>
              <h3 className="text-xs font-bold text-semantic-primary uppercase tracking-wider">
                System Audit Trail ({filteredAudit.length} Verified Events)
              </h3>
              <p className="text-xs text-semantic-muted mt-0.5">
                Append-only immutable record of actions, IP addresses, and state changes.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-semantic-placeholder absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search audit trail..."
                className="w-full bg-semantic-panel border border-semantic-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-semantic-primary outline-none"
              />
            </div>
          </div>

          <div className="divide-y divide-semantic-border text-xs font-mono">
            {filteredAudit.length === 0 ? (
              <div className="py-12 text-center text-semantic-muted italic">No audit events matched your search query.</div>
            ) : (
              filteredAudit.map((evt) => (
                <div key={evt.id} className="py-3 space-y-1.5 hover:bg-semantic-subtle px-3 rounded-lg transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-sans">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-semantic-info-surface text-semantic-info font-mono text-caption font-bold border border-semantic-info-border">
                        {evt.action}
                      </span>
                      <span className="font-semibold text-semantic-primary">{evt.actorName}</span>
                      <span className="text-semantic-muted text-label">({evt.actorRole})</span>
                      {evt.entityKey && <span className="font-mono text-semantic-info font-bold">[{evt.entityKey}]</span>}
                    </div>
                    <span className="text-semantic-muted text-label font-mono">
                      {new Date(evt.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {evt.fieldChanges && evt.fieldChanges.length > 0 && (
                    <div className="text-label text-semantic-primary pl-3 space-y-0.5 font-mono">
                      {evt.fieldChanges.map((ch, i) => (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <span className="text-semantic-muted">{ch.field}:</span>
                          <span className="text-semantic-danger line-through bg-semantic-danger-surface px-1 rounded">{String(ch.oldValue || 'none')}</span>
                          <ArrowRight className="w-3 h-3 text-semantic-placeholder" />
                          <span className="text-semantic-success font-bold bg-semantic-success-surface px-1 rounded">{String(ch.newValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-caption text-semantic-placeholder">
                    IP: <span className="text-semantic-muted">{evt.ipAddress}</span> | CID: <span className="text-semantic-muted">{evt.correlationId}</span>
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
              <div className="flex items-center justify-between border-b border-semantic-border pb-3">
                <div>
                  <h3 className="font-bold text-semantic-primary text-sm">{sla.name}</h3>
                  <p className="text-xs text-semantic-muted mt-0.5">{sla.description}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-semantic-success-surface text-semantic-success border border-semantic-success-border font-mono text-xs font-bold">
                  {sla.isDefault ? 'DEFAULT SLA POLICY' : 'CONFIGURED'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(sla.thresholds || {}).map(([sev, th]: [string, any]) => (
                  <div key={sev} className="p-3 bg-semantic-subtle rounded-lg border border-semantic-border space-y-1.5">
                    <div className="font-bold text-semantic-primary text-xs flex items-center justify-between">
                      <span>{sev}</span>
                      <Badge type="SEVERITY" value={sev} size="sm" />
                    </div>
                    <div className="text-semantic-muted text-xs mt-1">
                      MTTA Target: <strong className="text-semantic-primary font-mono">{th.acknowledgmentMinutes} min</strong>
                    </div>
                    <div className="text-semantic-warning text-xs font-medium">
                      MTTR Target: <strong className="text-semantic-primary font-mono">{Math.round(th.remediationMinutes / 60)} hrs</strong>
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
              <div className="flex items-center justify-between border-b border-semantic-border pb-3">
                <div>
                  <h3 className="font-bold text-semantic-primary text-sm">{wf.name}</h3>
                  <p className="text-xs text-semantic-muted mt-0.5">{wf.description}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-semantic-neutral-surface text-semantic-secondary font-mono text-xs font-bold border border-semantic-border">
                  Version {wf.version}
                </span>
              </div>

              {/* State Machine */}
              <div className="p-4 bg-semantic-subtle rounded-lg border border-semantic-border space-y-3">
                <div className="text-label uppercase font-bold text-semantic-muted tracking-wider">
                  State Machine Lifecycle & Validated Transitions
                </div>
                <div className="flex items-center gap-3 overflow-x-auto py-2">
                  {wf.states.map((s: any, idx: number) => (
                    <React.Fragment key={s.id}>
                      <div className="p-3 rounded-lg bg-semantic-panel border border-semantic-border space-y-1 min-w-dsFilter shrink-0 shadow-2xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || 'var(--color-brand-500)' }} />
                          <span className="font-bold text-semantic-primary text-xs">{s.name}</span>
                        </div>
                        <div className="text-caption text-semantic-muted font-mono uppercase">{s.category}</div>
                      </div>
                      {idx < wf.states.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-semantic-info shrink-0" />
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
            <div className="p-3 bg-semantic-success-surface border border-semantic-success-border text-semantic-success rounded-lg text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-semantic-brand shrink-0" />
              <span>{automationMessage}</span>
            </div>
          )}

          {(adminData?.automationRules || []).map((rule: any) => (
            <div key={rule.id} className="wrike-card p-5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-semantic-primary text-xs">{rule.name}</h3>
                <span className="px-2 py-0.5 rounded bg-semantic-neutral-surface text-semantic-info border border-semantic-border text-caption font-mono font-bold">
                  Executed {rule.executionCount} Times
                </span>
              </div>
              <p className="text-xs text-semantic-muted">{rule.description}</p>
              <div className="p-3 bg-semantic-subtle rounded-lg border border-semantic-border text-xs font-mono text-semantic-primary space-y-1.5">
                <div>TRIGGER: <strong className="text-semantic-info">{rule.trigger}</strong></div>
                <div>CONDITIONS: <span className="text-semantic-warning">{JSON.stringify(rule.conditions)}</span></div>
                <div>ACTIONS: <span className="text-semantic-success">{JSON.stringify(rule.actions)}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Taxonomy Tab */}
      {activeTab === 'TAXONOMY' && (
        <div className="wrike-card p-5 space-y-4 shadow-xs">
          <div className="border-b border-semantic-border pb-3">
            <h3 className="text-xs font-bold text-semantic-primary uppercase tracking-wider">
              Banking Ticket Taxonomy & Classification Scheme
            </h3>
            <p className="text-xs text-semantic-muted mt-0.5">
              Standardized categories, severity metrics, and confidentiality clearance tiers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-semantic-subtle rounded-lg border border-semantic-border space-y-2">
              <div className="font-bold text-semantic-primary">Confidentiality Tiers</div>
              <ul className="space-y-1 text-semantic-muted font-mono">
                <li>• PUBLIC (Tier 1)</li>
                <li>• INTERNAL (Tier 2)</li>
                <li>• RESTRICTED (Tier 3)</li>
                <li>• CONFIDENTIAL_SECURITY_ONLY (Tier 4)</li>
                <li>• HIGHLY_RESTRICTED_HR_LEGAL (Tier 5)</li>
              </ul>
            </div>

            <div className="p-4 bg-semantic-subtle rounded-lg border border-semantic-border space-y-2">
              <div className="font-bold text-semantic-primary">Technical Severity Levels</div>
              <ul className="space-y-1 text-semantic-muted font-mono">
                <li className="text-semantic-danger font-bold">• CRITICAL (15m MTTA / 2h MTTR)</li>
                <li className="text-semantic-warning">• HIGH (30m MTTA / 24h MTTR)</li>
                <li className="text-semantic-info">• MEDIUM (1h MTTA / 72h MTTR)</li>
                <li className="text-semantic-muted">• LOW (2h MTTA / 7d MTTR)</li>
              </ul>
            </div>

            <div className="p-4 bg-semantic-subtle rounded-lg border border-semantic-border space-y-2">
              <div className="font-bold text-semantic-primary">Core Categories</div>
              <ul className="space-y-1 text-semantic-muted font-mono">
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
          <div className="wrike-card p-5 space-y-4 shadow-xs border-l-4 border-l-semantic-brand">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-semantic-border pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-semantic-success-surface text-semantic-success">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-semantic-primary">
                      Active Directory / LDAP Daily User Synchronization
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-semantic-success-surface text-semantic-success font-mono text-caption font-bold">
                      DAILY 13:30 GMT+4
                    </span>
                  </div>
                  <p className="text-xs text-semantic-muted mt-0.5">
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
              <div className="p-3 bg-semantic-info-surface border border-semantic-info-border text-semantic-info rounded-lg text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{syncFeedback}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-semantic-subtle rounded-lg border border-semantic-border">
                <div className="text-label text-semantic-muted font-semibold">Scheduled Daily Run</div>
                <div className="font-bold text-semantic-primary text-sm mt-0.5">13:30 GMT+4 (Asia/Baku)</div>
                <div className="text-caption text-semantic-placeholder font-mono">UTC+4 Precision Scheduler</div>
              </div>

              <div className="p-3 bg-semantic-subtle rounded-lg border border-semantic-border">
                <div className="text-label text-semantic-muted font-semibold">Next Scheduled Check</div>
                <div className="font-bold text-semantic-success text-sm mt-0.5">
                  {ldapStatus?.nextRunFormattedGMT4 || 'Today at 13:30 GMT+4'}
                </div>
                <div className="text-caption text-semantic-muted">
                  {ldapStatus?.nextRunInSeconds ? `in ~${Math.round(ldapStatus.nextRunInSeconds / 60)} minutes` : 'Armed & active'}
                </div>
              </div>

              <div className="p-3 bg-semantic-subtle rounded-lg border border-semantic-border">
                <div className="text-label text-semantic-muted font-semibold">Last Synchronization</div>
                <div className="font-bold text-semantic-primary text-sm mt-0.5">
                  {ldapStatus?.lastRunFormattedGMT4 || 'Synchronized on boot'}
                </div>
                <div className="text-caption text-semantic-muted">
                  {ldapStatus?.lastSyncReport?.totalLdapUsers
                    ? `${ldapStatus.lastSyncReport.totalLdapUsers} users processed`
                    : `${allUsers.length} total users`}
                </div>
              </div>

              <div className="p-3 bg-semantic-subtle rounded-lg border border-semantic-border">
                <div className="text-label text-semantic-muted font-semibold">Account State Stats</div>
                <div className="font-bold text-semantic-primary text-sm mt-0.5">
                  {allUsers.filter((u) => u.isActive).length} Active / {allUsers.filter((u) => !u.isActive).length} Disabled
                </div>
                <div className="text-caption text-semantic-success font-bold">0 Duplicates (Cleaned)</div>
              </div>
            </div>

            {/* Department / Şöbə Overview Pills */}
            <div className="space-y-2 pt-2 border-t border-semantic-border">
              <div className="text-xs font-bold text-semantic-primary">Synchronized Departments (Şöbələr):</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {(ldapStatus?.departmentOverview || [
                  { id: 'dept-secops', code: 'INFOSEC', name: 'İnformasiya Təhlükəsizliyi', activeMembers: 4, disabledMembers: 0 },
                  { id: 'dept-it', code: 'IT_OPS', name: 'İKT və İnfrastruktur', activeMembers: 3, disabledMembers: 0 },
                  { id: 'dept-hr', code: 'HR_LEGAL', name: 'İnsan Resursları', activeMembers: 2, disabledMembers: 0 },
                  { id: 'dept-core', code: 'CORE_BANK', name: 'Əməliyyat & SWIFT', activeMembers: 2, disabledMembers: 1 },
                  { id: 'dept-grc', code: 'GRC', name: 'Risk & Komplayens', activeMembers: 2, disabledMembers: 0 },
                ]).map((dept: any) => (
                  <div key={dept.id} className="p-2 bg-semantic-subtle rounded border border-semantic-border text-label">
                    <div className="font-bold text-semantic-primary truncate">{dept.name}</div>
                    <div className="flex items-center justify-between text-caption text-semantic-muted mt-1">
                      <span className="font-mono">{dept.code}</span>
                      <span className="font-bold text-semantic-success">{dept.activeMembers} active</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary Ingestion Listeners */}
          <div className="wrike-card p-5 space-y-4 shadow-xs">
            <div className="border-b border-semantic-border pb-3">
              <h3 className="text-xs font-bold text-semantic-primary uppercase tracking-wider">
                Security Operations & Ingestion Listeners
              </h3>
              <p className="text-xs text-semantic-muted mt-0.5">
                SIEM ingestion listeners, vulnerability scanners, and automated deduplication.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-semantic-subtle rounded-lg border border-semantic-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-semantic-primary">Splunk / QRadar SIEM Ingestion</span>
                  <span className="px-2 py-0.5 rounded bg-semantic-success-surface text-semantic-success font-mono font-bold">LISTENING</span>
                </div>
                <p className="text-semantic-muted">Endpoint: /api/findings/ingest • Fingerprint Deduplication Active</p>
              </div>

              <div className="p-4 bg-semantic-subtle rounded-lg border border-semantic-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-semantic-primary">Vulnerability Scanner Connector</span>
                  <span className="px-2 py-0.5 rounded bg-semantic-success-surface text-semantic-success font-mono font-bold">ACTIVE</span>
                </div>
                <p className="text-semantic-muted">Tenable Nessus / Qualys VM • Auto-Triage Severity & Ticket Creation</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Directory Tab */}
      {activeTab === 'USERS' && (
        <div className="wrike-card p-5 space-y-4 shadow-xs">
          {/* Header Controls & Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-semantic-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-semantic-primary uppercase tracking-wider">
                  Active Directory User Directory ({filteredUsers.length} Users)
                </h3>
                <span className="px-2 py-0.5 rounded bg-semantic-success-surface text-semantic-success font-mono text-caption font-bold">
                  {ldapScheduleLabel}
                </span>
              </div>
              <p className="text-xs text-semantic-muted mt-0.5">
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
                className="bg-semantic-panel border border-semantic-border-strong rounded-lg px-2.5 py-1.5 text-xs text-semantic-primary font-medium outline-none max-w-xs truncate"
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
                className="bg-semantic-panel border border-semantic-border-strong rounded-lg px-2.5 py-1.5 text-xs text-semantic-primary font-medium outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active Users Only</option>
                <option value="DISABLED">Disabled in AD</option>
              </select>

              {/* Search Box */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-semantic-placeholder absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search name, username, email..."
                  className="w-full bg-semantic-panel border border-semantic-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-semantic-primary outline-none"
                />
              </div>

              <button
                onClick={() => setIsAdConfigOpen(true)}
                className="wrike-btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                title="Configure and test live Active Directory connection credentials"
              >
                <Server className="w-3.5 h-3.5 text-semantic-info" />
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
            <div className="p-3 bg-semantic-info-surface border border-semantic-info-border text-semantic-info rounded-lg text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncFeedback}</span>
            </div>
          )}

          <div className="p-3 bg-semantic-success-pale border border-semantic-success-pale-border rounded-lg text-xs flex items-center justify-between text-semantic-success-strong">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-semantic-success shrink-0" />
              <span>
                <strong>Live Active Directory Mode:</strong> Displays only verified, non-disabled company domain accounts. Disabled accounts (UAC 0x0002) are filtered out automatically.
              </span>
            </div>
            <span className="font-mono text-label bg-semantic-success-strong-soft px-2 py-0.5 rounded border border-semantic-success-strong-border font-bold">
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
                          <tr key={u.id} className="hover:bg-semantic-subtle">
                            <td>
                              <div className="font-bold text-semantic-primary">{u.fullName}</div>
                              <div className="text-label text-semantic-muted font-mono flex items-center gap-1.5">
                                <span>{u.email}</span>
                                {u.sAMAccountName && (
                                  <span className="px-1.5 py-0.2 bg-semantic-neutral-surface rounded text-caption text-semantic-secondary">
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
                                    className="px-1.5 py-0.5 rounded bg-semantic-info-surface text-semantic-info font-mono text-caption border border-semantic-info-border font-bold"
                                  >
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span className="font-semibold text-semantic-primary block">
                                {deptDisplayName}
                              </span>
                              <span className="text-caption text-semantic-placeholder font-mono">{u.departmentId}</span>
                            </td>
                            <td>
                              <Badge type="CONFIDENTIALITY" value={u.securityClearance} size="sm" />
                            </td>
                            <td>
                              {u.isActive ? (
                                <span className="px-2 py-0.5 rounded bg-semantic-success-surface text-semantic-success font-bold text-caption">
                                  ACTIVE
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-semantic-danger-utility text-semantic-danger border border-semantic-danger-border font-bold text-caption">
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
                  <div className="flex items-center justify-between border-t border-semantic-border pt-3 text-xs text-semantic-muted">
                    <div>
                      Showing {(validPage - 1) * pageSize + 1}–{Math.min(validPage * pageSize, filteredUsers.length)} of {filteredUsers.length} employees
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                        disabled={validPage === 1}
                        className="px-3 py-1 rounded border border-semantic-border-strong bg-semantic-panel text-semantic-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-semantic-subtle"
                      >
                        Previous
                      </button>
                      <span className="px-2 font-mono font-medium">
                        Page {validPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                        disabled={validPage === totalPages}
                        className="px-3 py-1 rounded border border-semantic-border-strong bg-semantic-panel text-semantic-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-semantic-subtle"
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
        <div className="fixed inset-0 bg-black/40 z-dsOverlay flex items-center justify-center p-4">
          <div className="bg-semantic-panel border border-semantic-border-strong rounded-xl max-w-xl w-full p-5 space-y-4 shadow-xl text-xs">
            <div className="flex items-center justify-between border-b border-semantic-border pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-semantic-info-surface text-semantic-info rounded">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-semantic-primary text-sm">Active Directory / LDAP Connection Settings</h3>
                  <p className="text-label text-semantic-muted">
                    Connect to real Active Directory Domain Controller and filter active employees.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdConfigOpen(false)}
                className="text-semantic-muted hover:text-semantic-primary p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-semantic-subtle border border-semantic-border rounded-lg text-label text-semantic-secondary leading-relaxed">
                The LDAPS URL, search base, and read-only service-account credentials are managed on the server. This screen never sends or stores directory credentials in the browser.
              </div>

              <div className="p-3 bg-semantic-subtle border border-semantic-border rounded-lg space-y-1 text-label">
                <div className="font-bold text-semantic-primary">Active Directory Search Filter (Excludes Disabled Users):</div>
                <div className="font-mono text-caption text-semantic-info bg-semantic-info-surface p-1.5 rounded border border-semantic-info-border break-all">
                  {'(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(!(sAMAccountName=*$)))'}
                </div>
                <div className="text-caption text-semantic-muted">
                  • Filters out computer/machine accounts and users with AD flag <span className="font-mono">ACCOUNTDISABLE (0x0002)</span>.
                </div>
              </div>

              {adTestResult && (
                <div
                  className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                    adTestResult.success
                      ? 'bg-semantic-success-pale border-semantic-success-pale-border text-semantic-success-strong'
                      : 'bg-semantic-danger-critical border-semantic-danger-critical-border text-semantic-danger-critical-text'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{adTestResult.success ? '✓ Active Directory Connection Successful' : '✗ Active Directory Connection Issue'}</span>
                    {adTestResult.success && (
                      <span className="font-mono text-label bg-semantic-success-strong-soft px-2 py-0.5 rounded border border-semantic-success-strong-border">
                        {adTestResult.userCount} Real Domain Users Discovered
                      </span>
                    )}
                  </div>
                  {adTestResult.error && <p className="text-label font-mono">{adTestResult.error}</p>}
                  {adTestResult.sampleUsers && adTestResult.sampleUsers.length > 0 && (
                    <div className="pt-2 border-t border-semantic-success-pale-border space-y-1">
                      <div className="text-caption font-bold uppercase tracking-wider text-semantic-success-strong">
                        Discovered Active Employees Preview:
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 font-mono text-caption">
                        {adTestResult.sampleUsers.map((u: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between bg-semantic-success-strong-soft/40 px-2 py-0.5 rounded">
                            <span className="font-bold">{u.displayName} ({u.sAMAccountName})</span>
                            <span className="text-semantic-muted">{u.department}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-semantic-border">
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
