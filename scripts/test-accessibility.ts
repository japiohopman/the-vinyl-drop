import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function runAccessibilityCheck() {
  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

  console.log(`[a11y-test] Running WCAG accessibility audit against ${baseUrl}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const urls = [`${baseUrl}/`, `${baseUrl}/design-system`];
    let totalViolations = 0;

    for (const url of urls) {
      console.log(`[a11y-test] Auditing ${url}...`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      if (accessibilityScanResults.violations.length > 0) {
        console.error(`[a11y-test] Violations found on ${url}:`);
        console.error(JSON.stringify(accessibilityScanResults.violations, null, 2));
        totalViolations += accessibilityScanResults.violations.length;
      } else {
        console.log(`[a11y-test] PASSED: 0 WCAG violations on ${url}`);
      }
    }

    if (totalViolations > 0) {
      process.exit(1);
    } else {
      console.log('[a11y-test] All audited pages passed WCAG 2.1 AA accessibility checks cleanly!');
    }
  } finally {
    await browser.close();
  }
}

runAccessibilityCheck().catch((err) => {
  console.error('[a11y-test] Unexpected error running accessibility test:', err);
  process.exit(1);
});
