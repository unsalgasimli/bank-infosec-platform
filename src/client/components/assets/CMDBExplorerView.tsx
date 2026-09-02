import { useEffect, useState } from 'react';
import { AlertCircle, Box, ChevronLeft, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { AssetDiscoverySourceCards } from './AssetDiscoverySourceCards.js';

type Mode = 'all' | 'assets' | 'applications' | 'business-services';
type Tab = 'overview' | 'identity' | 'infrastructure' | 'network' | 'storage' | 'sources' | 'security' | 'provenance' | 'relationships' | 'conflicts' | 'history';
type PostureFilter = '' | 'missing-cortex' | 'cortex-offline' | 'partially-protected' | 'vcenter-without-cortex' | 'ad-without-cortex' | 'cortex-only' | 'identity-conflict' | 'stale-assets';
const endpoint = (mode: Mode) => mode === 'assets' ? '/api/cmdb/assets' : mode === 'applications' ? '/api/cmdb/applications' : mode === 'business-services' ? '/api/cmdb/business-services' : '/api/cmdb/cis';
const inspect = (value: unknown) => JSON.stringify(value, null, 2);
const sourceLabel = (value: string) => value === 'VCENTER' ? 'vCenter' : value === 'ACTIVE_DIRECTORY' ? 'AD' : value === 'CORTEX' ? 'Cortex' : value;
const securityClass = (state?: string) => state === 'PROTECTED' ? 'text-semantic-success' : state === 'PARTIALLY_PROTECTED' ? 'text-amber-600' : state === 'UNPROTECTED' ? 'text-semantic-danger' : 'text-semantic-muted';

export const CMDBExplorerView: React.FC<{ mode?: Mode; initialCiId?: string }> = ({ mode = 'all', initialCiId }) => {
  const { fetchWithAuth } = useAuth();
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState(mode);
  const [rows, setRows] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [posture, setPosture] = useState<PostureFilter>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<any>();
  const [detail, setDetail] = useState<any>();
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const size = 25;

  const load = async (nextPage = page) => {
    setLoading(true); setError('');
    try {
      const q = new URLSearchParams({ page: String(nextPage), pageSize: String(size), sortBy: 'updatedAt', sortDirection: 'desc' });
      if (search) q.set('search', search);
      if (viewMode === 'assets' && posture) q.set('posture', posture);
      const [assets, taxonomy] = await Promise.all([fetchWithAuth(`${endpoint(viewMode)}?${q}`), fetchWithAuth('/api/cmdb/types')]);
      const data = await assets.json();
      if (!assets.ok || !data.success) throw new Error(data.error || 'Could not load CMDB records.');
      setRows(data.assets || data.cis || data.applications || data.businessServices || []);
      setTotal(Number(data.total || 0)); setTypes((await taxonomy.json()).types || []); setPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not load CMDB records.')); }
    finally { setLoading(false); }
  };
  const open = async (row: any) => {
    setSelected(row); setDetail(undefined); setTab('overview');
    try {
      if (viewMode !== 'assets') { const response = await fetchWithAuth(`/api/cmdb/cis/${row.id}`); const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.error); setDetail({ asset: data.ci, history: [] }); return; }
      const [assetResponse, subResponse] = await Promise.all([fetchWithAuth(`/api/cmdb/assets/${row.id}`), fetchWithAuth(`/api/cmdb/assets/${row.id}/subresources`)]);
      const assetData = await assetResponse.json(); const subData = await subResponse.json();
      if (!assetResponse.ok || !assetData.success) throw new Error(assetData.error);
      if (!subResponse.ok || !subData.success) throw new Error(subData.error);
      setDetail({ ...subData, asset: assetData.asset });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('Could not load asset detail.')); }
  };

  useEffect(() => { setViewMode(mode); }, [mode]);
  useEffect(() => { void load(1); }, [viewMode, posture]);
  useEffect(() => { const refresh = () => void load(page); window.addEventListener('aegis:discovery-status-changed', refresh); return () => window.removeEventListener('aegis:discovery-status-changed', refresh); }, [page, viewMode, search, posture]);
  useEffect(() => { const row = rows.find((item) => item.id === initialCiId); if (row) void open(row); }, [initialCiId, rows]);

  const asset = detail?.asset;
  const tabs: Tab[] = ['overview','identity','infrastructure', ...(viewMode === 'assets' ? ['network','storage','sources','security','provenance'] as Tab[] : []), 'relationships', ...(viewMode === 'assets' ? ['conflicts'] as Tab[] : []), 'history'];
  const security = detail?.cortexSecurity || asset?.cortexSecurity;
  const tabValue = tab === 'overview' ? { environment: asset?.environment, lifecycle: asset?.lifecycleState, owner: asset?.ownerUserId, lastSeen: asset?.lastSeenAt, sourceCoverage: asset?.sourceCoverage }
    : tab === 'identity' ? detail?.identifiers
      : tab === 'infrastructure' ? { hostname: asset?.hostname, fqdn: asset?.fqdn, operatingSystem: asset?.operatingSystem, osVersion: asset?.osVersion, cpuCount: asset?.cpuCount, memoryBytes: asset?.memoryBytes, serialNumber: asset?.serialNumber }
        : tab === 'network' ? detail?.network : tab === 'storage' ? detail?.storage : tab === 'security' ? { cortex: security, findings: detail?.findings || [] } : tab === 'provenance' ? detail?.provenance : tab === 'relationships' ? detail?.relationships : tab === 'conflicts' ? detail?.conflicts : detail?.history;

  return <main className="flex-1 space-y-5 overflow-y-auto bg-semantic-subtle p-6 custom-scrollbar">
    <header><div className="flex gap-2 text-semantic-info"><Box className="h-5 w-5" /><span className="text-xs font-bold uppercase">{t('Assets & CMDB')}</span></div><h1 className="mt-1 text-xl font-bold">{t(viewMode === 'assets' ? 'Asset Inventory' : 'Configuration Items')}</h1></header>
    <nav className="wrike-card flex gap-1 p-1.5">{(['all','assets','applications','business-services'] as Mode[]).map((entry) => <button key={entry} onClick={() => setViewMode(entry)} className={`rounded px-3 py-2 text-xs font-bold ${entry === viewMode ? 'bg-semantic-info-surface text-semantic-info' : 'text-semantic-muted'}`}>{t(entry === 'all' ? 'All records' : entry === 'assets' ? 'Infrastructure' : entry === 'applications' ? 'Applications' : 'Business Services')}</button>)}</nav>
    <div className="wrike-card flex flex-wrap gap-3 p-3"><label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-semantic-muted" /><input className="jira-input w-full pl-9" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void load(1)} placeholder={t('Search name, hostname, FQDN, IP, MAC, serial or UUID')} /></label>{viewMode === 'assets' && <select aria-label={t('Security posture')} className="jira-input min-w-56" value={posture} onChange={(event) => setPosture(event.target.value as PostureFilter)}><option value="">{t('All security states')}</option><option value="missing-cortex">{t('Missing Cortex')}</option><option value="cortex-offline">{t('Cortex Offline')}</option><option value="partially-protected">{t('Partially Protected')}</option><option value="vcenter-without-cortex">{t('vCenter but no Cortex')}</option><option value="ad-without-cortex">{t('AD but no Cortex')}</option><option value="cortex-only">{t('Cortex-only')}</option><option value="identity-conflict">{t('Identity Conflict')}</option><option value="stale-assets">{t('Stale Assets')}</option></select>}<button className="jira-btn-subtle" onClick={() => void load(1)}>{t('Apply filters')}</button></div>
    {error && <div className="wrike-card flex gap-2 p-3 text-semantic-danger"><AlertCircle className="h-4 w-4" />{error}</div>}
    {loading ? <div className="wrike-card p-10 text-center text-semantic-muted">{t('Loading persisted CMDB records…')}</div> : <div className="wrike-card overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-semantic-muted"><tr><th className="p-3">{t('Asset')}</th><th>{t('Type')}</th><th>{t('Hostname / serial')}</th>{viewMode === 'assets' && <><th>{t('Sources')}</th><th>{t('Security')}</th></>}<th>{t('Lifecycle')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} onClick={() => void open(row)} className="cursor-pointer border-t border-semantic-border hover:bg-semantic-subtle"><td className="p-3"><strong>{row.displayName || row.name}</strong><div className="font-mono text-xs text-semantic-info">{row.ciNumber}</div></td><td>{types.find((type) => type.id === row.typeId)?.name || row.typeId}</td><td>{row.hostname || row.serialNumber || row.fqdn || '—'}</td>{viewMode === 'assets' && <><td><div className="flex flex-wrap gap-1">{(row.sourceCoverage || []).map((source: string) => <span key={source} className="rounded-full bg-semantic-info-surface px-2 py-0.5 text-micro font-bold text-semantic-info">{sourceLabel(source)}</span>)}</div></td><td className={securityClass(row.cortexSecurity?.protection_state)}>{row.cortexSecurity?.protection_state?.replaceAll('_',' ') || (row.openFindingCount ? `${row.openFindingCount} ${t('finding(s)')}` : '—')}</td></>}<td>{row.lifecycleState || row.lifecycleStatus}</td></tr>)}</tbody></table><footer className="flex justify-between border-t border-semantic-border p-3"><span>{total} {t('records')}</span><span><button disabled={page <= 1} className="jira-btn-subtle disabled:opacity-40" onClick={() => void load(Math.max(1,page-1))}><ChevronLeft className="h-4 w-4" /></button><button disabled={page * size >= total} className="jira-btn-subtle disabled:opacity-40" onClick={() => void load(page+1)}><ChevronRight className="h-4 w-4" /></button></span></footer></div>}
    {selected && detail && <><AssetDiscoverySourceCards sources={detail.sources || []} provenance={detail.provenance || []} t={t} /><section className="wrike-card overflow-hidden"><header className="flex justify-between p-5"><div><div className="font-mono text-xs text-semantic-info">{asset?.ciNumber}</div><h2 className="font-bold">{asset?.name}</h2><div className="mt-2 flex flex-wrap gap-1">{(asset?.sourceCoverage || []).map((source: string) => <span key={source} className="rounded-full bg-semantic-info-surface px-2 py-0.5 text-micro font-bold text-semantic-info">{sourceLabel(source)}</span>)}</div></div><button className="jira-btn-subtle" onClick={() => { setSelected(undefined); setDetail(undefined); }}>{t('Close')}</button></header><nav className="flex gap-4 overflow-x-auto border-b border-semantic-border px-5">{tabs.map((name) => <button key={name} onClick={() => setTab(name)} className={`border-b-2 pb-3 text-xs font-bold ${tab === name ? 'border-semantic-info text-semantic-info' : 'border-transparent text-semantic-muted'}`}>{t(name === 'infrastructure' ? 'Infrastructure' : name === 'sources' ? 'Discovery Sources' : name === 'security' ? 'Cortex Security' : name[0].toUpperCase() + name.slice(1))}</button>)}</nav><div className="p-5">{tab === 'sources' ? <AssetDiscoverySourceCards sources={detail.sources || []} provenance={detail.provenance || []} t={t} /> : <><div className="mb-2 flex items-center gap-2 text-xs font-bold text-semantic-muted">{tab === 'security' && <ShieldCheck className="h-4 w-4" />}{t(tab === 'security' ? 'Persisted security posture and findings' : 'Persisted CMDB evidence')}</div><pre className="overflow-auto rounded bg-semantic-subtle p-3 text-xs">{inspect(tabValue)}</pre></>}</div></section></>}
  </main>;
};
