import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const OUT = new URL('./', import.meta.url).pathname.replace(/^\//, '');
const ROOT = path.resolve(process.cwd(), '.ui-audit');
const SHOTS = path.join(ROOT, 'shots');
const TEXTS = path.join(ROOT, 'text');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(TEXTS, { recursive: true });

const ROUTES = [
  ['my-work-overview', '/my-work/overview'],
  ['my-tasks', '/my-work/tasks'],
  ['my-requests', '/my-work/requests'],
  ['approvals', '/my-work/approvals'],
  ['projects-tasks-table', '/work-management/projects-tasks'],
  ['projects-tasks-kanban', '/work-management/projects-tasks?view=kanban'],
  ['workflows', '/work-management/workflows'],
  ['ideate', '/work-management/ideate'],
  ['service-incidents', '/service-management/incidents'],
  ['service-requests', '/service-management/requests'],
  ['service-changes', '/service-management/changes'],
  ['service-problems', '/service-management/problems'],
  ['service-catalog', '/service-management/catalog'],
  ['vulnerabilities', '/security-grc/vulnerabilities'],
  ['security-incidents', '/security-grc/security-incidents'],
  ['policy-exceptions', '/security-grc/policy-exceptions'],
  ['risk-management', '/security-grc/risk-management'],
  ['threat-modeling', '/security-grc/threat-modeling'],
  ['audit-compliance', '/security-grc/audit-compliance'],
  ['dlp', '/security-grc/dlp'],
  ['asset-inventory', '/assets-cmdb/inventory'],
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
  ['admin-taxonomy', '/administration/taxonomy'],
  ['admin-integrations', '/administration/integrations'],
  ['admin-settings', '/administration/settings'],
  ['dept-admin', '/administration/departments/manage'],
];

const report = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });

// Login via API to seed the session cookie for the SPA origin.
const loginRes = await context.request.post(`${BASE}/api/auth/ldap-login`, {
  headers: { 'Origin': BASE, 'Referer': BASE + '/' },
  data: { usernameOrEmail: 'new.username', password: '' },
});
const loginBody = await loginRes.json().catch(() => ({}));
console.log('LOGIN:', loginRes.status(), JSON.stringify(loginBody).slice(0, 200));
if (!loginRes.ok()) { process.exit(1); }

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 300)); });

for (const [slug, route] of ROUTES) {
  pageErrors.length = 0;
  const url = BASE + route;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      // dismiss any overlay that blocks content capture? capture as-is instead (it is part of UX)
      const text = await page.evaluate(() => document.body.innerText);
      fs.writeFileSync(path.join(TEXTS, slug + '.txt'), text, 'utf8');
      await page.screenshot({ path: path.join(SHOTS, slug + '.png'), fullPage: true });
      const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: window.innerWidth }));
      report.push({ slug, route, ok: true, textChars: text.length, dims, errors: [...pageErrors] });
      console.log('OK', slug, `${dims.w}x${dims.h}`, 'errors:', pageErrors.length);
      break;
    } catch (e) {
      if (attempt === 3) {
        report.push({ slug, route, ok: false, error: String(e).slice(0, 300), errors: [...pageErrors] });
        console.log('FAIL', slug, String(e).slice(0, 200));
      } else {
        console.log('RETRY', slug, 'attempt', attempt);
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  }
}

fs.writeFileSync(path.join(ROOT, 'crawl-report.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE');
