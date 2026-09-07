import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { pgClient } from '../db/postgres/client.js';
import { ThreatModelRepository } from '../db/postgres/threat-model-repository.js';
import { ThreatModelService, enqueueOutbox } from './threat-model.service.js';
import { threatAuthoringSchema } from './threat-authoring.schema.js';
import { securityReviewer } from './threat-model-policy.js';
import { canonicalJson } from '../../shared/canonical-json.js';
import type { BankUser } from '../../shared/types/auth.js';

const newId=()=>randomUUID();
const digest=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const page=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).max(1000000).default(0)});
export const attackCaseSchema=z.object({
  threatId:z.string().min(1).max(64),contentVersion:z.number().int().positive(),title:z.string().trim().min(1).max(255),
  objective:z.string().trim().min(1).max(10000),assumptions:z.string().trim().min(1).max(10000),methodology:z.enum(['ABUSE_CASE','ATTACK_TREE']),
  nodes:z.array(z.object({key:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),parentKey:z.string().max(64).nullable(),kind:z.enum(['AND','OR','STEP']),label:z.string().trim().min(1).max(2000)})).min(1).max(100),
}).superRefine((value,context)=>{
  const nodes=new Map(value.nodes.map(node=>[node.key,node]));
  const fail=()=>context.addIssue({code:'custom',message:'Invalid rooted attack tree; unique nodes, one root, connected acyclic parents and valid AND/OR children required'});
  if(nodes.size!==value.nodes.length||value.nodes.filter(node=>node.parentKey===null).length!==1){fail();return;}
  for(const node of value.nodes){
    const children=value.nodes.filter(child=>child.parentKey===node.key);
    if((node.kind==='STEP'&&children.length)||(node.kind!=='STEP'&&children.length<2)){fail();return;}
    const visited=new Set([node.key]);let parent=node.parentKey;
    while(parent!==null){if(visited.has(parent)||!nodes.has(parent)){fail();return;}visited.add(parent);parent=nodes.get(parent)!.parentKey;}
  }
});

export class ThreatAnalysisService {
  static async list(modelId:string,input:unknown,actor:BankUser){
    await ThreatModelService.detail(modelId,actor);const query=page.parse(input);
    const suggestions=(await pgClient.query(`SELECT s.*,d.decision,d.reason,d.threat_id,d.decided_by,d.decided_at,
      s.architecture_version<>r.architecture_version AS stale FROM threat_analysis_suggestions s
      JOIN threat_model_revisions r ON r.id=s.revision_id JOIN threat_models m ON m.current_revision_id=r.id
      LEFT JOIN threat_suggestion_dispositions d ON d.suggestion_id=s.id WHERE m.id=$1 ORDER BY s.created_at,s.id LIMIT $2 OFFSET $3`,[modelId,query.limit+1,query.offset])).rows;
    const cases=(await pgClient.query(`SELECT c.* FROM threat_attack_cases c JOIN threat_models m ON m.current_revision_id=c.revision_id WHERE m.id=$1 ORDER BY c.created_at,c.id LIMIT $2 OFFSET $3`,[modelId,query.limit+1,query.offset])).rows;
    const nodes=(await pgClient.query('SELECT * FROM threat_attack_nodes WHERE case_id=ANY($1::varchar[]) ORDER BY ordinal',[cases.slice(0,query.limit).map(item=>item.id)])).rows;
    return {suggestions:suggestions.slice(0,query.limit),cases:cases.slice(0,query.limit).map(item=>({...item,nodes:nodes.filter(node=>node.case_id===item.id)})),hasMore:suggestions.length>query.limit||cases.length>query.limit};
  }

  static async suggest(modelId:string,input:unknown,actor:BankUser){
    const parsed=z.object({componentId:z.string().min(1).max(64)}).parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      const node=(await client.query('SELECT * FROM threat_model_components WHERE id=$1 AND revision_id=$2',[parsed.componentId,model.currentRevisionId])).rows[0];
      if(!node)throw new Error('Component must belong to the current revision.');
      const revision=(await client.query('SELECT architecture_version FROM threat_model_revisions WHERE id=$1',[model.currentRevisionId])).rows[0];
      const scenarios=[
        ['SPOOFING','An actor impersonates a trusted identity to access this component.','Validate identity and credential trust at every entry point.'],
        ['TAMPERING','An actor alters input or stored state outside authorized operations.','Validate integrity and authorization of state changes.'],
        ['REPUDIATION','A sensitive action cannot be attributed to an authenticated actor.','Record tamper-evident security events with attributable identity.'],
        ['INFORMATION_DISCLOSURE','An actor reads information outside the authorized data scope.','Verify object-level authorization and information exposure.'],
        ['DENIAL_OF_SERVICE','An actor exhausts resources and prevents legitimate processing.','Test resource limits and recovery under abusive load.'],
        ['ELEVATION_OF_PRIVILEGE','An actor crosses a privilege boundary to perform unauthorized operations.','Verify least privilege and separation of privileged operations.'],
      ];
      const ids:string[]=[];
      for(const [category,scenario,focus] of scenarios){
        const proposed=threatAuthoringSchema.parse({title:`${category}: ${node.name}`.slice(0,255),description:`Review ${node.name} (${node.type}) in zone ${node.security_zone||'UNKNOWN'}. ${focus}`,attackScenario:scenario,categories:[category],affectedComponentId:node.id,inherentLikelihood:3,inherentImpact:3,source:'RULE',assumptions:'Candidate hypothesis. Analyst must assess applicability, likelihood and impact before disposition.'});
        const sid=newId();const hash=digest({componentId:node.id,category,ruleVersion:'stride-node-v1',proposed});
        const inserted=await client.query(`INSERT INTO threat_analysis_suggestions(id,revision_id,architecture_version,source,rule_version,provenance_kind,proposed_content,fingerprint,created_by)
          VALUES($1,$2,$3,'RULE','stride-node-v1','SERVER_RULE',$4::jsonb,$5,$6) ON CONFLICT(revision_id,architecture_version,fingerprint) DO NOTHING RETURNING id`,[sid,model.currentRevisionId,revision.architecture_version,JSON.stringify(proposed),hash,actor.id]);
        if(inserted.rowCount)ids.push(sid);
      }
      if(ids.length)await ThreatModelRepository.audit(client,{id:newId(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'THREAT_SUGGESTIONS_CREATED',entityType:'THREAT_ANALYSIS',entityId:node.id,newValue:{ruleVersion:'stride-node-v1',architectureVersion:revision.architecture_version,suggestionIds:ids}});
      return {created:ids.length,suggestionIds:ids};
    });
  }

  static async importSuggestion(modelId:string,input:unknown,actor:BankUser){
    const parsed=z.object({source:z.enum(['AI_ASSISTED','IMPORT']),provider:z.string().trim().min(1).max(128),modelVersion:z.string().trim().min(1).max(128),provenanceReference:z.string().trim().min(1).max(2000),content:threatAuthoringSchema}).parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      const revision=(await client.query('SELECT architecture_version FROM threat_model_revisions WHERE id=$1',[model.currentRevisionId])).rows[0];
      const proposed={...parsed.content,source:parsed.source};
      // Provenance is explicitly user-supplied, never falsely attributed to a server AI call.
      const hash=digest({...parsed,content:proposed});const sid=newId();
      await client.query(`INSERT INTO threat_analysis_suggestions(id,revision_id,architecture_version,source,provider,model_version,provenance_kind,provenance_reference,proposed_content,fingerprint,created_by)
        VALUES($1,$2,$3,$4,$5,$6,'USER_SUPPLIED',$7,$8::jsonb,$9,$10)`,[sid,model.currentRevisionId,revision.architecture_version,parsed.source,parsed.provider,parsed.modelVersion,parsed.provenanceReference,JSON.stringify(proposed),hash,actor.id]);
      await ThreatModelRepository.audit(client,{id:newId(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'THREAT_SUGGESTION_IMPORTED',entityType:'THREAT_ANALYSIS',entityId:sid,newValue:{...parsed,provenanceKind:'USER_SUPPLIED',fingerprint:hash}});
      return {id:sid};
    });
  }

  static async decide(modelId:string,suggestionId:string,input:unknown,actor:BankUser){
    if(!securityReviewer(actor))throw new Error('Security authority required for analyst disposition.');
    const parsed=z.object({decision:z.enum(['ACCEPTED','MODIFIED','REJECTED','DUPLICATE']),reason:z.string().trim().min(1).max(4000),threatId:z.string().max(64).optional(),content:threatAuthoringSchema.optional()}).parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      const suggestion=(await client.query('SELECT * FROM threat_analysis_suggestions WHERE id=$1 AND revision_id=$2',[suggestionId,model.currentRevisionId])).rows[0];
      if(!suggestion)throw new Error('Suggestion not found in the current revision.');
      if((await client.query('SELECT 1 FROM threat_suggestion_dispositions WHERE suggestion_id=$1',[suggestionId])).rowCount)throw new Error('Suggestion already has an immutable analyst disposition.');
      let threatId:string|null=null;
      if(parsed.decision==='MODIFIED'&&!parsed.content)throw new Error('Modified disposition requires full assessed threat content.');
      if(parsed.decision==='ACCEPTED'||parsed.decision==='MODIFIED'){
        const threat=await ThreatModelService.addThreat(modelId,{...(parsed.decision==='MODIFIED'?parsed.content!:suggestion.proposed_content),source:suggestion.source},actor,client);
        threatId=threat.id;
      }else if(parsed.decision==='DUPLICATE'){
        if(!parsed.threatId||(await client.query('SELECT 1 FROM threats WHERE id=$1 AND revision_id=$2',[parsed.threatId,model.currentRevisionId])).rowCount!==1)throw new Error('Duplicate requires an existing threat in this revision.');
        threatId=parsed.threatId;
      }
      const dispositionId=newId();await client.query('INSERT INTO threat_suggestion_dispositions(id,suggestion_id,decision,reason,threat_id,decided_by) VALUES($1,$2,$3,$4,$5,$6)',[dispositionId,suggestionId,parsed.decision,parsed.reason,threatId,actor.id]);
      await ThreatModelRepository.audit(client,{id:newId(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'THREAT_SUGGESTION_DISPOSITION',entityType:'THREAT_ANALYSIS',entityId:suggestionId,newValue:{...parsed,threatId,dispositionId}});
      return {id:dispositionId,threatId,decision:parsed.decision};
    });
  }

  static async addCase(modelId:string,input:unknown,actor:BankUser){
    const parsed=attackCaseSchema.parse(input);
    return ThreatModelService.withAnalysisModel(modelId,actor,async(client,model)=>{
      const threat=(await client.query('SELECT * FROM threats WHERE id=$1 AND revision_id=$2',[parsed.threatId,model.currentRevisionId])).rows[0];
      if(!threat)throw new Error('Threat must belong to the current revision.');
      if(threat.content_version!==parsed.contentVersion)throw new Error('Threat changed by another editor; reload before adding analysis.');
      const caseId=newId();await client.query('INSERT INTO threat_attack_cases(id,revision_id,threat_id,title,objective,assumptions,methodology,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[caseId,model.currentRevisionId,threat.id,parsed.title,parsed.objective,parsed.assumptions,parsed.methodology,actor.id]);
      const ids=new Map(parsed.nodes.map(node=>[node.key,newId()]));
      for(const [ordinal,node] of parsed.nodes.entries())await client.query('INSERT INTO threat_attack_nodes(id,case_id,parent_id,node_kind,label,ordinal) VALUES($1,$2,$3,$4,$5,$6)',[ids.get(node.key),caseId,node.parentKey?ids.get(node.parentKey):null,node.kind,node.label,ordinal]);
      const controls=(await client.query('SELECT c.id,c.scope_version FROM threat_controls c JOIN threat_control_threats m ON m.control_id=c.id WHERE m.threat_id=$1',[threat.id])).rows;
      for(const control of controls)await enqueueOutbox(client,'threat-control.verification.required','THREAT_CONTROL',control.id,{threatModelId:modelId,controlId:control.id,scopeVersion:control.scope_version,reason:'ATTACK_ANALYSIS_CHANGED'},`analysis:${caseId}:${control.id}`);
      await ThreatModelRepository.audit(client,{id:newId(),modelId,revisionId:model.currentRevisionId,actorId:actor.id,action:'THREAT_ATTACK_CASE_CREATED',entityType:'THREAT_ANALYSIS',entityId:caseId,newValue:{...parsed,invalidatedControls:controls}});
      return {id:caseId};
    });
  }
}
