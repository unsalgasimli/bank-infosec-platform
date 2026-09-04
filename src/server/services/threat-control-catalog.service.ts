import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BankUser } from '../../shared/types/auth.js';
import { pgClient } from '../db/postgres/client.js';
import { securityReviewer } from './threat-model-policy.js';
import { CONFIDENTIALITY_LEVELS } from './auth.service.js';
import { AuditService } from './audit.service.js';
import { canonicalJson } from '../../shared/canonical-json.js';

type RequestContext={correlationId?:string;ipAddress?:string;userAgent?:string};

const definition = z.object({
  code:z.string().trim().regex(/^[A-Z][A-Z0-9_-]{1,63}$/),
  baseVersion:z.number().int().min(0),
  title:z.string().trim().min(1).max(255),description:z.string().trim().min(1).max(10000),
  controlFunction:z.enum(['PREVENTIVE','DETECTIVE','CORRECTIVE','COMPENSATING']),
  verificationGuidance:z.string().trim().min(1).max(10000),
  referenceUrl:z.string().url().max(2000).refine(value=>value.startsWith('https://'),'An HTTPS reference is required.').optional(),
}).strict();

/** Generic bank control definitions only. Instances, tickets and evidence remain in the existing model domain. */
export class ThreatControlCatalogService {
  private static readable(actor:BankUser) {
    if (!actor.isActive || (CONFIDENTIALITY_LEVELS[actor.securityClearance] ?? 0) < CONFIDENTIALITY_LEVELS.INTERNAL) throw new Error('Control catalog access is restricted.');
  }
  static async list(input:Record<string,unknown>,actor:BankUser) {
    this.readable(actor);
    const paging=z.object({search:z.string().trim().max(100).default(''),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).default(0)}).parse(input);
    const result=await pgClient.query(`SELECT v.*,COALESCE(d.decision,'DRAFT') AS status,d.decided_by,d.reason AS decision_reason FROM threat_control_catalog_versions v LEFT JOIN LATERAL(SELECT * FROM threat_control_catalog_decisions WHERE catalog_version_id=v.id ORDER BY event_sequence DESC LIMIT 1) d ON true WHERE v.organization_id='org-bank' AND ($1='' OR strpos(lower(v.code || ' ' || v.title),lower($1))>0) ORDER BY v.code,v.version DESC LIMIT $2 OFFSET $3`,[paging.search,paging.limit,paging.offset]);
    return result.rows;
  }
  static async create(input:Record<string,unknown>,actor:BankUser,request:RequestContext={}) {
    this.readable(actor); if(!securityReviewer(actor)) throw new Error('AppSec control catalog management authority is required.');
    const value=definition.parse(input);
    return pgClient.transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('control-catalog:' || $1))",[value.code]);
      const current=Number((await client.query("SELECT COALESCE(max(version),0) AS version FROM threat_control_catalog_versions WHERE organization_id='org-bank' AND code=$1",[value.code])).rows[0].version);
      if(current!==value.baseVersion) throw new Error('Catalog version changed by another author; reload before creating a revision.');
      const id=`tcc-${randomUUID()}`;
      const created=(await client.query(`INSERT INTO threat_control_catalog_versions(id,organization_id,code,version,title,description,control_function,verification_guidance,reference_url,created_by) VALUES($1,'org-bank',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,value.code,current+1,value.title,value.description,value.controlFunction,value.verificationGuidance,value.referenceUrl || null,actor.id])).rows[0];
      await AuditService.logPostgres(client,{actor,action:'THREAT_CONTROL_CATALOG_CREATED',entityType:'THREAT_CONTROL_DEFINITION',entityId:id,...request,after:created,metadata:{sha256:createHash('sha256').update(canonicalJson(created)).digest('hex')}});
      return created;
    });
  }
  static async decide(versionId:string,input:Record<string,unknown>,actor:BankUser,request:RequestContext={}) {
    this.readable(actor); if(!securityReviewer(actor)) throw new Error('Independent AppSec catalog approval authority is required.');
    const value=z.object({decision:z.enum(['PUBLISHED','RETIRED']),reason:z.string().trim().min(1).max(10000)}).strict().parse(input);
    return pgClient.transaction(async client=>{
      const version=(await client.query("SELECT * FROM threat_control_catalog_versions WHERE id=$1 AND organization_id='org-bank' FOR UPDATE",[versionId])).rows[0];
      if(!version) throw new Error('Control catalog version not found.');
      if(version.created_by===actor.id) throw new Error('Catalog author cannot approve their own definition.');
      const latest=(await client.query('SELECT decision FROM threat_control_catalog_decisions WHERE catalog_version_id=$1 ORDER BY event_sequence DESC LIMIT 1',[versionId])).rows[0]?.decision || 'DRAFT';
      if(!((latest==='DRAFT' && value.decision==='PUBLISHED') || (latest==='PUBLISHED' && value.decision==='RETIRED'))) throw new Error('Invalid catalog transition; retired definitions require a new version.');
      const decided=(await client.query('INSERT INTO threat_control_catalog_decisions(id,catalog_version_id,decision,reason,decided_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[`tccd-${randomUUID()}`,versionId,value.decision,value.reason,actor.id])).rows[0];
      await AuditService.logPostgres(client,{actor,action:value.decision==='PUBLISHED'?'THREAT_CONTROL_CATALOG_PUBLISHED':'THREAT_CONTROL_CATALOG_RETIRED',entityType:'THREAT_CONTROL_DEFINITION',entityId:versionId,...request,before:{status:latest},after:decided,metadata:{definitionSha256:createHash('sha256').update(canonicalJson(version)).digest('hex')}});
      return decided;
    });
  }
}
