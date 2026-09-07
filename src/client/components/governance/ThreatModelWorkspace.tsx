import React, { useEffect, useRef, useState } from 'react';
import { FilePlus2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.js';
import { useI18n } from '../../context/I18nContext.js';
import { Badge } from '../common/Badge.js';
import { ThreatModelDetailPanel, type ThreatModelDetail, type ThreatModelSummary } from './ThreatModelDetailPanel.js';
import { ThreatModelGovernancePanel } from './ThreatModelGovernancePanel.js';

export const ThreatModelWorkspace: React.FC = () => {
  const { fetchWithAuth, currentUser } = useAuth();
  const { t } = useI18n();
  const [models, setModels] = useState<ThreatModelSummary[]>([]);
  const [report, setReport] = useState<any>(null);
  const [detail, setDetail] = useState<ThreatModelDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filters,setFilters]=useState('');
  const listSequence=useRef(0);
  const requestSequence = useRef(0);
  const [form, setForm] = useState({ title: '', serviceId: '', assetId: '', projectId: '', changeId: '', releaseId: '', criticality: 'HIGH' });
  const [error, setError] = useState('');
  const load = async () => {
    const sequence=++listSequence.current;setLoading(true);setError('');
    try {
      const [response, reportResponse] = await Promise.all([fetchWithAuth(`/api/threat-models?limit=50&offset=${offset}&${filters}`), fetchWithAuth('/api/threat-models/report')]);
      const data = await response.json(); const reportData = await reportResponse.json();
      if(sequence!==listSequence.current)return;
      if (!response.ok || !data.success) throw new Error(data.error || 'Threat Models could not be loaded.');
      setModels(Array.isArray(data.threatModels) ? data.threatModels : []);
      if (reportResponse.ok && reportData.success) setReport(reportData.report);
      else setReport(null);
    } catch (cause) {
      if(sequence!==listSequence.current)return;
      setError(cause instanceof Error ? cause.message : 'Threat Models could not be loaded.');
      setModels([]); setReport(null);
    } finally { if(sequence===listSequence.current)setLoading(false); }
  };
  const select = async (model: ThreatModelSummary) => {
    const sequence = ++requestSequence.current;
    setError(''); setLoadingDetail(true);
    try {
      const [detailResponse, gateResponse] = await Promise.all([fetchWithAuth(`/api/threat-models/${model.id}`), fetchWithAuth(`/api/threat-models/${model.id}/release-gate`)]);
      const data = await detailResponse.json(); const gate = await gateResponse.json();
      if (sequence !== requestSequence.current) return;
      if (!detailResponse.ok || !data.success) throw new Error(data.error || 'Threat Model could not be loaded.');
      setDetail({ ...data, releaseGate: gateResponse.ok && gate.success ? gate.releaseGate : undefined });
    } catch (cause) {
      if (sequence === requestSequence.current) { setDetail(null); setError(cause instanceof Error ? cause.message : 'Threat Model could not be loaded.'); }
    } finally {
      if (sequence === requestSequence.current) setLoadingDetail(false);
    }
  };
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const serviceId = query.get('serviceId') || '';
    const assetId = query.get('assetId') || '';
    const projectId = query.get('projectId') || '';
    const changeId = query.get('changeId') || '';
    const releaseId = query.get('releaseId') || '';
    if (serviceId || assetId || projectId || changeId || releaseId) {
      setForm((current) => ({ ...current, title: query.get('title') || current.title, serviceId, assetId, projectId, changeId, releaseId }));
      setCreating(true);
    }
  }, []);
  useEffect(() => { void load(); }, [offset,filters]);
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const response = await fetchWithAuth('/api/threat-models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, technicalOwnerId: currentUser?.id, businessOwnerId: currentUser?.id, dataClassification: 'CONFIDENTIAL_SECURITY_ONLY' }) });
    const data = await response.json(); if (!data.success) { setError(data.error || 'Threat Model could not be created.'); return; }
    setCreating(false); setForm({ title: '', serviceId: '', assetId: '', projectId: '', changeId: '', releaseId: '', criticality: 'HIGH' }); await load(); await select(data.model);
  };
  return <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-semantic-jira-surface custom-scrollbar">
    <div className="bg-semantic-panel border border-semantic-jira-border rounded-md p-5 flex flex-wrap gap-4 items-center justify-between shadow-sm"><div className="flex items-center gap-3"><div className="p-2.5 rounded bg-semantic-jira-brand-surface text-semantic-jira-brand border border-semantic-jira-info-border"><ShieldCheck className="w-5 h-5" /></div><div><h1 className="text-xl font-bold text-semantic-jira-primary">{t('Threat Modeling')}</h1><p className="text-xs text-semantic-jira-muted mt-0.5">{t('Versioned architecture security reviews, verification evidence, risk decisions, and server-enforced release gates.')}</p></div></div><div className="flex gap-2"><button className="jira-btn-subtle" onClick={() => setShowGovernance(!showGovernance)}>{t('Governance settings')}</button><button className="jira-btn-primary" onClick={() => setCreating(true)}><FilePlus2 className="w-4 h-4" />{t('New Threat Model')}</button></div></div>
    {error && <div className="text-xs border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger rounded p-3">{error}</div>}
    <div className="flex items-center gap-3"><button className="jira-btn-subtle" disabled={loading || offset===0} onClick={() => setOffset(value=>Math.max(0,value-50))}>Previous models</button><span className="text-xs">Page {Math.floor(offset/50)+1}</span><button className="jira-btn-subtle" disabled={loading || models.length<50} onClick={() => setOffset(value=>value+50)}>Next models</button></div>
    <form className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2" onSubmit={event=>{
      event.preventDefault();
      const params=new URLSearchParams();
      new FormData(event.currentTarget).forEach((value,key)=>{
        const entered=String(value).trim();
        if(entered)params.set(key,['reviewDueBefore','exceptionExpiresBefore'].includes(key)?new Date(entered).toISOString():entered);
      });
      setOffset(0);setFilters(params.toString());
    }}>
      <label>Search<input name="q" maxLength={200} className="jira-input w-full" placeholder="Model, threat, control, compliance"/></label>
      <label>Status<select name="status" className="jira-input w-full"><option value="">All</option>{['DRAFT','IN_REVIEW','CHANGES_REQUIRED','APPROVED','REVIEW_REQUIRED','RETIRED','ARCHIVED'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Tier<select name="tier" className="jira-input w-full"><option value="">All</option>{[0,1,2,3].map(value=><option key={value} value={value}>TM-{value}</option>)}</select></label>
      <label>Inherent risk<select name="risk" className="jira-input w-full"><option value="">All</option>{['CRITICAL','HIGH','MEDIUM','LOW'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Owner ID<input name="ownerId" maxLength={64} className="jira-input w-full"/></label><button className="jira-btn-primary self-end" disabled={loading}>Apply filters</button>
      <details className="sm:col-span-3 lg:col-span-6">
        <summary className="cursor-pointer text-xs">Scope, relationships and due dates</summary>
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
          <label>Application / service ID<input name="serviceId" maxLength={64} className="jira-input w-full"/></label>
          <label>CMDB asset ID<input name="assetId" maxLength={64} className="jira-input w-full"/></label>
          <label>Classification<select name="classification" className="jira-input w-full"><option value="">All authorized</option>{['PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Threat ID / key<input name="threatId" maxLength={64} className="jira-input w-full"/></label>
          <label>Control ID<input name="controlId" maxLength={64} className="jira-input w-full"/></label>
          <label>Compliance requirement ID<input name="complianceId" maxLength={64} className="jira-input w-full"/></label>
          <label>Threat due on / before<input name="threatDueBefore" type="date" className="jira-input w-full"/></label>
          <label>Review due before (local time)<input name="reviewDueBefore" type="datetime-local" className="jira-input w-full"/></label>
          <label>Approved / expired exception before (local time)<input name="exceptionExpiresBefore" type="datetime-local" className="jira-input w-full"/></label>
        </div>
        <p className="text-xs mt-2">Relationships and dates match the current revision only. Filters never widen your authorized scope.</p>
      </details>
    </form>
    {showGovernance && <ThreatModelGovernancePanel fetchWithAuth={fetchWithAuth} currentUser={currentUser} onError={setError} />}
    {report&&<details className="border border-semantic-jira-border rounded p-3"><summary>Authorized application coverage and control gaps</summary><p>{report.applicationCoverage?.with_model??0} / {report.applicationCoverage?.total??0} applications have a model ({report.applicationCoverage?.percent??0}%). {report.applicationCoverage?.current_approved??0} have a current approval.</p><p>{report.applicationCoverage?.denominator}</p><p>Threats without controls: {report.threats?.without_controls??0} · Mandatory requirements without retained clean evidence: {report.requirements?.without_evidence??0} · Average review: {report.averageApprovalHours??0} hours · Average open threat age: {report.threats?.average_open_age_days??0} days.</p><ul>{report.compliance?.map((item:any)=><li key={`${item.framework}/${item.framework_version}/${item.code}`}>{item.framework} {item.framework_version} / {item.code}: {item.mapped_requirements} mapped; {item.requirements_with_verified_control} with verified control; {item.current_validation_status}</li>)}</ul><p>{report.scope}</p></details>}
    {report && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[[t('Critical model approval'), `${report.coverage?.CRITICAL?.percent ?? 0}%`, t('Approved / registered critical models')], [t('Tier 1 coverage'), `${report.migrationCoverage?.TIER_1?.percent ?? 0}%`, `${report.migrationCoverage?.TIER_1?.overdue ?? 0} ${t('overdue backlog item(s)')}`], [t('Tier 2 coverage'), `${report.migrationCoverage?.TIER_2?.percent ?? 0}%`, `${report.migrationCoverage?.TIER_2?.overdue ?? 0} ${t('overdue backlog item(s)')}`], [t('Tier 3 coverage'), `${report.migrationCoverage?.TIER_3?.percent ?? 0}%`, `${report.migrationCoverage?.TIER_3?.overdue ?? 0} ${t('overdue backlog item(s)')}`], [t('Open critical threats'), report.threats?.critical_open ?? 0, t('Release-blocking exposure')], [t('Unverified controls'), report.controls?.unverified ?? 0, t('Required verification backlog')], [t('Expired verification'), report.controls?.expired_verifications ?? 0, t('Evidence needs renewal')], [t('Exceptions expiring'), report.exceptions?.expiring ?? 0, t('Within 30 days')]].map(([label, value, hint]) => <div key={String(label)} className="bg-semantic-panel border border-semantic-jira-border rounded-md p-3"><div className="text-caption text-semantic-jira-muted">{label}</div><div className="text-xl font-bold text-semantic-jira-primary mt-1">{value}</div><div className="text-micro text-semantic-jira-muted mt-1">{hint}</div></div>)}</div>}
    <div className="grid grid-cols-1 xl:grid-cols-[330px_1fr] gap-5"><aside className="bg-semantic-panel border border-semantic-jira-border rounded-md divide-y divide-semantic-jira-border overflow-hidden"><div className="px-4 py-3 text-xs font-bold text-semantic-jira-primary uppercase tracking-wider">{t('Models')} ({models.length})</div>{loading ? <div className="p-6 text-xs text-semantic-jira-muted">{t('Loading...')}</div> : models.length === 0 ? <div className="p-6 text-xs text-semantic-jira-muted">{t('No Threat Models are visible in your authorized scope.')}</div> : models.map((model) => <button key={model.id} className={`w-full text-left p-4 hover:bg-semantic-jira-hover ${detail?.model.id === model.id ? 'bg-semantic-jira-brand-surface' : ''}`} onClick={() => void select(model)} disabled={loadingDetail}><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-semantic-jira-brand">{model.key}</span><Badge type="SEVERITY" value={model.criticality} size="sm" /></div><div className="text-xs font-semibold text-semantic-jira-primary mt-1">{model.title}</div><div className="text-caption text-semantic-jira-muted mt-1">v{model.revisionNumber || 1} · {model.status.replaceAll('_', ' ')}</div></button>)}</aside><ThreatModelDetailPanel key={detail?.model.id || 'none'} detail={detail} fetchWithAuth={fetchWithAuth} onRefresh={async () => { if (detail) { await load(); await select(detail.model); } }} onError={setError} /></div>
    {creating && <div className="fixed inset-0 z-dsDialog grid place-items-center bg-black/60 p-4"><form onSubmit={create} className="w-full max-w-2xl bg-semantic-panel border border-semantic-jira-border rounded-md p-5 space-y-4 shadow-2xl"><div><h3 className="font-bold text-semantic-jira-primary">{t('Create Threat Model')}</h3><p className="text-xs text-semantic-jira-muted mt-1">{t('Link it to a real service, asset, project, change, or release before documenting the architecture.')}</p></div><div className="grid sm:grid-cols-2 gap-3"><label className="block text-xs sm:col-span-2">{t('Title')}<input className="jira-input mt-1" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="block text-xs">{t('Service / CMDB ID')}<input className="jira-input mt-1" value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })} /></label><label className="block text-xs">{t('Asset / CI ID')}<input className="jira-input mt-1" value={form.assetId} onChange={(event) => setForm({ ...form, assetId: event.target.value })} /></label><label className="block text-xs">{t('Project ID')}<input className="jira-input mt-1" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} /></label><label className="block text-xs">{t('Change ID')}<input className="jira-input mt-1" value={form.changeId} onChange={(event) => setForm({ ...form, changeId: event.target.value })} /></label><label className="block text-xs">{t('Release ID')}<input className="jira-input mt-1" value={form.releaseId} onChange={(event) => setForm({ ...form, releaseId: event.target.value })} /></label><label className="block text-xs">{t('Criticality')}<select className="jira-input mt-1" value={form.criticality} onChange={(event) => setForm({ ...form, criticality: event.target.value })}><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label></div><div className="flex justify-end gap-2"><button type="button" className="jira-btn-subtle" onClick={() => setCreating(false)}>{t('Cancel')}</button><button className="jira-btn-primary" type="submit">{t('Create draft')} <FilePlus2 className="w-4 h-4" /></button></div></form></div>}
  </div>;
};
