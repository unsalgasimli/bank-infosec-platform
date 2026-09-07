import test from 'node:test';
import assert from 'node:assert/strict';
import {architectureSchemas,architectureEditSchema} from '../server/services/threat-architecture.schema.js';
import {architectureComponentTypes} from '../shared/threat-architecture.js';
test('architecture validates types, zones and captured mutation versions',()=>{
  const node={name:'API',type:'API',securityZone:'INTERNAL'};
  assert.equal(architectureSchemas.component.parse(node).securityZone,'INTERNAL');
  for(const input of [{...node,type:'SQL_INJECTION'},{...node,securityZone:''},{...node,name:'x'.repeat(256)}])assert.equal(architectureSchemas.component.safeParse(input).success,false);
  assert.equal(architectureEditSchema.safeParse({kind:'component',action:'UPDATE',contentVersion:0,reason:'Change'}).success,false);
  assert.equal(architectureEditSchema.safeParse({kind:'threats; DROP TABLE threats',action:'DELETE',contentVersion:1,reason:'Invalid'}).success,false);
});
test('flow input preserves unknown encryption and ignores client crossing and identity flags',()=>{
  const flow=architectureSchemas.flow.parse({name:'Requests',sourceComponentId:'a',destinationComponentId:'b',port:'443',encryptionInTransit:null,crossesTrustBoundary:false,revisionId:'foreign',contentVersion:100,dataTypes:['ID','ID']});
  assert.equal(flow.port,443);assert.equal(flow.encryptionInTransit,null);assert.deepEqual(flow.dataTypes,['ID']);
  assert.equal('crossesTrustBoundary' in flow,false);assert.equal('revisionId' in flow,false);assert.equal('contentVersion' in flow,false);
  assert.equal(architectureSchemas.flow.safeParse({...flow,port:65536}).success,false);
  assert.equal(architectureSchemas.flow.safeParse({...flow,encryptionInTransit:'false'}).success,false);
});
test('nullable fields round trip and boundary requirements remain typed booleans',()=>{
  const boundary=architectureSchemas.boundary.parse({name:'DMZ',boundaryType:'NETWORK',description:null,notes:undefined,authenticationRequired:false});
  assert.equal(boundary.description,null);assert.equal(boundary.authenticationRequired,false);assert.equal(boundary.encryptionRequired,true);
  assert.equal(architectureSchemas.boundary.safeParse({...boundary,encryptionRequired:'true'}).success,false);
});
test('all shared component types round trip with explicit unknown security context',()=>{
  for(const type of architectureComponentTypes){
    const node=architectureSchemas.component.parse({name:type,type,securityZone:'INTERNAL'});
    assert.equal(node.type,type);assert.equal(node.exposure,'UNKNOWN');assert.equal(node.authenticationMethod,null);
    assert.equal(node.privileges,'UNKNOWN');assert.equal(node.hosting,'UNKNOWN');assert.equal(node.environment,'UNKNOWN');
  }
});
test('node security context rejects unbounded or invented values',()=>{
  const node={name:'Gateway',type:'API_GATEWAY',securityZone:'DMZ'};
  for(const field of ['exposure','privileges','hosting','environment'])assert.equal(architectureSchemas.component.safeParse({...node,[field]:'GUARANTEED_SAFE'}).success,false);
  assert.equal(architectureSchemas.component.safeParse({...node,authenticationMethod:'x'.repeat(256)}).success,false);
});
test('flow context preserves false separately from unknown and rejects string booleans',()=>{
  const input={name:'Requests',sourceComponentId:'a',destinationComponentId:'b'};
  const unknown=architectureSchemas.flow.parse(input);assert.equal(unknown.internetExposure,null);assert.equal(unknown.thirdPartyInvolvement,null);assert.equal(unknown.integrityProtection,'UNKNOWN');assert.equal(unknown.logging,'UNKNOWN');
  const explicit=architectureSchemas.flow.parse({...input,internetExposure:false,thirdPartyInvolvement:false});assert.equal(explicit.internetExposure,false);assert.equal(explicit.thirdPartyInvolvement,false);
  for(const field of ['internetExposure','thirdPartyInvolvement'])assert.equal(architectureSchemas.flow.safeParse({...input,[field]:'false'}).success,false);
  for(const field of ['authorizationContext','purpose'])assert.equal(architectureSchemas.flow.safeParse({...input,[field]:'x'.repeat(4001)}).success,false);
  for(const field of ['integrityProtection','logging'])assert.equal(architectureSchemas.flow.safeParse({...input,[field]:'GUARANTEED_SAFE'}).success,false);
});
test('unencrypted transport cannot retain contradictory mechanism or version claims',()=>{
  const input={name:'Requests',sourceComponentId:'a',destinationComponentId:'b',encryptionInTransit:false};
  assert.equal(architectureSchemas.flow.safeParse({...input,encryptionMechanism:'TLS'}).success,false);
  assert.equal(architectureSchemas.flow.safeParse({...input,encryptionVersion:'1.3'}).success,false);
  assert.equal(architectureSchemas.flow.safeParse({...input,encryptionMechanism:'',encryptionVersion:null}).success,true);
  assert.equal(architectureSchemas.flow.safeParse({...input,encryptionInTransit:true,encryptionMechanism:'TLS',encryptionVersion:'1.3'}).success,true);
});
