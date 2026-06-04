const fs = require('fs');
const crypto = require('crypto');
const playwright = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// Manually parse .env.local
const envPath = 'c:/Users/Bruce/Downloads/Tap/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const getMasterKey = () => {
  const key = env.ENCRYPTION_KEY;
  const keySource = key || 'default-development-fallback-key-must-be-32-bytes';
  return crypto.createHash('sha256').update(keySource).digest();
};

function decrypt(encryptedText) {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format. Expected iv:ciphertext');
    }
    const [ivHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getMasterKey(), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

async function run() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const userId = 'e3b73dad-0162-4137-a670-d9f0114d574c';
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  const decryptedEmployeeId = decrypt(profile.employee_id);
  const decryptedPassword = decrypt(profile.company_password);

  console.log(`[Scraper] Logging in with Employee ID: ${decryptedEmployeeId}`);

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const loginUrl = 'https://timelog.cocogen.com.ph/Login';
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
    
    await Promise.all([
      page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    ]);

    const pageText = await page.innerText('body');
    console.log('--- Page text contains "06/04/2026" or "6/4/2026"? ---');
    console.log('06/04/2026:', pageText.includes('06/04/2026'));
    console.log('6/4/2026:', pageText.includes('6/4/2026'));
    console.log('6/4/26:', pageText.includes('6/4/26'));
    
    console.log('--- Matches for login/in? ---');
    console.log('in:', /\b(in|login|log in|time in|clock in)\b/i.test(pageText));

    console.log('\n--- Extracting Recent Logs Table ---');
    const rawTableRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        return cells.map(c => c.textContent?.trim() || '');
      }).filter(r => r.length > 0);
    });

    console.log('Scraped rows:', JSON.stringify(rawTableRows, null, 2));

  } catch (err) {
    console.error('Automation failed:', err);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
