import { chromium } from 'playwright';
import fs from 'node:fs';

const CHROME_PATH = '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
  });
  const page = await ctx.newPage();
  
  console.log('=== Coalition Technologies Application ===');
  await page.goto('https://app.testedrecruits.com/posting/16720', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Fill form using visible labels
  try {
    // First Name
    await page.fill('#first_name', 'Silent');
    console.log('✅ First name filled');
    
    // Last Name
    await page.fill('#last_name', 'Giants');
    console.log('✅ Last name filled');
    
    // Email
    await page.fill('#email', 'auroraalmada4@gmail.com');
    console.log('✅ Email filled');
    
    // Phone
    await page.fill('#phone', '+1234567890');
    console.log('✅ Phone filled');
    
    // Three words
    await page.fill('input[name="three_words"]', 'Web3 Content Excellence');
    console.log('✅ Three words filled');
    
    // Country dropdown
    const countrySelect = await page.$('#country_id');
    if (countrySelect) {
      await countrySelect.selectOption({ label: 'United States' });
      console.log('✅ Country selected');
    }
    
    // Preferred contact method
    const contactSelect = await page.$('#preferred_contact_method');
    if (contactSelect) {
      await contactSelect.selectOption({ label: 'Email' });
      console.log('✅ Contact method selected');
    }
    
    // Sourcing location
    const sourceSelect = await page.$('#sourcing_location');
    if (sourceSelect) {
      await sourceSelect.selectOption({ label: 'Other' });
      console.log('✅ Source selected');
    }
    
    await page.waitForTimeout(1000);
    
    // Find and click submit
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');
    if (submitBtn) {
      const btnText = await submitBtn.evaluate(b => b.innerText?.trim() || b.value || '');
      console.log(`Clicking: "${btnText}"`);
      await submitBtn.click();
      await page.waitForTimeout(8000);
      
      const afterBody = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
      console.log('After submit:', afterBody.slice(0, 300));
      
      const success = afterBody.includes('thank') || afterBody.includes('success') || afterBody.includes('submitted');
      console.log(success ? '✅ SUBMITTED SUCCESSFULLY!' : '⚠️ Result unclear');
    }
    
  } catch (e) {
    console.log('Error:', e.message.slice(0, 200));
  }
  
  await browser.close();
}

main();
