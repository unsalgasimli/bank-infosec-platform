import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Logging in...');
  await page.goto('http://127.0.0.1:5173');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  const usernameInput = await page.$('.auth-input-wrap input');
  if (usernameInput) {
    await usernameInput.fill('u.gasimli');
    const submitBtn = await page.$('button.auth-submit');
    if (submitBtn) await submitBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  }

  // Ensure Azerbaijani is selected
  const azBtn = await page.$('button:has-text("AZ")');
  if (azBtn) {
    await azBtn.click();
    await page.waitForTimeout(500);
  }

  console.log('Navigating to /administration/departments...');
  await page.goto('http://127.0.0.1:5173/administration/departments');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  const outDir = path.resolve(process.cwd(), 'outputs/playwright_inspection_deep');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const screenPath = path.join(outDir, '32_admin_departments.png');
  await page.screenshot({ path: screenPath });
  console.log(`Saved screenshot to ${screenPath}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
