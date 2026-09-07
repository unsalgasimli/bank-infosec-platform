import React, { useEffect, useState } from 'react';
import type { ThreatModelDetail } from './ThreatModelDetailPanel.js';

type Props={detail:ThreatModelDetail;fetchWithAuth:(url:string,options?:RequestInit)=>Promise<Response>;onRefresh:()=>Promise<void>};
/** Access and retention actions are persisted decisions, never client-side status edits. */
export function ThreatGovernanceAdminEditor({detail,fetchWithAuth,onRefresh}:Props){
  const [state,setState]=useState<any>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [refresh,setRefresh]=useState(0);
  const base=`/api/threat-models/${detail.model.id}`;
  useEffect(()=>{const controller=new AbortController();setState(undefined);setError('');
    void Promise.all(['access-grants','lifecycle'].map(async path=>{const response=await fetchWithAuth(`${base}/${path}`,{signal:controller.signal});const body=await response.json();if(!response.ok||!body.success)throw new Error(body.error||'Governance load failed.');return body;})).then(([access,lifecycle])=>{if(!controller.signal.aborted)setState({grants:access.grants,...lifecycle.lifecycle});}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);});
    return()=>controller.abort();
  },[base,refresh]);
  const submit=async(event:React.FormEvent<HTMLFormElement>,path:string,transform?:(data:Record<string,FormDataEntryValue>)=>unknown)=>{event.preventDefault();const form=Object.fromEntries(new FormData(event.currentTarget));setBusy(true);setError('');try{const response=await fetchWithAuth(`${base}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(transform?transform(form):form)});const body=await response.json();if(!response.ok||!body.success)throw new Error(body.error||'Governance operation failed.');await onRefresh();setRefresh(value=>value+1);}catch(cause){setError(cause instanceof Error?cause.message:'Operation failed.');}finally{setBusy(false);}};
  const field=(name:string,label:string,type='text',required=true)=><label>{label}<input name={name} type={type} required={required} className="jira-input mt-1 w-full"/></label>;
  const save=<button className="jira-btn-primary" disabled={busy}>Record decision</button>;
  return <div className="space-y-4">{error&&<p role="alert" className="text-semantic-danger">{error}</p>}{!state?<button className="jira-btn-subtle" onClick={()=>setRefresh(value=>value+1)}>{error?'Retry':'Loading governance…'}</button>:<>
    <p>{state.model.status} · Retention: {state.model.retainUntil?new Date(state.model.retainUntil).toLocaleDateString():'Application lifecycle; at least 7 years after approved decommission'} · Legal hold: {state.model.legalHold?'ACTIVE':'None'} · Policy: {state.model.retentionPolicyVersionId||'Assigned at retirement'}</p>
    <details><summary>Scoped access grants</summary><p>Owner/security authority only. Grants do not override clearance or authorize security approval.</p>
      <form onSubmit={event=>void submit(event,'access-grants',data=>({...data,validUntil:new Date(String(data.validUntil)).toISOString()}))}><fieldset disabled={busy} className="grid md:grid-cols-2 gap-3">{field('userId','Active canonical user ID')}<label>Permission<select name="permission" className="jira-input w-full"><option>READ</option><option>CONTRIBUTE</option></select></label>{field('validUntil','Expires within 366 days','datetime-local')}{field('reason','Business reason')}{save}</fieldset></form>
      <ul className="space-y-3">{state.grants.map((grant:any)=><li key={grant.id}>{grant.user_id} · {grant.permission} · until {new Date(grant.valid_until).toLocaleString()} · {grant.revoked_at?'REVOKED':new Date(grant.valid_until)<=new Date()?'EXPIRED':'ACTIVE'}<p>{grant.reason}</p>{!grant.revoked_at&&<form onSubmit={event=>void submit(event,`access-grants/${grant.id}/revoke`)}><fieldset disabled={busy}>{field('reason','Revocation reason')}{save}</fieldset></form>}</li>)}</ul>
    </details>
    <details><summary>Evidence-backed retirement</summary><p>A different CISO must approve the current model version. Pending emergency obligations block retirement. No records are deleted.</p>
      <form key={state.model.version} onSubmit={event=>void submit(event,'retirement-requests',data=>({...data,version:state.model.version}))}><fieldset disabled={busy||['RETIRED','ARCHIVED'].includes(state.model.status)} className="grid md:grid-cols-2 gap-3">{field('changeTicketId','Decommission Change Request ID')}{field('attachmentId','Clean retained evidence attachment ID')}{field('reason','Decommission rationale')}{save}</fieldset></form>
      <ul className="space-y-3">{state.requests.map((request:any)=><li key={request.id}>Version {request.model_version} · {request.reason} · {request.decision||'PENDING'}{!request.decision&&<form onSubmit={event=>void submit(event,`retirement-requests/${request.id}/decision`)}><fieldset disabled={busy} className="grid gap-2"><label>CISO decision<select name="decision" className="jira-input"><option>APPROVED</option><option>REJECTED</option></select></label>{field('reason','Independent decision rationale')}{save}</fieldset></form>}</li>)}</ul>
    </details>
    <details><summary>Legal hold, archive and retention</summary><p>Only a different CISO may release a legal hold. Archive preserves all historical records and evidence references.</p>
      <form onSubmit={event=>void submit(event,'retention-events',data=>({...data,retainUntil:data.retainUntil?new Date(String(data.retainUntil)).toISOString():undefined}))}><fieldset disabled={busy} className="grid md:grid-cols-2 gap-3"><label>Action<select name="action" className="jira-input w-full">{['HOLD_SET','HOLD_RELEASED','ARCHIVED','RETENTION_EXTENDED'].map(action=><option key={action}>{action}</option>)}</select></label>{field('retainUntil','New retention end (extension only)','datetime-local',false)}{field('reason','Legal / policy rationale')}{save}</fieldset></form>
      <ul>{state.events.map((event:any)=><li key={event.id}>{event.action} · {new Date(event.occurred_at).toLocaleString()} · {event.reason} · {event.actor_id}</li>)}</ul>
    </details>
  </>}</div>;
}
