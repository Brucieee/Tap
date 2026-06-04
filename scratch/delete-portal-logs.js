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

async function deleteUserLog(supabase, browser, userId, email, docNo) {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (!profile) {
    console.log(`Profile not found for ${email}`);
    return;
  }

  const decryptedEmployeeId = decrypt(profile.employee_id);
  const decryptedPassword = decrypt(profile.company_password);

  console.log(`\nDeleting docNo: ${docNo} on portal for ${email} (Employee ID: ${decryptedEmployeeId})...`);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // 1. Login
    const loginUrl = 'https://timelog.cocogen.com.ph/Login';
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
    
    await Promise.all([
      page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    ]);

    // 2. Navigate to view page for deletion
    const viewUrl = `https://timelog.cocogen.com.ph/members/view?docno=${docNo}`;
    console.log(`Navigating to view page: ${viewUrl}`);
    await page.goto(viewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Handle the browser deletion confirm dialog
    page.once('dialog', async (dialog) => {
      console.log(`Accepting deletion dialog: ${dialog.message()}`);
      await dialog.accept().catch(() => {});
    });

    const deleteBtn = '#ctl00_ContentPlaceHolder1_Button1, input[name="ctl00$ContentPlaceHolder1$Button1"][value="Delete"]';
    await page.waitForSelector(deleteBtn, { timeout: 10000 });
    
    console.log(`Clicking delete button...`);
    await Promise.all([
      page.click(deleteBtn),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    ]);

    console.log(`Successfully deleted docNo: ${docNo} for ${email} from portal.`);

  } catch (err) {
    console.error(`Failed to delete docNo: ${docNo} for ${email}:`, err.message);
  } finally {
    await context.close();
  }
}

async function run() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const browser = await playwright.chromium.launch({ headless: true });

  await deleteUserLog(supabase, browser, '9f91acc5-9ede-4e37-89f8-5b563ee75464', 'john_lopez@cocogen.com', '0002681553');
  await deleteUserLog(supabase, browser, 'f6730051-458a-4bec-a824-b519deb83ae4', 'albi_saribay@cocogen.com', '0002681561');

  await browser.close();
}

run().catch(console.error);
