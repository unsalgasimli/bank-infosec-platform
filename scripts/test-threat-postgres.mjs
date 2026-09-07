import { spawnSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
const name=`aegis-tm-test-${randomUUID().slice(0,8)}`;
const password=randomBytes(24).toString('hex');
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,...options});if(r.error||r.status!==0)throw new Error(`${cmd} failed: ${r.stderr||r.error||r.status}`);return r.stdout;};
let started=false;
try {
  run('docker',['run','--detach','--name',name,'--publish','127.0.0.1::5432','--env',`POSTGRES_PASSWORD=${password}`,'--env','POSTGRES_DB=threat_integration','postgres:16.9-alpine']);started=true;
  let ready=false;for(let n=0;n<60;n++){const r=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{windowsHide:true});if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(!ready)throw new Error('Disposable PostgreSQL did not become ready');
  const port=run('docker',['port',name,'5432/tcp']).trim().split(':').at(-1);
  const env={...process.env,DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/threat_integration`,DATABASE_URL_FILE:'',DB_TYPE:'postgres',DB_NAME:'threat_integration',DB_HOST:'127.0.0.1',DB_PORT:port,DB_USER:'postgres',DB_PASSWORD:password,DB_SSL:'false',DB_POOL_MIN:'0',DB_POOL_MAX:'3',RUN_CMDB_DISCOVERY_INTEGRATION:'1',CMDB_DISCOVERY_DISPOSABLE_DATABASE:'1',RUN_THREAT_MODEL_POSTGRES_INTEGRATION:'1',THREAT_MODEL_DISPOSABLE_DATABASE:'1',THREAT_INTEGRATION_REQUIRED:'1'};
  const node=args=>run(process.execPath,['--import','tsx',...args],{env,stdio:'inherit'});
  node(['src/server/db/postgres/migrate.ts']);
  node(['src/server/db/postgres/migrate.ts']); // replay verifies migration checksums/idempotency
  node(['--import','./src/tests/setup.ts','--test','--test-concurrency=1','src/tests/threat-remediation-postgres.integration.test.ts','src/tests/threat-governance-postgres.integration.test.ts','src/tests/threat-model-postgres.integration.test.ts']);
} finally {
  // Exact uniquely created container only; no application containers or volumes.
  if(started)run('docker',['rm','--force',name]);
}
