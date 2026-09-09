import {pgClient} from '../db/postgres/client.js';
import {logger} from './logger.service.js';
import {hasThreatCapability} from '../../shared/threat-permissions.js';
import type {BankUser} from '../../shared/types/auth.js';
import {config} from '../config/index.js';
export class ThreatGovernanceOperationsService {
 static async observe(eventId:string|undefined,consumer:string,attempt:number,state:'SUCCEEDED'|'RETRY'|'DEAD_LETTER',error?:unknown){
  if(!eventId||config.DB_TYPE!=='postgres')return;
  try{await pgClient.query(`INSERT INTO event_consumer_attempts(event_id,consumer_name,attempt,state,error_code)
   SELECT id,$2,$3,$4,$5 FROM outbox_events WHERE id=$1 AND topic LIKE 'threat-%' ON CONFLICT DO NOTHING`,[eventId,consumer,attempt,state,error instanceof Error?error.name.slice(0,128):null]);}
  catch(error){logger.error({error,eventId,state},'Governance worker observability persistence failed');}
 }
 static async metrics(){
  const row=(await pgClient.query(`WITH scoped AS(SELECT * FROM outbox_events WHERE topic LIKE 'threat-%'),latest AS(
    SELECT DISTINCT ON(a.event_id,a.consumer_name) a.* FROM event_consumer_attempts a JOIN scoped s ON s.id=a.event_id ORDER BY a.event_id,a.consumer_name,a.sequence DESC)
   SELECT (SELECT count(*)::int FROM scoped WHERE status<>'PUBLISHED') AS pending_publication,
    (SELECT min(occurred_at) FROM scoped WHERE status<>'PUBLISHED') AS oldest_pending,
    (SELECT COALESCE(max(extract(epoch FROM now()-s.occurred_at)),0)::float FROM scoped s WHERE NOT EXISTS(SELECT 1 FROM event_consumer_receipts r WHERE r.event_id=s.id)) AS processing_lag_seconds,
    (SELECT count(*)::int FROM latest WHERE state='DEAD_LETTER') AS dead_letter_events,
    (SELECT count(*)::int FROM latest WHERE state='RETRY') AS retrying_events,
    (SELECT COALESCE(sum(attempts),0)::int FROM scoped) AS publication_attempts,
    (SELECT COALESCE(sum(attempt),0)::int FROM latest) AS consumer_retries,
    (SELECT count(*)::int FROM scoped WHERE last_error IS NOT NULL) AS publication_failures`)).rows[0];
  const alerts=[];
  if(row.processing_lag_seconds>300)alerts.push({code:'GOVERNANCE_PROCESSING_LAG',severity:'HIGH',message:'Security governance events have awaited processing for over five minutes.'});
  if(row.dead_letter_events)alerts.push({code:'GOVERNANCE_DEAD_LETTER',severity:'CRITICAL',message:'Security governance events require dead-letter investigation.'});
  return {...row,alerts};
 }
 static async get(actor:BankUser){if(!actor.isActive||(!hasThreatCapability(actor,'threat_model.admin')&&!actor.roles.includes('AUDITOR')))throw new Error('Governance operations authority required');return this.metrics();}
 static async alert(){const result=await this.metrics();for(const alert of result.alerts)logger.error({...alert,processingLagSeconds:result.processing_lag_seconds,deadLetterEvents:result.dead_letter_events},alert.message);}
}
