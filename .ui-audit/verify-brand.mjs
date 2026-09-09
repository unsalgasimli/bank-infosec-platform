import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const ROUTES = [
  ['ideate', '/work-management/ideate'],
  ['request-forms', '/administration/request-forms'],
  ['automations', '/administration/automations'],
  ['operational-analytics', '/analytics/operational'],
  ['executive-analytics', '/analytics/executive'],
  ['workload', '/work-management/projects-tasks?view=capacity'],
  ['my-tasks', '/my-work/tasks'],
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
const login = async (context) => {
  for (let i = 1; i <= 8; i++) {
    try {
      const res = await context.request.post(`${BASE}/api/auth/ldap-login`, {
        headers: { Origin: BASE, Referer: BASE + '/' },
        data: { usernameOrEmail: 'new.username', password: '' },
        timeout: 45000,
      });
      if (res.ok()) return true;
    } catch { await stableApi(); }
    await new Promise(r => setTimeout(r, 4000));
  }
  return false;
};

if (!(await stableApi())) { console.log('API never stabilized'); process.exit(1); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
if (!(await login(context))) { console.log('LOGIN failed'); process.exit(1); }
console.log('LOGIN OK');

const page = await context.newPage();
const BRAND = /\b(wrike|jira|atlassian)\b/i;
for (const [slug, route] of ROUTES) {
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForFunction(
        () => {
          const t = document.body.innerText || '';
          return t.length > 400 && !/Loading secure workspace|Sessiyası Yoxlanılır/i.test(t) && !/Girişə keç|Smart Card PIN/i.test(t);
        },
        { timeout: 30000 }
      );
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const text = await page.evaluate(() => document.body.innerText);
      if (/Girişə keç|Smart Card PIN/i.test(text)) { await login(context); attempt--; continue; }
      const brandHits = text.split(/\r?\n/).filter(l => BRAND.test(l));
      const fiuuuHits = text.split(/\r?\n/).filter(l => /FIUUU/i.test(l));
      console.log(`=== ${slug}`);
      console.log('  brand text remaining:', brandHits.length ? JSON.stringify(brandHits.slice(0, 5)) : 'NONE');
      console.log('  FIUUU visible:', fiuuuHits.length ? JSON.stringify(fiuuuHits.slice(0, 4)) : '(none on this page)');
      done = true;
    } catch (e) {
      console.log('RETRY', slug, attempt, String(e).slice(0, 100));
      await stableApi();
    }
  }
  if (!done) console.log('FAIL', slug);
}
await browser.close();
console.log('VERIFY DONE');
