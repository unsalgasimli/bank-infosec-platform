import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve('outputs/playwright_inspection_deep');

async function inspectDeepTabs() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log('🚀 Starting Deep Playwright Inspection across all tabs & sub-tabs...');
  await page.goto('http://127.0.0.1:5173');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Handle Login if on login page
  const usernameInput = await page.$('.auth-input-wrap input');
  if (usernameInput) {
    console.log('Logging in as u.gasimli (Platform Admin)...');
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

  const mainRoutes = [
    { name: '01_my_work_overview', url: '/my-work/overview' },
    { name: '02_my_work_tasks', url: '/my-work/tasks' },
    { name: '03_my_work_requests', url: '/my-work/requests' },
    { name: '04_my_work_approvals', url: '/my-work/approvals' },
    { name: '05_work_projects_tasks', url: '/work-management/projects-tasks' },
    { name: '06_work_workflows', url: '/work-management/workflows' },
    { name: '07_work_ideate', url: '/work-management/ideate' },
    { name: '08_service_incidents', url: '/service-management/incidents' },
    { name: '09_service_requests', url: '/service-management/requests' },
    { name: '10_service_changes', url: '/service-management/changes' },
    { name: '11_service_problems', url: '/service-management/problems' },
    { name: '12_service_catalog', url: '/service-management/catalog' },
    { name: '13_sec_vulnerabilities', url: '/security-grc/vulnerabilities' },
    { name: '14_sec_incidents', url: '/security-grc/security-incidents' },
    { name: '15_sec_policy_exceptions', url: '/security-grc/policy-exceptions' },
    { name: '16_sec_risk_management', url: '/security-grc/risk-management' },
    { name: '17_sec_threat_modeling', url: '/security-grc/threat-modeling' },
    { name: '18_sec_audit_compliance', url: '/security-grc/audit-compliance' },
    { name: '19_sec_dlp', url: '/security-grc/dlp' },
    { name: '20_assets_inventory', url: '/assets-cmdb/inventory' },
    { name: '21_assets_ci', url: '/assets-cmdb/configuration-items' },
    { name: '22_assets_services', url: '/assets-cmdb/business-services' },
    { name: '23_assets_applications', url: '/assets-cmdb/applications' },
    { name: '24_assets_rel_map', url: '/assets-cmdb/relationship-map' },
    { name: '25_knowledge_base', url: '/knowledge' },
    { name: '26_analytics_op', url: '/analytics/operational' },
    { name: '27_analytics_exec', url: '/analytics/executive' },
    { name: '28_admin_forms', url: '/administration/request-forms' },
    { name: '29_admin_workflow_templates', url: '/administration/workflow-templates' },
    { name: '30_admin_automations', url: '/administration/automations' },
    { name: '31_admin_sla', url: '/administration/sla-policies' },
    { name: '32_admin_departments', url: '/administration/departments' },
    { name: '33_admin_taxonomy', url: '/administration/taxonomy' },
    { name: '34_admin_integrations', url: '/administration/integrations' },
    { name: '35_admin_settings', url: '/administration/settings' },
  ];

  for (const route of mainRoutes) {
    console.log(`Inspecting ${route.name} (${route.url})...`);
    await page.goto(`http://127.0.0.1:5173${route.url}`);
    await page.waitForLoadState('domcontentloaded');
    try {
      await page.waitForSelector('h1, .wrike-card, .bg-semantic-panel', { timeout: 3000 });
    } catch (e) {}
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUTPUT_DIR, `${route.name}.png`) });

    // Sub-tab interactions
    const tabs = await page.$$('button[role="tab"], nav button, .tab-item, header nav button');
    for (let i = 0; i < Math.min(tabs.length, 5); i++) {
      try {
        const tabText = (await tabs[i].innerText()).trim().replace(/\s+/g, '_');
        if (tabText && tabText.length > 2 && tabText.length < 30) {
          await tabs[i].click();
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${route.name}_sub_${i}_${tabText}.png`) });
        }
      } catch (e) {
        // ignore sub-tab click failures
      }
    }
  }

  await browser.close();
  console.log('✅ Deep inspection complete! Check outputs/playwright_inspection_deep/');
}

inspectDeepTabs().catch(console.error);
