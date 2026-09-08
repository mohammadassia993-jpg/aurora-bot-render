import { info, warn } from '../logger.js';

export async function uploadProduct({ name, price, description, filePath }) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://payhip.com/login');
    // Login
    await page.fill('input[name="email"]', process.env.PAYHIP_EMAIL || '');
    await page.fill('input[name="password"]', process.env.PAYHIP_PASSWORD || '');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    // Navigate to add product
    await page.goto('https://payhip.com/products/new');
    await page.fill('input[name="name"]', name);
    await page.fill('input[name="price"]', String(price));
    await page.fill('textarea[name="description"]', description);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    const url = page.url();
    await browser.close();
    info('payhip', 'Product uploaded: ' + name + ' -> ' + url);
    return { success: true, url };
  } catch (e) { warn('payhip', 'Upload failed: ' + e.message); return { success: false, error: e.message }; }
}

export default { uploadProduct };
