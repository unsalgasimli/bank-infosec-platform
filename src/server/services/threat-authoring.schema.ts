import { z } from 'zod';

const optionalText = (maximum: number) => z.string().trim().max(maximum).nullish().transform(value=>value??'');
export const threatAuthoringSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(20000),
  attackScenario: z.string().trim().min(1).max(20000),
  categories: z.array(z.enum(['SPOOFING','TAMPERING','REPUDIATION','INFORMATION_DISCLOSURE','DENIAL_OF_SERVICE','ELEVATION_OF_PRIVILEGE','BUSINESS_ABUSE','FRAUD','PRIVILEGE_ABUSE','WORKFLOW_BYPASS','SEGREGATION_OF_DUTIES_BYPASS','TRANSACTION_MANIPULATION','REPLAY','ACCOUNT_TAKEOVER','API_ABUSE','AUTOMATION_ABUSE','DATA_EXFILTRATION','INSIDER_THREAT','THIRD_PARTY_COMPROMISE'])).min(1).max(19).transform(values => [...new Set(values)].sort()),
  attackerType: optionalText(255), attackerCapability: optionalText(255),
  preconditions: optionalText(10000), attackPath: optionalText(20000),
  methodology: z.enum(['STRIDE','ABUSE_CASE','ATTACK_TREE','OTHER']).default('STRIDE'),
  source: z.enum(['MANUAL','AI_ASSISTED','RULE','IMPORT','LEGACY_UNSPECIFIED']).default('MANUAL'),
  assumptions: optionalText(10000),
  confidentialityImpact: z.number().int().min(1).max(5).nullish().transform(value=>value??null),
  integrityImpact: z.number().int().min(1).max(5).nullish().transform(value=>value??null),
  availabilityImpact: z.number().int().min(1).max(5).nullish().transform(value=>value??null),
  securityProperties: z.array(z.enum(['CONFIDENTIALITY','INTEGRITY','AVAILABILITY','AUTHENTICITY','ACCOUNTABILITY','NON_REPUDIATION'])).max(6).default([]).transform(values=>[...new Set(values)].sort()),
  affectedComponentId: optionalText(64), affectedDataFlowId: optionalText(64),
  affectedTrustBoundaryId: optionalText(64), affectedAssetId: optionalText(128),
  cweIds: z.array(z.string().trim().regex(/^CWE-\d+$/)).max(100).optional().default([]).transform(values => [...new Set(values)].sort()),
  capecIds: z.array(z.string().trim().regex(/^CAPEC-\d+$/)).max(100).optional().default([]).transform(values => [...new Set(values)].sort()),
  inherentLikelihood: z.coerce.number().int().min(1).max(5),
  inherentImpact: z.coerce.number().int().min(1).max(5),
  ownerId: optionalText(64),
  dueDate: optionalText(10).refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value), 'Invalid due date'),
});
export const threatContextStorage={methodology:'methodology',source:'source',assumptions:'assumptions',confidentialityImpact:'confidentiality_impact',integrityImpact:'integrity_impact',availabilityImpact:'availability_impact',securityProperties:'security_properties'} as const;
export const threatEditSchema = threatAuthoringSchema.extend({
  contentVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(4000),
});
