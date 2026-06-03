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

  console.log(`Using decrypted Employee ID: ${decryptedEmployeeId}`);

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

  console.log('Extracting tables and rows from portal home page...');
  const rawTableRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      const cellsText = cells.map(c => c.textContent?.trim() || '');
      const link = row.querySelector('a[href*="docno="]');
      const href = link ? link.getAttribute('href') : null;
      return { cells: cellsText, href };
    }).filter(r => r.cells.length > 0);
  });

  const parsedLogs = [];
  console.log(`Total raw table rows extracted: ${rawTableRows.length}`);

  for (const item of rawTableRows) {
    const row = item.cells;
    if (row.length < 3) continue;

    const dateCellIndex = row.findIndex((cell) => /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(cell));
    if (dateCellIndex === -1) continue;

    const dateVal = row[dateCellIndex];

    let modeVal = 'Unknown';
    const inOutCell = row.find((cell) => {
      const c = cell.trim().toUpperCase();
      return c === 'I' || c === 'O' || /\b(in|out|login|logout|time-in|time-out|correction)\b/i.test(c);
    });
    if (inOutCell) {
      const trimmed = inOutCell.trim().toUpperCase();
      if (trimmed === 'I') {
        modeVal = 'Time In';
      } else if (trimmed === 'O') {
        modeVal = 'Time Out';
      } else {
        modeVal = inOutCell;
      }
    }

    let timeVal = 'N/A';
    const timeCell = row.find((cell) => /\b\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?\b/i.test(cell));
    if (timeCell) {
      timeVal = timeCell;
    }

    let statusVal = 'Submitted';
    const statusCell = row.find((cell) => /\b(approved|pending|cancel|rejected|submitted|active)\b/i.test(cell));
    if (statusCell) {
      statusVal = statusCell;
    }

    let cleanDate = dateVal.trim();
    let cleanTime = timeVal.trim();

    if (cleanDate.includes(' ')) {
      cleanDate = cleanDate.split(/\s+/)[0];
    }

    if (cleanTime.includes('/')) {
      const parts = cleanTime.split(/\s+/);
      if (parts.length > 1) {
        cleanTime = parts.slice(1).join(' ');
      }
    }

    let docNo = null;
    if (row[0] && /^\d{5,15}$/.test(row[0])) {
      docNo = row[0];
    }

    parsedLogs.push({
      date: cleanDate,
      time: cleanTime,
      mode: modeVal,
      status: statusVal,
      docNo: docNo,
      raw: row
    });
  }

  console.log('Result Logs:', JSON.stringify(parsedLogs, null, 2));

  await browser.close();
}

run().catch(console.error);
