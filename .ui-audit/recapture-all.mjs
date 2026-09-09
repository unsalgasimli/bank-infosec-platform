import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const ROOT = path.resolve(process.cwd(), '.ui-audit');
const SHOTS = path.join(ROOT, 'shots');
const TEXTS = path.join(ROOT, 'text');

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

const stableApi = async () => {
  let streak = 0;
  for (let i = 0; i < 100 && streak < 3; i++) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000);
      const r = await fetch('http://127.0.0.1:4001/api/health', { signal: c.signal });
      clearTimeout(t);
      streak = r.ok ? streak + 1 : 0;
    } catch { streak = 0; }
    await new Promise(r => setTimeout(r, 2500));
  }
  return streak >= 3;
};

console.log('Waiting for stable API...');
if (!(await stableApi())) { console.log('API never stabilized'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });

let loginRes = null;
for (let i = 1; i <= 10 && !loginRes; i++) {
  try {
    const res = await context.request.post(`${BASE}/api/auth/ldap-login`, {
      headers: { 'Origin': BASE, 'Referer': BASE + '/' },
      data: { usernameOrEmail: 'new.username', password: '' },
      timeout: 45000,
    });
    if (res.ok()) { loginRes = res; break; }
    console.log('LOGIN attempt', i, 'status', res.status());
  } catch (e) {
    console.log('LOGIN attempt', i, 'network fail');
    await stableApi();
  }
  await new Promise(r => setTimeout(r, 5000));
}
if (!loginRes) { console.log('LOGIN never succeeded'); process.exit(1); }
console.log('LOGIN OK');

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 300)); });

const LOADING_RE = /Loading secure workspace|Sessiyası Yoxlanılır|Yüklənir\.\.\./i;

const report = [];
for (const [slug, route] of ROUTES) {
  pageErrors.length = 0;
  let captured = false;
  for (let attempt = 1; attempt <= 3 && !captured; attempt++) {
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForFunction(
        (reSrc) => {
          const re = new RegExp(reSrc, 'i');
          const t = document.body.innerText || '';
          return t.length > 400 && !re.test(t);
        },
        LOADING_RE.source,
        { timeout: 30000 }
      );
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1800);
      const text = await page.evaluate(() => document.body.innerText);
      if (LOADING_RE.test(text) || text.length < 500) {
        console.log('INVALID', slug, 'len', text.length, 'attempt', attempt, '— retrying');
        continue;
      }
      fs.writeFileSync(path.join(TEXTS, slug + '.txt'), text, 'utf8');
      await page.screenshot({ path: path.join(SHOTS, slug + '.png'), fullPage: true });
      const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
      report.push({ slug, route, ok: true, chars: text.length, dims, errors: [...pageErrors] });
      console.log('OK', slug, 'chars', text.length, `${dims.w}x${dims.h}`, 'errors:', pageErrors.length);
      captured = true;
    } catch (e) {
      console.log('RETRY', slug, 'attempt', attempt, String(e).slice(0, 120));
      await stableApi();
    }
  }
  if (!captured) {
    report.push({ slug, route, ok: false, errors: [...pageErrors] });
    console.log('FAIL', slug);
  }
}

fs.writeFileSync(path.join(ROOT, 'crawl-report-final.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE-FINAL');
