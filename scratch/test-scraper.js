const fs = require('fs');
const crypto = require('crypto');
const playwright = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
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

  // Bruce's ID
  const userId = '581f44dd-ee1b-4c93-8ead-0d292a994ed5';
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  const decryptedEmployeeId = decrypt(profile.employee_id);
  const decryptedPassword = decrypt(profile.company_password);

  console.log(`[Diagnostic] Logging in with Employee ID: ${decryptedEmployeeId}`);

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    const loginUrl = 'https://timelog.cocogen.com.ph/Login';
    console.log(`Navigating to: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
    
    console.log('Submitting login...');
    await page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton', { timeout: 10000 });
    
    console.log('Waiting for URL to redirect...');
    await page.waitForURL((url) => url.includes('/members/Home') || url.includes('Home'), { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    }).catch(async (e) => {
      console.log('waitForURL timed out or failed:', e.message);
      console.log('Current page URL is:', page.url());
    });

    console.log('Current URL after login redirection:', page.url());
    
    // Save screenshot to scratch/after_login.png
    const screenshotPath = path.join(__dirname, 'after_login.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to: ${screenshotPath}`);

    // Print page title and body content snippet
    const title = await page.title();
    console.log(`Page Title: ${title}`);

    // Extract all rows
    const rawTableRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tr'));
      return rows.map((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const cellsText = cells.map(c => c.textContent?.trim() || '');
        const link = row.querySelector('a[href*="docno="]');
        const href = link ? link.getAttribute('href') : null;
        return { index: rIdx, cells: cellsText, href };
      }).filter(r => r.cells.length > 0);
    });

    console.log(`Total table rows found on page: ${rawTableRows.length}`);
    console.log('First 10 rows extracted:');
    console.log(JSON.stringify(rawTableRows.slice(0, 10), null, 2));

  } catch (err) {
    console.error('Automation error:', err);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
