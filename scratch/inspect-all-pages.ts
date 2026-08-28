import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DESTINATION_TO_PATH } from '../src/client/utils/urlRouter.js';

const APP_URL = 'http://127.0.0.1:5173';
const OUTPUT_DIR = path.resolve(process.cwd(), 'outputs', 'playwright_inspection');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const DESTINATIONS = Object.keys(DESTINATION_TO_PATH);

async function inspectApp() {
  console.log('🚀 Starting Playwright Inspection of All Path-based Pages...');
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleLogs: Array<{ type: string; text: string; location?: string }> = [];
  const pageErrors: Array<{ page: string; error: string }> = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location() ? `${msg.location().url}:${msg.location().lineNumber}` : undefined,
      });
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push({
      page: page.url(),
      error: err.message,
    });
  });

  // Step 1: Open Login Page
  console.log('Navigating to root page...');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Perform login
  console.log('Performing login as u.gasimli (Platform Admin / CISO)...');
  const usernameInput = page.locator('input[autocomplete="username"], .auth-input-wrap input, input').first();
  if (await usernameInput.isVisible()) {
    await usernameInput.fill('u.gasimli');
  }

  const submitButton = page.locator('button.auth-submit, button[type="submit"]').first();
  if (await submitButton.isVisible()) {
    await submitButton.click();
  }

  // Wait for sidebar to be visible indicating successful login
  try {
    await page.waitForSelector('aside.app-sidebar, header', { timeout: 10000 });
    await page.waitForTimeout(1500);
    console.log('Login succeeded, authenticated workspace loaded!');
  } catch (e) {
    console.error('Login wait timed out, continuing...', e);
  }

  const pageResults: any[] = [];

  // Step 2: Traverse each destination using proper path
  for (const dest of DESTINATIONS) {
    const routePath = DESTINATION_TO_PATH[dest] || `/${dest}`;
    console.log(`Checking destination: ${dest} -> ${routePath}...`);
    try {
      const destUrl = `${APP_URL}${routePath}`;
      await page.goto(destUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForTimeout(1200);

      const accessDenied = await page.locator('text="Access Denied"').isVisible();
      const notFound = await page.locator('text="404"').isVisible();

      const filename = `page_${dest}.png`;
      await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: false });

      // Check view mode switchers if present
      if (dest === 'projects-tasks' || dest === 'my-tasks') {
        const kanbanTab = page.locator('button:has-text("Kanban"), button:has-text("Board")').first();
        if (await kanbanTab.isVisible()) {
          await kanbanTab.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(OUTPUT_DIR, `page_${dest}_kanban.png`) });
        }

        const capacityTab = page.locator('button:has-text("Capacity"), button:has-text("Workload")').first();
        if (await capacityTab.isVisible()) {
          await capacityTab.click();
          await page.waitForTimeout(800);
          await page.screenshot({ path: path.join(OUTPUT_DIR, `page_${dest}_capacity.png`) });
        }
      }

      pageResults.push({
        destination: dest,
        path: routePath,
        status: accessDenied ? 'ACCESS_DENIED' : notFound ? 'NOT_FOUND' : 'OK',
        screenshot: filename,
      });
    } catch (err: any) {
      console.error(`Error on ${dest}:`, err.message);
      pageResults.push({
        destination: dest,
        path: routePath,
        status: 'ERROR',
        error: err.message,
      });
    }
  }

  // Write inspection report
  const report = {
    timestamp: new Date().toISOString(),
    results: pageResults,
    consoleLogs,
    pageErrors,
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, 'inspection_summary.json'), JSON.stringify(report, null, 2));
  console.log('✅ Playwright Path Inspection completed! Results written to outputs/playwright_inspection/');

  await browser.close();
}

inspectApp().catch(console.error);
