import React, { useEffect, useState } from 'react';
import type { ThreatModelDetail } from './ThreatModelDetailPanel.js';
import { ThreatModelEmergencyEditor } from './ThreatModelEmergencyEditor.js';
import { ThreatControlCatalogEditor } from './ThreatControlCatalogEditor.js';
import { ThreatContentEditor } from './ThreatContentEditor.js';
import { ThreatArchitectureEditor } from './ThreatArchitectureEditor.js';

type Props = { detail: ThreatModelDetail; fetchWithAuth: (url: string, options?: RequestInit) => Promise<Response>; onRefresh: () => Promise<void> };
const inputClass = 'jira-input mt-1 w-full';
const split = (value: FormDataEntryValue | null) => String(value || '').split(',').map(x => x.trim()).filter(Boolean);

/** Forms submit actual persisted domain records; errors stay inside the workspace. */
export function ThreatModelGovernanceEditor({ detail, fetchWithAuth, onRefresh }: Props) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [section, setSection] = useState('screening');
  useEffect(() => { setData(undefined); }, [detail.model.id]);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    void fetchWithAuth(`/api/threat-models/${detail.model.id}/governance`, { signal: controller.signal }).then(async response => {
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Governance could not be loaded.');
      if (!controller.signal.aborted) setData(result.governance);
    }).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message)); });
    return () => controller.abort();
  }, [detail.model.id, refresh]);
  const submit = async (event: React.FormEvent<HTMLFormElement>, path: string, transform?: (form: FormData) => unknown) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    try {
      const response = await fetchWithAuth(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transform ? transform(form) : Object.fromEntries(form)) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Governance operation failed.');
      await onRefresh(); setRefresh(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Operation failed.'); }
    finally { setBusy(false); }
  };
  const base = `/api/threat-models/${detail.model.id}`;
  const revision = detail.revisions?.find(item => item.id === data?.revision?.id);
  const mutable = revision && ['DRAFT','CHANGES_REQUIRED'].includes(revision.status);
  const select = (name: string, label: string, items: any[], optional = false) => <label>{label}<select name={name} className={inputClass} required={!optional}><option value="">Select…</option>{items.map(item => <option key={item.id} value={item.id}>{item.title || item.name || item.code || item.id}</option>)}</select></label>;
  const field = (name: string, label: string, value = '', type = 'text', required = true) => <label>{label}<input className={inputClass} name={name} defaultValue={value} type={type} required={required} /></label>;
  const save = <button type="submit" className="jira-btn-primary mt-3" disabled={busy}>Save to server</button>;
  return <section className="space-y-4">
    {error && <div role="alert" className="border border-semantic-danger-border bg-semantic-danger-surface text-semantic-danger p-3 rounded">{error}</div>}
    {!data ? error ? <button className="jira-btn-subtle" onClick={() => setRefresh(value=>value+1)}>Retry governance load</button> : <p>Loading governance…</p> : <>
      <div className="border border-semantic-jira-border rounded p-3">{data.revision.tier === null ? 'UNSCREENED — approval blocked' : `TM-${data.revision.tier}`} · Screening policy {data.revision.policy_version_id || 'not evaluated'} · Current policy v{data.policy.version}</div>
      <nav className="flex flex-wrap gap-2">{['screening','scope','architecture','data','requirements','control catalog','threat content','threat state','exceptions','emergency','compliance','versions'].map(tab => <button key={tab} type="button" className={section === tab ? 'jira-btn-primary' : 'jira-btn-subtle'} onClick={() => setSection(tab)}>{tab}</button>)}</nav>
      {section === 'architecture' && <ThreatArchitectureEditor key={detail.model.id} detail={detail} mutable={Boolean(mutable)} fetchWithAuth={fetchWithAuth} onRefresh={async()=>{await onRefresh();setRefresh(value=>value+1);}}/>}
      {section === 'threat content' && <ThreatContentEditor key={detail.model.id} detail={detail} mutable={Boolean(mutable)} fetchWithAuth={fetchWithAuth} onRefresh={onRefresh}/>}
      {section === 'control catalog' && <ThreatControlCatalogEditor detail={detail} mutable={Boolean(mutable)} fetchWithAuth={fetchWithAuth} onRefresh={async()=>{await onRefresh();setRefresh(value=>value+1);}}/>}
      {section === 'emergency' && <ThreatModelEmergencyEditor modelId={detail.model.id} changeId={detail.model.changeId || detail.model.releaseId} emergencies={data.emergencies} fetchWithAuth={fetchWithAuth} onRefresh={async()=>{await onRefresh();setRefresh(value=>value+1);}}/>}
      {!mutable && <p>Reviewed content is locked. Create a revision to update architecture, evidence or risk decisions.</p>}
      {section === 'screening' && <form onSubmit={event => void submit(event, `${base}/applicability`, form => ({ justification: form.get('justification'), answers: Object.fromEntries(data.policy.rules.map((rule: any) => [rule.signal, form.get(rule.signal) === 'true'])) }))}>
        <p className="mb-3">Answer every question explicitly. Canonical criticality and data classification can raise the tier; a manual downgrade is not available.</p>
        <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-3">{data.policy.rules.map((rule: any) => <label key={rule.signal}>{rule.reason}<select name={rule.signal} className={inputClass} required defaultValue=""><option value="">Not assessed</option><option value="false">No</option><option value="true">Yes</option></select><small>Minimum TM-{rule.minimumTier} when triggered</small></label>)}{field('justification','Assessment rationale')}{save}</fieldset>
      </form>}
      {section === 'scope' && <form key={data.revision.version} onSubmit={event => void submit(event, `${base}/scope`, form => ({ ...Object.fromEntries(form), version: data.revision.version }))}><fieldset disabled={!mutable || busy} className="grid gap-3">{[['scopeSummary','Scope'],['architectureSummary','Architecture summary'],['assumptions','Security assumptions'],['securityObjectives','Security objectives']].map(([name,label]) => <label key={name}>{label}<textarea name={name} className={inputClass} required defaultValue={revision?.[name] || ''} /></label>)}{save}</fieldset></form>}
      {section === 'data' && <>
        <ul>{data.dataObjects.map((item: any) => <li key={item.id}>{item.name} · {item.classification} · {item.id}</li>)}</ul>
        <form onSubmit={event => void submit(event, `${base}/data-objects`, form => ({ ...Object.fromEntries(form), personalData: form.has('personalData'), sensitivePersonalData: form.has('sensitivePersonalData'), bankSecrecy: form.has('bankSecrecy'), credentialData: form.has('credentialData'), paymentData: form.has('paymentData') }))}>
          <fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-3">{field('name','Information asset name')}{field('ownerId','Canonical data owner ID')}<label>Classification<select name="classification" className={inputClass}>{['PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL'].map(value => <option key={value}>{value}</option>)}</select></label>{field('retention','Retention')}{field('allowedLocations','Allowed processing / storage locations')}{field('encryptionRequirements','Encryption requirements')}{select('componentId','Component (choose component OR flow)',detail.components,true)}{select('flowId','Data flow',detail.dataFlows,true)}{['personalData','sensitivePersonalData','bankSecrecy','credentialData','paymentData'].map(name => <label key={name}><input type="checkbox" name={name} /> {name}</label>)}{save}</fieldset>
        </form>
        <details><summary>Reuse an existing information asset on another component / flow</summary><form onSubmit={event => void submit(event, `${base}/data-objects`)}><fieldset disabled={!mutable || busy} className="grid gap-3">{select('dataObjectId','Existing data object',data.dataObjects)}{select('componentId','Component',detail.components,true)}{select('flowId','Data flow',detail.dataFlows,true)}{save}</fieldset></form></details>
      </>}
      {section === 'requirements' && <>
        <ul className="space-y-2">{data.requirements.map((item: any) => <li key={item.id} className="border border-semantic-jira-border p-3 rounded">{item.title} · {item.mandatory ? 'Mandatory' : 'Optional'}<p>Threats: {item.threat_ids.join(', ')} → Controls: {item.control_ids.join(', ') || 'MISSING'} → Compliance: {item.compliance_ids.join(', ') || 'Unmapped'}</p></li>)}</ul>
        <form onSubmit={event => void submit(event, `${base}/security-requirements`, form => ({ ...Object.fromEntries(form), mandatory: form.get('mandatory') !== 'false', threatIds: [form.get('threatId')], controlIds: split(form.get('controlIds')), complianceIds: split(form.get('complianceIds')) }))}><fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-3">{field('title','Security requirement')}{field('description','Actionable acceptance criteria')}{field('ownerId','Implementation owner ID')}{field('verificationMethod','Verification method')}{select('threatId','Threat',detail.threats)}{field('controlIds','Control IDs (comma-separated)','', 'text',false)}{field('complianceIds','Compliance IDs (comma-separated)','', 'text',false)}<label>Mandatory<select name="mandatory" className={inputClass}><option value="true">Yes</option><option value="false">No</option></select></label>{save}</fieldset></form>
        <p>Control IDs: {detail.controls.map(item => `${item.title}: ${item.id}`).join(' · ')}</p>
        <form onSubmit={event => void submit(event, `${base}/requirement-controls`)}><fieldset disabled={!mutable || busy} className="grid gap-3">{select('requirementId','Existing requirement',data.requirements)}{select('controlId','Map an implementation control',detail.controls)}{save}</fieldset></form>
      </>}
      {section === 'threat state' && <form onSubmit={event => { const form = new FormData(event.currentTarget); void submit(event, `/api/threats/${form.get('threatId')}/transition`); }}><fieldset disabled={!mutable || busy} className="grid gap-3">{select('threatId','Threat',detail.threats)}<label>Requested state<select name="status" className={inputClass}>{['OPEN','MITIGATING','MITIGATED','ACCEPTED','CLOSED'].map(state => <option key={state}>{state}</option>)}</select></label>{field('reason','Reason')}{save}</fieldset><p>Server checks transitions, independent verification, evidence, residual risk and current exceptions.</p></form>}
      {section === 'exceptions' && <>
        <p>Critical: emergency only, 7 days; High: 30; Medium: 90; Low: 180. Critical risk still blocks normal release.</p>
        <form onSubmit={event => { const form = new FormData(event.currentTarget); void submit(event, `/api/threats/${form.get('threatId')}/risk-acceptance`, form => ({ ...Object.fromEntries(form), emergency: form.has('emergency') })); }}><fieldset disabled={!mutable || busy} className="grid md:grid-cols-2 gap-3">{select('threatId','Threat',detail.threats)}{field('reason','Reason remediation cannot happen now')}{field('businessJustification','Business and technical impact')}{field('compensatingControls','Compensating controls')}{field('remediationOwnerId','Remediation owner ID')}{field('remediationPlan','Remediation plan')}{field('remediationDeadline','Remediation deadline','','datetime-local')}{field('expiresAt','Exception expiry','','datetime-local')}<label><input type="checkbox" name="emergency" /> Critical emergency exception</label>{save}</fieldset></form>
        <form onSubmit={event => { const form = new FormData(event.currentTarget); void submit(event, `/api/threat-model-exceptions/${form.get('exceptionId')}/decision`); }}><fieldset disabled={busy} className="grid gap-3">{select('exceptionId','Exception decision',detail.exceptions || [])}<label>Decision<select name="decision" className={inputClass}><option>APPROVED</option><option>REJECTED</option><option>REVOKED</option></select></label>{save}</fieldset></form>
      </>}
      {section === 'compliance' && <><p>Catalog references are proposals pending compliance-owner validation. They do not certify compliance.</p><ul>{data.compliance.map((item: any) => <li key={item.id}>{item.framework} {item.framework_version} · {item.code} · {item.requirement_kind} · {item.id}</li>)}</ul><form onSubmit={event => void submit(event,'/api/threat-compliance-requirements')}><fieldset disabled={busy} className="grid md:grid-cols-2 gap-3">{field('framework','Framework')}{field('frameworkVersion','Version')}{field('code','Requirement code')}{field('title','Internal interpretation')}<label>Source kind<select name="requirementKind" className={inputClass}><option>BANK_POLICY</option><option>REGULATORY_MINIMUM</option><option>APPLICATION_REQUIREMENT</option></select></label>{save}</fieldset></form></>}
      {section === 'versions' && <><form onSubmit={event => void submit(event, `${base}/revisions`)}><fieldset disabled={busy || revision?.status !== 'APPROVED'}>{field('changeReason','Reason for new revision')}{save}</fieldset></form>{detail.revisions?.filter(item => item.status === 'APPROVED').map(item => <button key={item.id} className="jira-btn-subtle" disabled={busy} onClick={() => {
        setBusy(true); setError(''); void fetchWithAuth(`${base}/revisions/${item.id}/export`).then(async response => { const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Export failed.'); const url = URL.createObjectURL(new Blob([JSON.stringify(result.report,null,2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href=url; anchor.download=`${detail.model.key}-v${item.revisionNumber}-approved.json`; anchor.click(); URL.revokeObjectURL(url); }).catch(cause => setError(cause.message)).finally(() => setBusy(false));
      }}>Download immutable v{item.revisionNumber} evidence pack</button>)}</>}
    </>}
  </section>;
}
