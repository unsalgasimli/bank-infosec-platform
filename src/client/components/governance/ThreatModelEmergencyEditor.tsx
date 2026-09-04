import React, { useState } from 'react';

type Emergency = {
  id:string; change_id:string; status:string; reason:string; security_impact:string;
  requested_at:string; review_due_at?:string; model_update_due_at?:string; reviewed_at?:string;
  model_updated_at?:string; reviewBreached:boolean; modelUpdateBreached:boolean;
};
type Props = {modelId:string; changeId?:string; emergencies:Emergency[]; fetchWithAuth:(url:string,options?:RequestInit)=>Promise<Response>; onRefresh:()=>Promise<void>};

export function ThreatModelEmergencyEditor({modelId,changeId,emergencies,fetchWithAuth,onRefresh}:Props) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [authorization,setAuthorization]=useState<{authorizationId:string;authorization:string;expiresAt:string;emergencyChangeId:string;releaseId:string}>();
  const base=`/api/threat-models/${modelId}`;
  const date=(value?:string)=>value ? new Date(value).toLocaleString() : 'Pending';
  const call=async(path:string,body:unknown)=>{
    const response=await fetchWithAuth(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json(); if(!response.ok || !result.success) throw new Error(result.error || 'Emergency operation failed.'); return result;
  };
  const submit=async(event:React.FormEvent<HTMLFormElement>,action:(form:FormData)=>Promise<void|false>)=>{
    event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true);setError('');setNotice('');
    try {if(await action(form)!==false) await onRefresh();setNotice('Server record saved. No deployment was executed by this screen.');}
    catch(cause){setError(cause instanceof Error ? cause.message : 'Emergency operation failed.');}
    finally{setBusy(false);}
  };
  const field=(name:string,label:string,value='',type='text')=><label>{label}<input name={name} className="jira-input mt-1 w-full" required type={type} step={type==='datetime-local' ? '1' : undefined} defaultValue={value}/></label>;
  const choice=(items:Emergency[])=><label>Emergency request<select name="emergencyId" className="jira-input mt-1 w-full" required defaultValue=""><option value="">Select request…</option>{items.map(item=><option key={item.id} value={item.id}>{item.reason} · {item.status}</option>)}</select></label>;
  const save=(label:string)=><button className="jira-btn-primary" type="submit" disabled={busy}>{label}</button>;
  const post=(suffix:string)=>(form:FormData)=>call(`${base}/emergencies/${form.get('emergencyId')}/${suffix}`,Object.fromEntries(form)).then(()=>undefined);
  return <section className="space-y-4">
    <p>Emergency authorization adds independent CISO review; it never overrides the normal release security gate. Every recorded emergency requires a post-change review within 2 bank business days and an approved model update within 5.</p>
    {error && <div role="alert" className="text-semantic-danger border p-3 rounded">{error}</div>}
    {notice && <p role="status">{notice}</p>}
    <ul className="space-y-2">{emergencies.map(item=><li key={item.id} className="border border-semantic-jira-border p-3 rounded"><strong>{item.reason}</strong> · {item.status}<p>{item.security_impact}</p><p>Review: {date(item.review_due_at)} · {item.reviewed_at ? 'Reviewed' : 'Not reviewed'} {item.reviewBreached && ' · SLA BREACHED'}</p><p>Model update: {date(item.model_update_due_at)} · {item.model_updated_at ? 'Approved update recorded' : 'Pending'} {item.modelUpdateBreached && ' · SLA BREACHED'}</p><small>{item.id}</small></li>)}</ul>
    <details open={!emergencies.length}><summary>Minimum security impact assessment</summary>
      <form onSubmit={event=>void submit(event,form=>call(`${base}/emergencies`,Object.fromEntries(form)).then(()=>undefined))}><fieldset disabled={busy} className="grid md:grid-cols-2 gap-3 mt-3">
        {field('changeId','Canonical linked change / release ID',changeId)}{field('reason','Why this change is an emergency')}{field('securityImpact','Affected scope, data, identity and security impact')}{field('compensatingControls','Compensating controls and monitoring')}{field('rollbackPlan','Rollback plan and rollback conditions')}{save('Request independent authorization')}
      </fieldset></form>
    </details>
    <details><summary>CISO decision</summary><form onSubmit={event=>void submit(event,post('decision'))}><fieldset disabled={busy} className="grid gap-3 mt-3">{choice(emergencies.filter(item=>['REQUESTED','APPROVED'].includes(item.status)))}<label>Decision<select name="decision" className="jira-input mt-1 w-full"><option>APPROVED</option><option>REJECTED</option><option>REVOKED</option></select></label>{field('reason','Independent decision rationale')}{save('Record decision')}</fieldset></form></details>
    <details><summary>Execution-time release authorization</summary>
      <p>This screen does not deploy software. Issue and consume a short-lived authorization immediately before your external deployment. The server checks the current revision, evidence and risk again.</p>
      <form onSubmit={event=>void submit(event,async form=>{
        const selected=emergencies.find(item=>item.id===form.get('emergencyId')); if(!selected) throw new Error('Select an approved emergency.');
        const result=await call(`${base}/release-authorization`,{releaseId:selected.change_id,emergencyChangeId:selected.id});
        setAuthorization({...result.releaseAuthorization,releaseId:selected.change_id});
        return false;
      })}><fieldset disabled={busy} className="grid gap-3 mt-3">{choice(emergencies.filter(item=>item.status==='APPROVED'))}{save('Issue short-lived authorization')}</fieldset></form>
      {authorization && <div className="border p-3 mt-3"><p>Authorization {authorization.authorizationId} · expires {date(authorization.expiresAt)}</p><form onSubmit={event=>void submit(event,async form=>{
        await call(`${base}/release-authorization/consume`,{releaseId:authorization.releaseId,authorization:authorization.authorization,idempotencyKey:form.get('idempotencyKey')});
        return false;
      })}><fieldset disabled={busy} className="grid gap-3">{field('idempotencyKey','Unique external execution / pipeline job key')}{save('Consume authorization (does not deploy)')}</fieldset></form></div>}
    </details>
    <details><summary>Record evidence of external deployment</summary><p>Operator attestation is recorded separately from execution. Attach the actual deployment result to the canonical change first; scanned evidence and the consumed authorization are required.</p><form onSubmit={event=>void submit(event,form=>{
      const deployedAt=new Date(String(form.get('deployedAt'))).toISOString();
      return call(`${base}/emergencies/${form.get('emergencyId')}/deployment`,{...Object.fromEntries(form),deployedAt}).then(()=>undefined);
    })}><fieldset disabled={busy} className="grid md:grid-cols-2 gap-3 mt-3">{choice(emergencies.filter(item=>item.status==='APPROVED'))}{field('authorizationId','Consumed authorization ID',authorization?.authorizationId)}{field('executionReference','External deployment reference / run URL')}{field('attachmentId','Clean deployment evidence attachment ID')}{field('deployedAt','Actual deployment time (local)','','datetime-local')}{save('Record external deployment evidence')}</fieldset></form></details>
    <details><summary>Independent post-change review</summary><form onSubmit={event=>void submit(event,post('review'))}><fieldset disabled={busy} className="grid gap-3 mt-3">{choice(emergencies.filter(item=>item.status==='DEPLOYED' && !item.reviewed_at))}{field('findings','Review findings, security impact and follow-up assessment')}{field('attachmentId','Clean review evidence attachment ID')}{save('Record independent review')}</fieldset></form></details>
    <details><summary>Close after model revalidation</summary><p>Complete screening and the normal revision approval workflow first. Closure requires an approved post-deployment revision and completed independent review; historical SLA breaches remain visible.</p><form onSubmit={event=>void submit(event,post('close'))}><fieldset disabled={busy} className="grid gap-3 mt-3">{choice(emergencies.filter(item=>item.status==='DEPLOYED' && Boolean(item.reviewed_at)))}{save('Close completed emergency')}</fieldset></form></details>
  </section>;
}
