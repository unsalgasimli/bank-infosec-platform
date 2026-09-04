import test from 'node:test';
import assert from 'node:assert/strict';
import {architectureSchemas,architectureEditSchema} from '../server/services/threat-architecture.schema.js';
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
