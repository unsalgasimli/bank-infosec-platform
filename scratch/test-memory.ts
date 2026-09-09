import { db } from '../src/server/db/database.js';
import { CmdbApiService } from '../src/server/services/cmdb-api.service.js';
import { DepartmentsRepository } from '../src/server/db/postgres/departments-repository.js';
import { NotificationService } from '../src/server/services/notification.service.js';

async function test() {
  await db.initialize();
  const actor = db.data.users.find(u => u.roles?.includes('PLATFORM_ADMIN')) || db.data.users[0];
  console.log('Using actor:', actor.username, 'roles:', actor.roles);
  
  console.log('Testing listConnectorRuns in loop...');
  for (let i = 0; i < 50; i++) {
    await CmdbApiService.listConnectorRuns(actor, 'dconn-lo1zl4d6takmtk4aew7', 25);
  }
  console.log('After listConnectorRuns heapUsed (MB):', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

  console.log('Testing discoveryCoverage in loop...');
  for (let i = 0; i < 50; i++) {
    await CmdbApiService.discoveryCoverage(actor);
  }
  console.log('After discoveryCoverage heapUsed (MB):', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

  console.log('Testing DepartmentsRepository.list in loop...');
  for (let i = 0; i < 50; i++) {
    await DepartmentsRepository.list();
  }
  console.log('After DepartmentsRepository.list heapUsed (MB):', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

  console.log('Testing NotificationService.getUserNotifications in loop...');
  for (let i = 0; i < 50; i++) {
    NotificationService.getUserNotifications(actor.id);
  }
  console.log('After NotificationService heapUsed (MB):', Math.round(process.memoryUsage().heapUsed / 1024 / 1024));

  process.exit(0);
}

test().catch(console.error);
