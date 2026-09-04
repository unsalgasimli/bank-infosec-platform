import React, { useEffect, useState } from 'react';
import type { ThreatModelDetail } from './ThreatModelDetailPanel.js';

type Props = { detail: ThreatModelDetail; mutable: boolean; fetchWithAuth: (url:string, options?:RequestInit)=>Promise<Response>; onRefresh:()=>Promise<void> };
const categories = ['SPOOFING','TAMPERING','REPUDIATION','INFORMATION_DISCLOSURE','DENIAL_OF_SERVICE','ELEVATION_OF_PRIVILEGE','BUSINESS_ABUSE','FRAUD','PRIVILEGE_ABUSE','WORKFLOW_BYPASS','SEGREGATION_OF_DUTIES_BYPASS','TRANSACTION_MANIPULATION','REPLAY','ACCOUNT_TAKEOVER','API_ABUSE','AUTOMATION_ABUSE','DATA_EXFILTRATION','INSIDER_THREAT','THIRD_PARTY_COMPROMISE'];
const fieldClass = 'jira-input mt-1 w-full';

/** The form pins the loaded content version. Background refresh never rebases unsaved edits. */
export function ThreatContentEditor({detail,mutable,fetchWithAuth,onRefresh}:Props) {
  const [draft,setDraft]=useState<any>();
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState('');
  const [offset,setOffset]=useState(0);
  const [reload,setReload]=useState(0);
  const [history,setHistory]=useState<any>();
  const [historyError,setHistoryError]=useState('');
  useEffect(()=>{setDraft(undefined);setOffset(0);setError('');setSaved('');},[detail.model.id]);
  useEffect(()=>{
    setHistory(undefined);setHistoryError('');if(!draft?.id)return;
    const controller=new AbortController();
    void fetchWithAuth(`/api/threats/${draft.id}/lineage?limit=25&offset=${offset}`,{signal:controller.signal}).then(async response=>{
      const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Could not load lineage.');
      if(!controller.signal.aborted)setHistory(result.lineage);
    }).catch(cause=>{if(!controller.signal.aborted)setHistoryError(cause.message);});
    return ()=>controller.abort();
  },[draft?.id,offset,reload,fetchWithAuth]);
  const selectThreat=(id:string)=>{const item=detail.threats.find(value=>value.id===id);setDraft(item?{...item}:undefined);setOffset(0);setReason('');setError('');setSaved('');};
  const current=detail.threats.find(item=>item.id===draft?.id);
  const stale=Boolean(draft&&(!current||current.contentVersion!==draft.contentVersion));
  const textField=(name:string,label:string,required=false,multiline=false)=><label key={name}>{label}{multiline
    ? <textarea className={fieldClass} required={required} value={draft[name]||''} onChange={event=>setDraft({...draft,[name]:event.target.value})}/>
    : <input className={fieldClass} required={required} value={draft[name]||''} onChange={event=>setDraft({...draft,[name]:event.target.value})}/>}</label>;
  const reference=(name:string,label:string,items:any[])=><label>{label}<select className={fieldClass} value={draft[name]||''} onChange={event=>setDraft({...draft,[name]:event.target.value})}><option value="">Not linked</option>{items.map(item=><option key={item.id} value={item.id}>{item.name||item.title||item.id}</option>)}</select></label>;
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');setSaved('');
    try{
      const response=await fetchWithAuth(`/api/threats/${draft.id}/content`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,reason,cweIds:draft.cweIds.filter(Boolean),capecIds:draft.capecIds.filter(Boolean)})});
      const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error||'Threat could not be saved.');
      setSaved(result.threat.contentVersion===draft.contentVersion?'No content change; existing decisions were preserved.':'Saved. Changed content requires fresh risk assessment and control verification.');setDraft(result.threat);setReason('');setReload(value=>value+1);await onRefresh();
    }catch(cause){setError(cause instanceof Error?cause.message:'Save failed.');}finally{setBusy(false);}
  };
  return <section className="space-y-4">
    <label>Threat to inspect or edit<select className={fieldClass} value={draft?.id||''} disabled={busy} onChange={event=>selectThreat(event.target.value)}><option value="">Select…</option>{detail.threats.map(item=><option key={item.id} value={item.id}>{item.key} · {item.title}</option>)}</select></label>
    {error&&<p role="alert">{error}</p>}{saved&&<p role="status">{saved}</p>}
    {draft&&<>
      <p>Stable threat ID: {draft.lineageId} · Content v{draft.contentVersion} · {draft.lineageOrigin}{draft.lineageOrigin==='LEGACY_UNCORRELATED'&&' — earlier correlations were not inferred.'}</p>
      {(detail.exceptions||[]).filter(item=>item.threatId===draft.id).map(item=><p key={item.id}>Risk acceptance {item.id}: {item.status} · assessed content v{item.threatContentVersion} / architecture v{item.architectureVersion}{item.threatContentVersion!==current?.contentVersion||item.architectureVersion!==detail.revisions?.find(revision=>revision.id===draft.revisionId)?.architectureVersion?' — STALE ASSESSMENT; not valid for current scope':''}</p>)}
      {stale&&<p role="alert">Server content changed. Your unsaved form is preserved. <button type="button" className="jira-btn-subtle" onClick={()=>selectThreat(draft.id)}>Discard edits and load latest</button></p>}
      <form onSubmit={save}><fieldset disabled={!mutable||busy||stale} className="grid gap-3">
        {textField('title','Threat title',true)}{textField('description','Description',true,true)}{textField('attackScenario','Attack scenario',true,true)}
        <fieldset><legend>STRIDE / business abuse categories</legend><div className="grid md:grid-cols-2 gap-2">{categories.map(category=><label key={category}><input type="checkbox" checked={draft.categories.includes(category)} onChange={event=>setDraft({...draft,categories:event.target.checked?[...draft.categories,category]:draft.categories.filter((item:string)=>item!==category)})}/> {category}</label>)}</div></fieldset>
        <div className="grid md:grid-cols-2 gap-3">{['inherentLikelihood','inherentImpact'].map(name=><label key={name}>{name==='inherentLikelihood'?'Inherent likelihood':'Inherent impact'}<input className={fieldClass} type="number" min={1} max={5} required value={draft[name]} onChange={event=>setDraft({...draft,[name]:Number(event.target.value)})}/></label>)}</div>
        <details><summary>Attacker, architecture links and ownership</summary><div className="grid md:grid-cols-2 gap-3 mt-3">
          {textField('attackerType','Attacker type')}{textField('attackerCapability','Attacker capability')}{textField('preconditions','Preconditions',false,true)}{textField('attackPath','Attack path',false,true)}
          {reference('affectedComponentId','Affected component',detail.components)}{reference('affectedDataFlowId','Affected data flow',detail.dataFlows)}{reference('affectedTrustBoundaryId','Affected trust boundary',detail.trustBoundaries)}
          {textField('affectedAssetId','Canonical asset ID')}{textField('ownerId','Canonical threat owner ID')}
          <label>Due date<input type="date" className={fieldClass} value={draft.dueDate||''} onChange={event=>setDraft({...draft,dueDate:event.target.value})}/></label>
          {['cweIds','capecIds'].map(name=><label key={name}>{name==='cweIds'?'CWE IDs':'CAPEC IDs'} (comma-separated)<input className={fieldClass} value={draft[name].join(', ')} onChange={event=>setDraft({...draft,[name]:event.target.value.split(',').map(value=>value.trim())})}/></label>)}
        </div></details>
        <label>Reason for change<textarea className={fieldClass} required maxLength={4000} value={reason} onChange={event=>setReason(event.target.value)}/></label>
        <p>Any authored-content change reopens this threat, clears residual-risk decisions for threats sharing its controls, and requires those controls to be verified again. Old risk acceptances remain historical and do not authorize changed content.</p>
        <button className="jira-btn-primary" type="submit">Save content and require reassessment</button>
      </fieldset></form>
      <section className="space-y-3"><h3>Persisted revision lineage</h3>{historyError?<p role="alert">{historyError} <button type="button" onClick={()=>setReload(value=>value+1)}>Retry</button></p>:!history?<p>Loading lineage…</p>:<>
        {history.versions.map((item:any)=><details key={item.id} className="border border-semantic-jira-border rounded p-3"><summary>Revision {item.revisionNumber} · {item.revisionStatus} · {item.key} · Content v{item.contentVersion}</summary><p>{item.title}</p><p>{item.attackScenario}</p><p>Inherent: {item.inherentScore} · Residual: {item.residualScore??'Not verified'} · {item.status}</p><p>Predecessor record: {item.previousThreatId||'Root / legacy uncorrelated'}</p></details>)}
        <div className="flex gap-3"><button type="button" className="jira-btn-subtle" disabled={!offset} onClick={()=>setOffset(value=>Math.max(0,value-25))}>Previous</button><button type="button" className="jira-btn-subtle" disabled={!history.hasMore} onClick={()=>setOffset(value=>value+25)}>Next</button></div>
      </>}</section>
    </>}
  </section>;
}
