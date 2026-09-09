import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const ROOT = path.resolve(process.cwd(), '.ui-audit');
const SHOTS = path.join(ROOT, 'shots');
const TEXTS = path.join(ROOT, 'text');

const ROUTES = [
  ['risk-management', '/security-grc/risk-management'],
  ['threat-modeling', '/security-grc/threat-modeling'],
  ['security-incidents', '/security-grc/security-incidents'],
  ['policy-exceptions', '/security-grc/policy-exceptions'],
  ['admin-taxonomy', '/administration/taxonomy'],
  ['admin-departments', '/administration/departments'],
  ['admin-sla-policies', '/administration/sla-policies'],
  ['admin-integrations', '/administration/integrations'],
  ['applications', '/assets-cmdb/applications'],
  ['relationship-map', '/assets-cmdb/relationship-map'],
];

for (const [slug] of ROUTES) {
  try { fs.unlinkSync(path.join(SHOTS, slug + '.png')); } catch { }
  try { fs.unlinkSync(path.join(TEXTS, slug + '.txt')); } catch { }
}

const report = [];

// Wait for the API to be stable (3 consecutive health OKs) before logging in
const stable = async () => {
  let streak = 0;
  for (let i = 0; i < 200 && streak < 3; i++) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 4000);
      const r = await fetch('http://127.0.0.1:4001/api/health', { signal: c.signal });
      clearTimeout(t);
      streak = r.ok ? streak + 1 : 0;
    } catch { streak = 0; }
    await new Promise(r2 => setTimeout(r2, 2500));
  }
  return streak >= 3;
};
console.log('Waiting for stable API...');
if (!(await stable())) { console.log('API never stabilized'); process.exit(1); }
console.log('API stable, logging in');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });
let loginRes = null;
for (let i = 1; i <= 15 && !loginRes; i++) {
  try {
    const res = await context.request.post(`${BASE}/api/auth/ldap-login`, {
      headers: { 'Origin': BASE, 'Referer': BASE + '/' },
      data: { usernameOrEmail: 'new.username', password: '' },
      timeout: 45000,
    });
    if (res.ok()) { loginRes = res; break; }
    console.log('LOGIN attempt', i, 'status', res.status(), (await res.text().catch(() => '')).slice(0, 120));
  } catch (e) {
    console.log('LOGIN attempt', i, 'failed:', String(e).slice(0, 120));
  }
  await new Promise(r => setTimeout(r, 8000));
}
if (!loginRes) { console.log('LOGIN never succeeded'); process.exit(1); }
console.log('LOGIN:', loginRes.status());
if (!loginRes.ok()) process.exit(1);

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 300)); });

for (const [slug, route] of ROUTES) {
  pageErrors.length = 0;
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait until the session-verifying splash is gone and real content rendered
    await page.waitForFunction(
      () => {
        const t = document.body.innerText || '';
        return t.length > 300 && !t.includes('Sessiyası Yoxlanılır');
      },
      { timeout: 25000 }
    ).catch(() => console.log('SLOW-RESOLVE', slug));
    // Wait for the view's loading state to clear (data actually fetched)
    await page.waitForFunction(
      () => !/Loading secure workspace|Yüklənir|Loading\.\.\./i.test(document.body.innerText || ''),
      { timeout: 30000 }
    ).catch(() => console.log('STILL-LOADING', slug));
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const text = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(TEXTS, slug + '.txt'), text, 'utf8');
    await page.screenshot({ path: path.join(SHOTS, slug + '.png'), fullPage: true });
    const dims = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    report.push({ slug, ok: true, chars: text.length, dims, errors: [...pageErrors] });
    console.log('OK', slug, text.length, 'chars', 'errors:', pageErrors.length);
  } catch (e) {
    report.push({ slug, ok: false, error: String(e).slice(0, 200) });
    console.log('FAIL', slug, String(e).slice(0, 150));
  }
}

fs.writeFileSync(path.join(ROOT, 'crawl-report-recapture.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE-RECAPTURE');
