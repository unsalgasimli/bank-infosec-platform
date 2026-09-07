import { z } from 'zod';
import { createHash } from 'node:crypto';

const httpsReference=z.string().url().max(2000).refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!url.search;},'Use an HTTPS reference without credentials, query tokens or fragments');
/** Caller claims are correlation metadata only, never trusted identity or verification evidence. */
export const deliveryContextSchema=z.object({
  provider:z.enum(['GITLAB','OTHER']),repositoryUrl:httpsReference,commitSha:z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  pipelineId:z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/),pipelineUrl:httpsReference,
  environment:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/),releaseId:z.string().min(1).max(64),modelId:z.string().min(1).max(64),
}).strict();
export type DeliveryContext=z.infer<typeof deliveryContextSchema>;
export type ConsumedSecurityAuthorization={authorizationId:string;revisionId:string;releaseId:string;gate:{allowed:boolean};deploymentExecuted:false};
/** A future adapter must authenticate the provider, enforce protected targets and persist idempotent execution receipts. */
export interface ThreatDeliveryAdapter {
  readonly provider:DeliveryContext['provider'];
  verifyTarget(context:DeliveryContext):Promise<void>;
  deploy(context:DeliveryContext,authorization:ConsumedSecurityAuthorization,idempotencyKey:string):Promise<{executionReference:string}>;
}
export const deliveryIntegrationStatus=Object.freeze({contractVersion:1,status:'NOT_CONFIGURED',directGitLabIntegration:false,deploymentEnabled:false,authorizationIsDeployment:false});

/** Not mounted as a deployment endpoint. No adapter is registered by default. */
export async function executeWithDeliveryAdapter(input:unknown,dependencies:{adapter?:ThreatDeliveryAdapter;consume:(context:DeliveryContext,idempotencyKey:string)=>Promise<ConsumedSecurityAuthorization>}){
  const context=deliveryContextSchema.parse(input);
  if(!dependencies.adapter)throw new Error('Delivery integration is not configured; no authorization was consumed and no deployment was executed.');
  if(dependencies.adapter.provider!==context.provider)throw new Error('Delivery provider mismatch.');
  const key=createHash('sha256').update(JSON.stringify(context)).digest('hex');
  // Verify the authenticated provider/target BEFORE spending the short-lived authorization.
  await dependencies.adapter.verifyTarget(context);
  const decision=await dependencies.consume(context,key);
  if(!decision.gate.allowed||decision.releaseId!==context.releaseId||!decision.revisionId||decision.deploymentExecuted!==false)throw new Error('Fresh scoped release authorization is required.');
  return dependencies.adapter.deploy(context,decision,key);
}
