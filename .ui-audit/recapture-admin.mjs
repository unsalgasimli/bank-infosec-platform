import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5173';
const ROOT = path.resolve(process.cwd(), '.ui-audit');
const SHOTS = path.join(ROOT, 'shots');
const TEXTS = path.join(ROOT, 'text');

const ROUTES = [
  ['admin-request-forms', '/administration/request-forms'],
  ['admin-workflow-templates', '/administration/workflow-templates'],
  ['admin-automations', '/administration/automations'],
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

const login = async (context) => {
  for (let i = 1; i <= 8; i++) {
    try {
      const res = await context.request.post(`${BASE}/api/auth/ldap-login`, {
        headers: { 'Origin': BASE, 'Referer': BASE + '/' },
        data: { usernameOrEmail: 'new.username', password: '' },
        timeout: 45000,
      });
      if (res.ok()) { console.log('LOGIN OK'); return true; }
      console.log('login attempt', i, 'status', res.status());
    } catch { console.log('login attempt', i, 'network fail'); await stableApi(); }
    await new Promise(r => setTimeout(r, 4000));
  }
  return false;
};

console.log('Waiting for stable API...');
if (!(await stableApi())) { console.log('API never stabilized'); process.exit(1); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1 });
if (!(await login(context))) { console.log('LOGIN never succeeded'); process.exit(1); }

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 300)); });

const LOADING_RE = /Loading secure workspace|Sessiyası Yoxlanılır|Yüklənir\.\.\./i;
const LOGIN_RE = /Girişə keç|Smart Card PIN/i;

const report = [];
for (const [slug, route] of ROUTES) {
  pageErrors.length = 0;
  let captured = false;
  for (let attempt = 1; attempt <= 4 && !captured; attempt++) {
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
      let text = await page.evaluate(() => document.body.innerText);
      if (LOGIN_RE.test(text)) {
        console.log('SESSION-LOST', slug, '— re-login');
        if (!(await login(context))) break;
        attempt--;
        continue;
      }
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

fs.writeFileSync(path.join(ROOT, 'crawl-report-admin.json'), JSON.stringify(report, null, 1));
await browser.close();
console.log('DONE-ADMIN');
