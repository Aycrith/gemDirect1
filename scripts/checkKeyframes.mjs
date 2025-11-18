import { chromium } from 'playwright';
(async () => {
  try {
    const url = process.env.E2E_APP_URL || 'http://localhost:3000';
    console.log('Checking URL:', url);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    // wait a moment for dynamic content
    await page.waitForTimeout(1000);
    const imgs = await page.$$eval('img', els => els.map(e => e.src));
    console.log('Found images count:', imgs.length);
    imgs.forEach((s, i) => {
      const isBase64 = typeof s === 'string' && s.startsWith('data:image/jpeg;base64,');
      console.log(`#${i} base64=${isBase64} length=${s ? s.length : 0}`);
      if (i < 5 && s) console.log('preview:', s.slice(0,120));
    });
    await browser.close();
  } catch (err) {
    console.error('ERROR:', err);
    process.exitCode = 1;
  }
})();
