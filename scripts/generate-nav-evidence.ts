import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

export async function generateNavEvidence() {
  const screenshotsDir = path.join(process.cwd(), 'public/assets/verification/screenshots');
  const videosDir = path.join(process.cwd(), 'public/assets/verification/videos');

  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(videosDir, { recursive: true });

  const viewports = [
    { name: '360px', width: 360, height: 640 },
    { name: '390px', width: 390, height: 844 },
    { name: '430px', width: 430, height: 932 },
    { name: '768px', width: 768, height: 1024 },
    { name: '1280px', width: 1280, height: 800 },
  ];

  const browser = await chromium.launch({ headless: true });

  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      recordVideo: { dir: videosDir },
    });
    const page = await context.newPage();
    await page.goto('http://localhost:3000/browse');
    await page.waitForTimeout(500);

    const scrollWidth = await page.evaluate(() => (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } }).document.documentElement.scrollWidth);
    const innerWidth = await page.evaluate(() => (globalThis as unknown as { window: { innerWidth: number } }).window.innerWidth);

    if (scrollWidth > innerWidth) {
      throw new Error(`Horizontal overflow detected at ${vp.name}: ${scrollWidth} > ${innerWidth}`);
    }

    await page.screenshot({ path: path.join(screenshotsDir, `nav_${vp.name}.png`) });

    if (vp.width < 768) {
      await page.click('#mobile-you-trigger');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, `nav_${vp.name}_you_surface.png`) });
    }

    await context.close();
  }

  await browser.close();
  console.log('Navigation evidence generated successfully across all required viewports.');
}

if (require.main === module) {
  generateNavEvidence().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
