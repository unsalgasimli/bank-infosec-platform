import { useEffect, useRef, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Edit3, GitMerge, Loader2, Play, PlugZap, Plus, RefreshCw, ServerCog, ShieldAlert, TestTube2, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { ActiveDirectoryConnectorModal } from './ActiveDirectoryConnectorModal.js';
import { CortexConnectorModal } from './CortexConnectorModal.js';
import { ReconciliationWorkbench } from './ReconciliationWorkbench.js';

type AdminMode = 'sources' | 'runs' | 'correlation';
type FormState = { connectionId: string; name: string; description: string; environment: string; endpointFqdn: string; port: string; username: string; password: string; tlsCaReference: string; tlsVerifyCertificates: boolean; enabled: boolean };
const emptyForm: FormState = { connectionId: '', name: '', description: '', environment: 'PROD', endpointFqdn: '', port: '443', username: '', password: '', tlsCaReference: '', tlsVerifyCertificates: true, enabled: false };
const isoLabel = (value?: string) => value ? new Date(value).toLocaleString() : '—';
const healthClass = (status?: string) => status === 'HEALTHY' ? 'text-semantic-success' : status === 'DEGRADED' ? 'text-amber-600' : status === 'UNHEALTHY' ? 'text-semantic-danger' : 'text-semantic-muted';
const connectorLabel = (connectorType?: string) => connectorType === 'ACTIVE_DIRECTORY' ? 'Active Directory' : connectorType === 'CORTEX' ? 'Palo Alto Cortex' : connectorType === 'VCENTER' ? 'VMware vCenter' : connectorType || 'Unknown';
const connectorEndpoint = (connector: any) => {
  if (connector.connectorType === 'VCENTER') return connector.vcenter?.endpointFqdn ? `${connector.vcenter.endpointFqdn}:${connector.vcenter.port || 443}` : '—';
  if (connector.connectorType === 'ACTIVE_DIRECTORY') return connector.nonSecretConfiguration?.url || '—';
  if (connector.connectorType === 'CORTEX') return connector.nonSecretConfiguration?.endpointUrl || '—';
  return '—';
};
const connectorVersion = (connector: any) => connector.vcenter?.detectedVersion || connector.detectedVersion || (connector.connectorType === 'ACTIVE_DIRECTORY' ? 'LDAPS' : connector.connectorType === 'CORTEX' ? 'HTTPS API' : undefined);
const DISCOVERY_STATUS_CHANGED = 'aegis:discovery-status-changed';
const runFailureReason = (run: any): string | undefined => {
  if (!Array.isArray(run.errors)) return undefined;
  const messages = run.errors.map((entry: unknown) => typeof entry === 'string' ? entry : entry && typeof entry === 'object' && 'message' in entry ? String((entry as { message?: unknown }).message || '') : '').filter(Boolean);
  return messages.length ? messages.join(' ') : undefined;
};
async function discoveryJson(response: Response): Promise<any> {
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; }
  catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(`Discovery API returned a non-JSON response (${response.status}, ${contentType}). Check the API route and active server instance.`);
  }
}
async function requestDiscovery(fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>, url: string, options?: RequestInit): Promise<{ response: Response; data: any }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithAuth(url, { ...options, cache: 'no-store' });
      return { response, data: await discoveryJson(response) };
    } catch (error) {
      lastError = error;
      // Vite can briefly serve its SPA fallback while its proxy reconnects
      // after a local API/dev-server restart. Retry only that non-JSON 404,
      // never authentication or server JSON errors.
      if (!(error instanceof Error && error.message.includes('(404,')) || attempt === 2) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Discovery API request failed.');
}
function discoveryFailureMessage(response: Response, data: any, fallback: string): string {
  const message = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : fallback;
  const code = typeof data?.code === 'string' && data.code.trim() ? data.code.trim() : '';
  // Error codes are intentionally safe, operator-facing diagnostics returned
  // by the API. Do not render arbitrary server details in the browser.
  if (code && !message.includes(code)) return `${message} (${code})`;
  if (!response.ok && /^CMDB operation failed\.?$/i.test(message)) return `${message} (HTTP ${response.status}; the API did not return an operator-safe cause.)`;
  if (!response.ok && !data?.error) return `${message} (HTTP ${response.status})`;
  return message;
}

export const DiscoveryAdminView: React.FC<{ mode: AdminMode; onNavigateToRuns?: (connectorId: string) => void }> = ({ mode, onNavigateToRuns }) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<any[]>([]); const [connectors, setConnectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [selectedConnector, setSelectedConnector] = useState(''); const [page, setPage] = useState(1); const [total, setTotal] = useState(0); const pageSize = 25;
  const [formOpen, setFormOpen] = useState(false); const [adFormOpen, setAdFormOpen] = useState(false); const [cortexFormOpen, setCortexFormOpen] = useState(false); const [editingManagedConnector, setEditingManagedConnector] = useState<any | null>(null); const [editing, setEditing] = useState<any | null>(null); const [form, setForm] = useState<FormState>(emptyForm); const [saving, setSaving] = useState(false); const [formError, setFormError] = useState(''); const [actionId, setActionId] = useState(''); const [health, setHealth] = useState<any | null>(null); const [testResult, setTestResult] = useState<any | null>(null); const [coverage, setCoverage] = useState<any | null>(null);
  const latestLoadId = useRef(0);

  const replaceChangedItems = (incoming: any[]) => {
    setItems((current) => {
      if (current.length !== incoming.length) return incoming;
      let changed = false;
      const next = incoming.map((item, index) => {
        const previous = current[index];
        const same = previous?.id === item?.id
          && previous?.state === item?.state
          && previous?.discoveredCount === item?.discoveredCount
          && previous?.failedCount === item?.failedCount
          && previous?.createdCount === item?.createdCount
          && previous?.updatedCount === item?.updatedCount
          && previous?.unchangedCount === item?.unchangedCount
          && previous?.unmatchedCount === item?.unmatchedCount
          && previous?.staleCandidateCount === item?.staleCandidateCount
          && previous?.queuedAt === item?.queuedAt
          && previous?.startedAt === item?.startedAt
          && previous?.completedAt === item?.completedAt;
        if (!same) changed = true;
        return same ? previous : item;
      });
      return changed ? next : current;
    });
  };

  const load = async (background = false) => {
    const loadId = ++latestLoadId.current;
    if (!background) { setLoading(true); setError(''); }
    try {
      if (mode === 'runs' && connectors.length === 0) { const { response, data } = await requestDiscovery(fetchWithAuth, '/api/cmdb/discovery/connectors'); if (response.ok && data.success) setConnectors((data.connectors || []).filter((item: any) => ['VCENTER', 'ACTIVE_DIRECTORY', 'CORTEX'].includes(item.connectorType))); }
      const endpoint = mode === 'sources' ? '/api/cmdb/discovery/connectors' : mode === 'correlation' ? `/api/cmdb/discovery/evidence?page=${page}&pageSize=${pageSize}` : selectedConnector ? `/api/cmdb/discovery/connectors/${encodeURIComponent(selectedConnector)}/runs?limit=${pageSize}` : null;
      if (!endpoint) { setItems([]); return; }
      const { response, data } = await requestDiscovery(fetchWithAuth, endpoint); if (!response.ok || !data.success) throw new Error(data.error || t('Could not load discovery data.'));
      if (mode === 'sources') {
        const discovery = (data.connectors || []).filter((item: any) => ['VCENTER', 'ACTIVE_DIRECTORY', 'CORTEX'].includes(item.connectorType));
        setItems(discovery); setConnectors(discovery);
        // Coverage is supplementary posture data. Do not discard already-loaded
        // connectors or show an alarming API error while an API process reloads.
        try {
          const coverageResponse = await requestDiscovery(fetchWithAuth, '/api/cmdb/discovery/coverage');
          if (coverageResponse.response.ok && coverageResponse.data.success) setCoverage(coverageResponse.data);
        } catch { setCoverage(null); }
      } else {
        // Polling can overlap when the API or worker is busy. Ignore an older
        // response so a stale state/count cannot overwrite the newest values.
        if (loadId !== latestLoadId.current) return;
        replaceChangedItems(data.items || data.runs || []);
        setTotal(Number(data.total || data.items?.length || 0));
      }
      window.dispatchEvent(new CustomEvent(DISCOVERY_STATUS_CHANGED));
    } catch (cause) { if (!background) setError(cause instanceof Error ? cause.message : t('Could not load discovery data.')); } finally { if (!background) setLoading(false); }
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { void load(); }, [mode, selectedConnector, page]);
  const hasActiveRuns = mode === 'runs' && items.some((item) => item.state === 'QUEUED' || item.state === 'RUNNING');
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadRef.current(true);
    }, hasActiveRuns ? 2500 : 15000);
    return () => window.clearInterval(interval);
  }, [mode, hasActiveRuns]);
  useEffect(() => { if (mode !== 'runs') return; const handler = (event: Event) => { const connectorId = (event as CustomEvent<string>).detail; if (connectorId) setSelectedConnector(connectorId); }; window.addEventListener('aegis:discovery-select-connector', handler); return () => window.removeEventListener('aegis:discovery-select-connector', handler); }, [mode]);

  const title = mode === 'sources' ? t('Discovery Sources') : mode === 'runs' ? t('Inventory Sync Runs') : t('Evidence & Correlation');
  const healthySources = connectors.filter((connector) => connector.enabled && connector.healthStatus === 'HEALTHY').length;
  const enabledSources = connectors.filter((connector) => connector.enabled).length;
  const unmatchedEvidence = items.filter((item) => !item.correlationOutcome || item.correlationOutcome === 'NO_MATCH').length;
  const openCreate = () => { setEditing(null); setNotice(''); setError(''); setFormError(''); setForm({ ...emptyForm, connectionId: '' }); setFormOpen(true); };
  const openEdit = (connector: any) => { if (connector.connectorType !== 'VCENTER') { setEditingManagedConnector(connector); if (connector.connectorType === 'ACTIVE_DIRECTORY') setAdFormOpen(true); else setCortexFormOpen(true); return; } setEditing(connector); setNotice(''); setError(''); setFormError(''); setForm({ connectionId: connector.connectionId || '', name: connector.name || '', description: connector.description || '', environment: connector.environment || 'UNKNOWN', endpointFqdn: connector.vcenter?.endpointFqdn || '', port: String(connector.vcenter?.port || 443), username: '', password: '', tlsCaReference: '', tlsVerifyCertificates: connector.tlsVerifyCertificates !== false, enabled: Boolean(connector.enabled) }); setFormOpen(true); };
  const bootstrapActiveDirectory = async () => {
    setActionId('bootstrap-active-directory'); setError(''); setNotice('');
    try { const { response, data } = await requestDiscovery(fetchWithAuth, '/api/cmdb/discovery/connectors/bootstrap-active-directory', { method: 'POST', headers: { 'Content-Type': 'application/json' } }); if (!response.ok || !data.success) throw new Error(data.error || t('Could not configure Active Directory.')); setNotice(data.created ? t('Active Directory source was configured. Choose it in Inventory Sync Runs and run a full sync.') : t('Existing Active Directory source is ready in Inventory Sync Runs.')); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not configure Active Directory.')); } finally { setActionId(''); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setFormError(''); setSaving(true);
    try {
      const body: any = { ...(editing ? { version: Number(editing.version) } : {}), ...(form.connectionId ? { connectionId: form.connectionId } : {}), name: form.name, description: form.description, connectorType: 'VCENTER', environment: form.environment, endpointFqdn: form.endpointFqdn, port: Number(form.port || 443), tlsVerifyCertificates: form.tlsVerifyCertificates, enabled: form.enabled, requestTimeoutMs: 30000, responseSizeLimitBytes: 4194304, endpointAllowPrivateNetwork: true };
      if (!editing || form.username || form.password) { body.username = form.username.trim(); body.password = form.password; } if (form.tlsCaReference.trim()) body.tlsCaReference = form.tlsCaReference.trim();
      const { response, data } = await requestDiscovery(fetchWithAuth, editing ? `/api/cmdb/discovery/connectors/${encodeURIComponent(editing.id)}` : '/api/cmdb/discovery/connectors', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok || !data.success) throw new Error(discoveryFailureMessage(response, data, t('Could not save connector.')));
      const persisted = data.connector;
      if (persisted?.id) {
        setItems((current) => current.map((item) => item.id === persisted.id ? persisted : item));
        setConnectors((current) => current.map((item) => item.id === persisted.id ? persisted : item));
        setEditing(persisted);
      }
      setFormOpen(false); setFormError(''); setNotice(editing ? t('vCenter connector updated.') : t('vCenter connector added.')); await load();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : t('Could not save connector.')); } finally { setSaving(false); }
  };
  const runAction = async (connector: any, action: 'enable' | 'disable' | 'test-connection' | 'health') => {
    setActionId(`${connector.id}:${action}`); setError(''); setNotice('');
    try { const { response, data } = await requestDiscovery(fetchWithAuth, `/api/cmdb/discovery/connectors/${encodeURIComponent(connector.id)}/${action}`, { method: action === 'health' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' } }); if (!response.ok || !data.success) { if (data.details) setTestResult(data.details); throw new Error(data.error || t('Connector action failed.')); } if (action === 'health') setHealth(data); else { if (action === 'test-connection') setTestResult(data.snapshot?.testResult); setNotice(action === 'test-connection' ? t('Connection test completed successfully.') : t('Connector state updated.')); await load(); } } catch (cause) { setError(cause instanceof Error ? cause.message : t('Connector action failed.')); } finally { setActionId(''); }
  };
  const runSync = async (connector: any, syncType: 'FULL' | 'INCREMENTAL' = 'FULL') => {
    setActionId(`${connector.id}:sync:${syncType}`); setError(''); setNotice('');
    try { const { response, data } = await requestDiscovery(fetchWithAuth, `/api/cmdb/discovery/connectors/${encodeURIComponent(connector.id)}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ syncType }) }); if (!response.ok || !data.success) throw new Error(data.error || t('Inventory sync could not be queued.')); setNotice(`${syncType === 'FULL' ? t('Full inventory sync queued.') : t('Incremental inventory sync queued.')} ${data.runId || ''}`.trim()); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('Inventory sync failed.')); } finally { setActionId(''); }
  };
  const removeConnector = async (connector: any) => {
    if (!window.confirm(`${t('Delete')} ${connector.name}?`)) return;
    setActionId(`${connector.id}:delete`); setError(''); setNotice('');
    try {
      const { response, data } = await requestDiscovery(fetchWithAuth, `/api/cmdb/discovery/connectors/${encodeURIComponent(connector.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: Number(connector.version) }) });
      if (!response.ok || !data.success) throw new Error(data.error || t('Could not delete connector.'));
      setNotice(t('Connector deleted.')); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not delete connector.')); }
    finally { setActionId(''); }
  };

  return <div className="flex-1 overflow-y-auto w-full p-6 space-y-5 bg-semantic-subtle custom-scrollbar">
    {mode === 'correlation' && <ReconciliationWorkbench fetchWithAuth={fetchWithAuth} t={t} />}
    <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-semantic-info"><ServerCog className="w-5 h-5" /><span className="text-xs font-bold uppercase tracking-wider">{t('Assets & CMDB')}</span></div><h1 className="text-xl font-bold text-semantic-primary mt-1">{title}</h1><p className="text-xs text-semantic-muted mt-1">{mode === 'sources' ? t('Connector-scoped infrastructure and identity evidence. Secrets stay server-side; discovery never bypasses correlation.') : mode === 'runs' ? t('Auditable, connector-scoped inventory execution history.') : t('Read-only source evidence awaiting governed CMDB correlation.')}</p>{!loading && <p className="mt-1 text-xs text-semantic-muted">{hasActiveRuns ? t('Live updates every 2.5 seconds while a sync is running.') : t('Live updates are enabled.')}</p>}</div><div className="flex gap-2"><button onClick={() => void load()} className="jira-btn-subtle"><RefreshCw className="w-4 h-4" />{t('Refresh')}</button>{mode === 'sources' && <><button onClick={() => void bootstrapActiveDirectory()} disabled={Boolean(actionId)} className="jira-btn-primary"><Plus className="w-4 h-4" />{t('Use existing Active Directory')}</button><button onClick={() => setAdFormOpen(true)} className="jira-btn-subtle"><Plus className="w-4 h-4" />{t('Add Active Directory')}</button><button onClick={() => setCortexFormOpen(true)} className="jira-btn-subtle"><Plus className="w-4 h-4" />{t('Add Cortex')}</button><button onClick={openCreate} className="jira-btn-subtle"><Plus className="w-4 h-4" />{t('Add vCenter')}</button></>}</div></div>
    {notice && <div className="wrike-card p-3 text-semantic-success flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4" />{notice}</div>}{error && !formOpen && <div className="wrike-card p-4 text-semantic-danger flex gap-2 text-sm"><AlertCircle className="w-4 h-4" />{error}</div>}
    {mode === 'sources' && connectors.some((connector) => connector.latestRun) && <div className="wrike-card flex flex-wrap gap-x-6 gap-y-2 p-3 text-xs text-semantic-muted">{connectors.filter((connector) => connector.latestRun).map((connector) => <span key={`${connector.id}:latest-run`}><strong className="text-semantic-primary">{connector.name}:</strong> {connector.latestRun.state} • {connector.latestRun.discoveredCount ?? 0} {t('discovered')} / {connector.latestRun.failedCount ?? 0} {t('failed')}</span>)}</div>}
    {!loading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{mode === 'sources' ? <><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Canonical assets')}</div><div className="mt-1 text-2xl font-bold text-semantic-primary">{coverage?.totalCanonicalAssets ?? 0}</div></div><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Cortex coverage')}</div><div className="mt-1 text-2xl font-bold text-semantic-success">{coverage?.cortexCoveragePercent ?? 0}%</div><div className="text-xs text-semantic-muted">{coverage?.cortexManaged ?? 0} {t('managed')} · {coverage?.cortexStale ?? 0} {t('stale')}</div></div><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Reconciliation required')}</div><div className="mt-1 text-2xl font-bold text-amber-600">{(coverage?.reconciliationRequired ?? 0) + (coverage?.identityConflicts ?? 0)}</div><div className="text-xs text-semantic-muted">{coverage?.adWithoutCortex ?? 0} AD {t('without Cortex')}</div></div></> : mode === 'runs' ? <><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Visible runs')}</div><div className="mt-1 text-2xl font-bold text-semantic-primary">{total}</div></div><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Latest discovered')}</div><div className="mt-1 text-2xl font-bold text-semantic-success">{items[0]?.discoveredCount ?? 0}</div></div><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Latest failed')}</div><div className="mt-1 text-2xl font-bold text-semantic-danger">{items[0]?.failedCount ?? 0}</div></div></> : <><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Evidence records')}</div><div className="mt-1 text-2xl font-bold text-semantic-primary">{total}</div></div><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Awaiting correlation')}</div><div className="mt-1 text-2xl font-bold text-amber-600">{unmatchedEvidence}</div></div><div className="wrike-card p-4"><div className="text-xs font-medium uppercase tracking-wide text-semantic-muted">{t('Correlated')}</div><div className="mt-1 text-2xl font-bold text-semantic-success">{Math.max(0, items.length - unmatchedEvidence)}</div></div></>}</div>}
    {mode === 'runs' && !loading && !connectors.some((connector) => connector.connectorType === 'ACTIVE_DIRECTORY') && <div className="wrike-card flex flex-wrap items-center justify-between gap-4 border-semantic-info/30 p-4"><div><div className="font-semibold text-semantic-primary">{t('Active Directory asset discovery is not configured')}</div><p className="mt-1 text-sm text-semantic-muted">{t('Use the existing read-only LDAPS source to ingest computer assets into CMDB. User synchronization remains separate.')}</p></div><div className="flex gap-2"><button onClick={() => void bootstrapActiveDirectory()} disabled={Boolean(actionId)} className="jira-btn-primary"><Play className="h-4 w-4" />{t('Use existing AD')}</button><button onClick={() => setAdFormOpen(true)} className="jira-btn-subtle">{t('Configure LDAPS')}</button></div></div>}
    {mode === 'runs' && <div className="wrike-card flex flex-wrap items-center gap-3 p-3"><label className="text-xs text-semantic-muted">{t('Connector')}<select value={selectedConnector} onChange={(event) => { setSelectedConnector(event.target.value); setPage(1); }} className="jira-input ml-2"><option value="">{t('Select a connector')}</option>{connectors.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>{selectedConnector && <><button onClick={() => void runSync(connectors.find((item) => item.id === selectedConnector), 'FULL')} disabled={Boolean(actionId)} className="jira-btn-primary"><Play className="w-4 h-4" />{t('Run full sync')}</button><button onClick={() => void runSync(connectors.find((item) => item.id === selectedConnector), 'INCREMENTAL')} disabled={Boolean(actionId)} className="jira-btn-subtle"><RefreshCw className="w-4 h-4" />{t('Run incremental sync')}</button></>}{!selectedConnector && <p className="text-xs text-semantic-muted">{t('Choose a connector to inspect or queue inventory sync.')}</p>}</div>}
    <div className="wrike-card overflow-x-auto"><table className="w-full text-sm"><thead className="bg-semantic-subtle text-semantic-muted text-xs uppercase"><tr>{mode === 'sources' ? <><th className="text-left p-3">{t('Name')}</th><th className="text-left p-3">{t('Source type')}</th><th className="text-left p-3">{t('Environment')}</th><th className="text-left p-3">{t('Version')}</th><th className="text-left p-3">{t('Health')}</th><th className="text-left p-3">{t('Last Success')}</th><th className="text-left p-3">{t('Actions')}</th></> : mode === 'runs' ? <><th className="text-left p-3">{t('Run')}</th><th className="text-left p-3">{t('State')}</th><th className="text-left p-3">{t('Discovered')}</th><th className="text-left p-3">{t('Failed')}</th><th className="text-left p-3">{t('Queued')}</th></> : <><th className="text-left p-3">{t('Object')}</th><th className="text-left p-3">{t('Source')}</th><th className="text-left p-3">{t('Evidence state')}</th><th className="text-left p-3">{t('Correlation')}</th><th className="text-left p-3">{t('Last seen')}</th></>}</tr></thead><tbody>{loading ? <tr><td colSpan={7} className="p-10 text-center text-semantic-muted">{t('Loading persisted discovery data…')}</td></tr> : items.length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-semantic-muted">{t('No records found.')}</td></tr> : items.map((item) => <tr key={item.id} className="border-t border-semantic-border">{mode === 'sources' ? <><td className="p-3"><div className="font-medium">{item.name || item.id}</div><div className="max-w-72 truncate text-micro text-semantic-muted" title={connectorEndpoint(item)}>{connectorEndpoint(item)}</div></td><td className="p-3 text-xs">{connectorLabel(item.connectorType)}</td><td className="p-3">{item.environment}</td><td className="p-3">{connectorVersion(item) || t('Unknown')}</td><td className={`p-3 ${healthClass(item.healthStatus)}`}>{item.enabled ? <><CheckCircle2 className="mr-1 inline h-4 w-4" />{item.healthStatus}</> : t('Disabled')}</td><td className="p-3 text-xs">{isoLabel(item.vcenter?.lastSuccessfulConnectionAt || item.lastSuccessfulSyncAt)}</td><td className="p-3"><div className="flex flex-wrap gap-1"><button title={t('Run inventory sync')} onClick={() => void runSync(item)} disabled={!item.enabled || Boolean(actionId)} className="jira-btn-primary p-1.5"><Play className="w-3.5 h-3.5" /></button><button title={t('Connector Health')} onClick={() => void runAction(item, 'health')} disabled={Boolean(actionId)} className="jira-btn-subtle p-1.5"><ShieldAlert className="w-3.5 h-3.5" /></button><button title={t('Edit')} onClick={() => openEdit(item)} className="jira-btn-subtle p-1.5"><Edit3 className="w-3.5 h-3.5" /></button><button title={item.enabled ? t('Disable') : t('Enable')} onClick={() => void runAction(item, item.enabled ? 'disable' : 'enable')} disabled={Boolean(actionId)} className="jira-btn-subtle p-1.5">{item.enabled ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}</button><button title={t('Test Connection')} onClick={() => void runAction(item, 'test-connection')} disabled={Boolean(actionId)} className="jira-btn-subtle p-1.5"><TestTube2 className="w-3.5 h-3.5" /></button><button title={t('View Runs')} onClick={() => onNavigateToRuns?.(item.id)} className="jira-btn-subtle p-1.5"><Activity className="w-3.5 h-3.5" /></button><button title={t('Delete')} onClick={() => void removeConnector(item)} disabled={Boolean(actionId)} className="jira-btn-subtle p-1.5 text-semantic-danger"><Trash2 className="w-3.5 h-3.5" /></button></div></td></> : mode === 'runs' ? <><td className="p-3 font-medium">{item.id}</td><td className="p-3">{item.state}</td><td className="p-3">{item.discoveredCount ?? 0}</td><td className="p-3">{item.failedCount ?? 0}</td><td className="p-3 text-xs">{isoLabel(item.queuedAt)}</td></> : <><td className="p-3"><div className="font-medium">{item.name || item.objectId}</div><div className="text-micro text-semantic-muted">{item.objectType}</div></td><td className="p-3">{item.connectorName}</td><td className="p-3">{item.status}</td><td className="p-3">{item.correlationOutcome || 'NO_MATCH'}</td><td className="p-3 text-xs">{isoLabel(item.lastSeenAt)}</td></>}</tr>)}</tbody></table>{mode !== 'sources' && <div className="flex justify-between p-3 border-t border-semantic-border text-xs text-semantic-muted"><span>{total} {t('records')}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="jira-btn-subtle disabled:opacity-40">{t('Previous')}</button><button disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)} className="jira-btn-subtle disabled:opacity-40">{t('Next')}</button></div></div>}</div>
    {mode === 'runs' && items.length > 0 && <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{items.map((item) => <div key={`${item.id}:counts`} className="wrike-card p-3 text-xs"><div className="mb-2 font-medium text-semantic-primary">{item.id}</div><div className="grid grid-cols-3 gap-2 text-semantic-muted"><span>{t('Seen')}: {item.discoveredCount ?? 0}</span><span>{t('Created')}: {item.createdCount ?? 0}</span><span>{t('Updated')}: {item.updatedCount ?? 0}</span><span>{t('Unchanged')}: {item.unchangedCount ?? 0}</span><span>{t('Unmatched')}: {item.unmatchedCount ?? 0}</span><span>{t('Stale')}: {item.staleCandidateCount ?? 0}</span></div></div>)}</div>}
    {mode === 'runs' && items.some((item) => item.state === 'FAILED' || item.state === 'PARTIAL') && <section className="space-y-3"><h2 className="text-sm font-bold text-semantic-primary">{t('Run log')}</h2>{items.filter((item) => item.state === 'FAILED' || item.state === 'PARTIAL').map((item) => <article key={`${item.id}:log`} className={`wrike-card border-l-4 p-4 ${item.state === 'FAILED' ? 'border-semantic-danger' : 'border-amber-500'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-semantic-primary">{item.state === 'FAILED' ? t('Sync failed before inventory could be collected.') : t('Sync completed with some records requiring attention.')}</div><p className="mt-1 text-sm text-semantic-muted">{runFailureReason(item) || t('No additional error details were returned by the connector.')}</p></div><span className={item.state === 'FAILED' ? 'text-sm font-bold text-semantic-danger' : 'text-sm font-bold text-amber-600'}>{item.state}</span></div><dl className="mt-3 grid gap-2 text-xs text-semantic-muted sm:grid-cols-3"><div><dt>{t('Run type')}</dt><dd className="font-medium text-semantic-primary">{item.runType || 'FULL'}</dd></div><div><dt>{t('Started')}</dt><dd className="font-medium text-semantic-primary">{isoLabel(item.startedAt || item.queuedAt)}</dd></div><div><dt>{t('Completed')}</dt><dd className="font-medium text-semantic-primary">{isoLabel(item.completedAt)}</dd></div></dl></article>)}</section>}
    {formOpen && <div className="fixed inset-0 z-modal overflow-y-auto bg-slate-950/45 p-3 sm:p-6" role="presentation"><div className="flex min-h-full items-center justify-center"><form onSubmit={(event) => void save(event)} role="dialog" aria-modal="true" aria-labelledby="discovery-connector-dialog-title" className="wrike-card flex w-full max-w-[840px] max-h-[calc(100vh-24px)] sm:max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-2xl border-slate-200 shadow-2xl"><div className="flex shrink-0 items-center justify-between border-b border-semantic-border bg-semantic-panel px-5 py-4 sm:px-6"><div><h2 id="discovery-connector-dialog-title" className="text-xl font-bold tracking-tight text-semantic-primary">{editing ? t('Edit vCenter') : t('Add vCenter')}</h2><p className="mt-1 text-xs text-semantic-muted">{t('Configure a persisted vCenter discovery connection.')}</p></div><button type="button" aria-label={t('Close')} onClick={() => setFormOpen(false)} className="rounded-lg p-2 text-semantic-muted transition-colors hover:bg-semantic-subtle hover:text-semantic-primary"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6"><div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2"><label className="text-sm text-semantic-muted">{t('Name')}<input required value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} className="jira-input mt-2 w-full" /></label><label className="text-sm text-semantic-muted">{t('Environment')}<select value={form.environment} onChange={(event) => setForm((value) => ({ ...value, environment: event.target.value }))} className="jira-input mt-2 w-full"><option>PROD</option><option>DR</option><option>DEV</option><option>TEST</option><option>UAT</option></select></label><label className="text-sm text-semantic-muted md:col-span-2">{t('Description')}<textarea value={form.description} onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))} className="jira-input mt-2 min-h-24 w-full resize-y" /></label><label className="text-sm text-semantic-muted">{t('vCenter FQDN')}<input required value={form.endpointFqdn} onChange={(event) => setForm((value) => ({ ...value, endpointFqdn: event.target.value }))} className="jira-input mt-2 w-full" placeholder="vc-prod.bank.local" /></label><label className="text-sm text-semantic-muted">{t('Port')}<input required type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm((value) => ({ ...value, port: event.target.value }))} className="jira-input mt-2 w-full" /></label><label className="text-sm text-semantic-muted md:col-span-2">{t('Authentication')}<select disabled value="SERVICE_ACCOUNT" className="jira-input mt-2 w-full"><option>{t('Service Account')}</option></select></label><label className="text-sm text-semantic-muted">{t('Username')}<input required={!editing} value={form.username} onChange={(event) => setForm((value) => ({ ...value, username: event.target.value }))} className="jira-input mt-2 w-full" placeholder={editing ? t('Leave blank to keep current credential') : 'svc_cmdb_vcenter@vsphere.local'} /></label><label className="text-sm text-semantic-muted">{t('Password')}<input required={!editing} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))} className="jira-input mt-2 w-full" placeholder={editing ? t('Leave blank to keep current credential') : '••••••••••••'} /></label><label className="text-sm text-semantic-muted md:col-span-2">{t('Custom CA reference')}<input value={form.tlsCaReference} onChange={(event) => setForm((value) => ({ ...value, tlsCaReference: event.target.value }))} className="jira-input mt-2 w-full" placeholder={editing ? t('Leave unchanged') : 'file:///run/secrets/vcenter-ca.pem'} /></label></div><div className="mt-6 space-y-3 border-t border-semantic-border pt-5"><label className="flex items-center gap-2 text-sm text-semantic-primary"><input type="checkbox" checked={form.tlsVerifyCertificates} onChange={(event) => setForm((value) => ({ ...value, tlsVerifyCertificates: event.target.checked }))} />{t('Verify TLS')}</label><label className="flex items-center gap-2 text-sm text-semantic-primary"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((value) => ({ ...value, enabled: event.target.checked }))} />{t('Enabled')}</label></div></div><div className="flex shrink-0 justify-end gap-3 border-t border-semantic-border bg-semantic-panel px-5 py-4 sm:px-6"><button type="button" onClick={() => setFormOpen(false)} className="jira-btn-subtle">{t('Cancel')}</button><button type="submit" disabled={saving} className="jira-btn-primary min-w-28 justify-center">{saving && <Loader2 className="h-4 h-4 animate-spin" />}{t('Save')}</button></div></form></div></div>}
    {formOpen && formError && <div className="fixed inset-0 z-[calc(var(--z-modal)+1)] flex items-center justify-center p-4" role="presentation"><div role="alert" aria-live="assertive" className="wrike-card w-full max-w-xl border border-semantic-danger/30 p-5 shadow-2xl"><div className="flex items-start gap-3 text-semantic-danger"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0"><h3 className="font-semibold">{t('Could not save connector.')}</h3><p className="mt-2 break-words text-sm">{formError}</p></div></div><div className="mt-5 flex justify-end"><button type="button" onClick={() => setFormError('')} className="jira-btn-subtle">{t('Close')}</button></div></div></div>}
    {adFormOpen && <ActiveDirectoryConnectorModal fetchWithAuth={fetchWithAuth} t={t} connector={editingManagedConnector?.connectorType === 'ACTIVE_DIRECTORY' ? editingManagedConnector : undefined} onClose={() => { setAdFormOpen(false); setEditingManagedConnector(null); }} onSaved={load} />}{cortexFormOpen && <CortexConnectorModal fetchWithAuth={fetchWithAuth} t={t} connector={editingManagedConnector?.connectorType === 'CORTEX' ? editingManagedConnector : undefined} onClose={() => { setCortexFormOpen(false); setEditingManagedConnector(null); }} onSaved={load} />}
    {testResult && <div className="fixed inset-0 z-modal bg-black/40 flex items-center justify-center p-4" onClick={() => setTestResult(null)}><div className="wrike-card w-full max-w-2xl p-5 space-y-3" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t('Connection test result')}</h2><button onClick={() => setTestResult(null)} className="jira-btn-subtle p-1"><X className="w-4 h-4" /></button></div><pre className="text-xs whitespace-pre-wrap bg-semantic-subtle p-3 rounded-lg overflow-auto">{JSON.stringify(testResult, null, 2)}</pre></div></div>}
    {health && <div className="fixed inset-0 z-modal bg-black/40 flex items-center justify-center p-4" onClick={() => setHealth(null)}><div className="wrike-card w-full max-w-lg p-5 space-y-3" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t('Connector Health')}</h2><button onClick={() => setHealth(null)} className="jira-btn-subtle p-1"><X className="w-4 h-4" /></button></div><pre className="text-xs whitespace-pre-wrap bg-semantic-subtle p-3 rounded-lg overflow-auto">{JSON.stringify(health.metrics || health.connector?.vcenter || health.connector, null, 2)}</pre></div></div>}
  </div>;
};
