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
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const userId = '581f44dd-ee1b-4c93-8ead-0d292a994ed5'; // Bruce
  const { data: profile, error } = await adminClient
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    console.error('Failed to get user profile', error);
    process.exit(1);
  }

  const decryptedEmployeeId = decrypt(profile.employee_id);
  const decryptedPassword = decrypt(profile.company_password);

  console.log(`Logging in with Employee ID: ${decryptedEmployeeId}`);

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const loginUrl = 'https://timelog.cocogen.com.ph/Login';
  console.log(`Navigating to ${loginUrl}...`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
  await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
  
  await Promise.all([
    page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  ]);

  const currentUrl = page.url();
  console.log(`Current URL after login: ${currentUrl}`);
  if (!currentUrl.includes('/members/Home') && !currentUrl.includes('Home')) {
    await page.goto('https://timelog.cocogen.com.ph/members/Home', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }

  // Scrape tables
  const tablesInfo = await page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.map((table, tIdx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      const rowsData = rows.map((row, rIdx) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        const cellsText = cells.map(c => c.textContent?.trim() || '');
        const links = Array.from(row.querySelectorAll('a')).map(a => ({
          text: a.textContent?.trim(),
          href: a.getAttribute('href')
        }));
        return { rIdx, cellsText, links };
      });
      return { tIdx, id: table.id, className: table.className, rowsCount: rows.length, rowsData };
    });
  });

  console.log(`Found ${tablesInfo.length} tables on page.`);
  fs.writeFileSync('scratch/scraped_tables_dump.json', JSON.stringify(tablesInfo, null, 2));
  console.log('Saved tables info to scratch/scraped_tables_dump.json');

  await browser.close();
}

run().catch(console.error);
