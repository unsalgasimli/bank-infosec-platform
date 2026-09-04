import { z } from 'zod';

const optionalText=(max:number)=>z.string().trim().max(max).nullish().transform(value=>value||null);
const common={name:z.string().trim().min(1).max(255),description:optionalText(10000)};
export const architectureSchemas={
  component:z.object({...common,type:z.enum(['PROCESS','SERVICE','API','DATABASE','DATASTORE','QUEUE','EXTERNAL_SYSTEM','USER','ADMIN','THIRD_PARTY','NETWORK_ZONE','CLOUD_SERVICE','DEVICE','OTHER']),
    technology:optionalText(255),assetId:optionalText(128),ownerId:optionalText(64),criticality:z.enum(['CRITICAL','HIGH','MEDIUM','LOW']).or(z.literal('')).nullish().transform(value=>value||null),securityZone:z.string().trim().min(1).max(128)}),
  boundary:z.object({...common,boundaryType:z.string().trim().min(1).max(64),trustLevelFrom:optionalText(64),trustLevelTo:optionalText(64),authenticationRequired:z.boolean().default(true),encryptionRequired:z.boolean().default(true),notes:optionalText(10000)}),
  flow:z.object({...common,sourceComponentId:z.string().trim().min(1).max(64),destinationComponentId:z.string().trim().min(1).max(64),trustBoundaryId:optionalText(64),protocol:optionalText(64),
    port:z.preprocess(value=>value===''||value===undefined?null:value,z.coerce.number().int().min(1).max(65535).nullable()),authenticationMethod:optionalText(255),encryptionInTransit:z.boolean().nullable().optional().default(null),
    dataClassification:z.enum(['PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL_SECURITY_ONLY','HIGHLY_RESTRICTED_HR_LEGAL']).default('CONFIDENTIAL_SECURITY_ONLY'),dataTypes:z.array(z.string().trim().min(1).max(255)).max(100).default([]).transform(values=>[...new Set(values)].sort()),direction:z.enum(['ONE_WAY','BIDIRECTIONAL']).default('ONE_WAY'),notes:optionalText(10000)}),
};
export type ArchitectureKind=keyof typeof architectureSchemas;
export const architectureEditSchema=z.object({kind:z.enum(['component','boundary','flow']),action:z.enum(['UPDATE','DELETE']),contentVersion:z.number().int().positive(),reason:z.string().trim().min(1).max(4000)});
// Identifiers used in SQL are fixed allowlists, never client-supplied SQL fragments.
export const architectureStorage={
  component:{table:'threat_model_components',fields:{name:'name',type:'type',description:'description',technology:'technology',assetId:'asset_id',ownerId:'owner_id',criticality:'criticality',securityZone:'security_zone'}},
  boundary:{table:'threat_model_trust_boundaries',fields:{name:'name',description:'description',boundaryType:'boundary_type',trustLevelFrom:'trust_level_from',trustLevelTo:'trust_level_to',authenticationRequired:'authentication_required',encryptionRequired:'encryption_required',notes:'notes'}},
  flow:{table:'threat_model_data_flows',fields:{name:'name',description:'description',sourceComponentId:'source_component_id',destinationComponentId:'destination_component_id',trustBoundaryId:'trust_boundary_id',protocol:'protocol',port:'port',authenticationMethod:'authentication_method',encryptionInTransit:'encryption_in_transit',dataClassification:'data_classification',dataTypes:'data_types',direction:'direction',notes:'notes'}},
};
