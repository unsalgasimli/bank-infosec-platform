import fs from 'fs';
import path from 'path';
import { initialSeedData } from '../db/seed.js';

const dbPath = path.resolve(process.cwd(), 'data', 'database.json');
fs.writeFileSync(dbPath, JSON.stringify(initialSeedData, null, 2), 'utf8');

console.log('✅ Reset data/database.json to an empty operational baseline.');
console.log('Run the approved AD/CMDB/scanner/workflow integrations to populate it.');
