import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const ROOT = path.resolve(process.cwd(), '.ui-audit');
const SHOTS = path.join(ROOT, 'shots');
const TEXTS = path.join(ROOT, 'text');

const ROUTES = [
  ['discovery-sources', '/assets-cmdb/discovery-sources'],
  ['discovery-runs', '/assets-cmdb/discovery-runs'],
  ['correlation-review', '/assets-cmdb/correlation-review'],
  ['configuration-items', '/assets-cmdb/configuration-items'],
  ['business-services', '/assets-cmdb/business-services'],
  ['applications', '/assets-cmdb/applications'],
  ['relationship-map', '/assets-cmdb/relationship-map'],
  ['knowledge-base', '/knowledge'],
  ['operational-analytics', '/analytics/operational'],
  ['executive-analytics', '/analytics/executive'],
  ['admin-request-forms', '/administration/request-forms'],
  ['admin-workflow-templates', '/administration/workflow-templates'],
  ['admin-automations', '/administration/automations'],
  ['admin-sla-policies', '/administration/sla-policies'],
  ['admin-departments', '/administration/departments'],
];

const waitForServer = async () => {
  for (let i = 0; i < 150; i++) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch { }
    await new Promise(r => setTimeout(r, 3000));
  }
  return false;
};

const report = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });
const loginRes = await context.request.post(`${BASE}/api/auth/ldap-login`, {
  headers: { 'Origin': BASE, 'Referer': BASE + '/' },
  data: { usernameOrEmail: 'new.username', password: '' },
});
console.log('LOGIN:', loginRes.status());
if (!loginRes.ok()) process.exit(1);

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 300)); });

for (const [slug, route] of ROUTES) {
  if (fs.existsSync(path.join(SHOTS, slug + '.png')) && fs.existsSync(path.join(TEXTS, slug + '.txt'))) {
    console.log('SKIP (have)', slug);
    continue;
  }
  pageErrors.length = 0;
  let done = false;
  for (let attempt = 1; attempt <= 6 && !done; attempt++) {
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const text = await page.evaluate(() => document.body.innerText);
      fs.writeFileSync(path.join(TEXTS, slug + '.txt'), text, 'utf8');
      await page.screenshot({ path: path.join(SHOTS, slug + '.png'), fullPage: true });
      const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
      report.push({ slug, ok: true, dims, errors: [...pageErrors] });
      console.log('OK', slug, `${dims.w}x${dims.h}`, 'errors:', pageErrors.length);
      done = true;
    } catch (e) {
      console.log('WAIT server, attempt', attempt, slug);
      await waitForServer();
    }
  }
  if (!done) report.push({ slug, ok: false });
}

fs.writeFileSync(path.join(ROOT, 'crawl-report-missing.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE-MISSING');
