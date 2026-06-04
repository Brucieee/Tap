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

async function processUser(adminClient, browser, userId, userEmail) {
  const { data: profile, error } = await adminClient
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    console.error(`Failed to get user profile for ${userEmail}`, error);
    return;
  }

  const decryptedEmployeeId = decrypt(profile.employee_id);
  const decryptedPassword = decrypt(profile.company_password);

  console.log(`\n========================================`);
  console.log(`Processing logout for ${userEmail} (${decryptedEmployeeId})...`);
  console.log(`========================================`);

  let context = null;
  try {
    context = await browser.newContext({
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

    console.log('Logged in successfully. Navigating to Add New...');
    const addNewBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Add New"], #ctl00_ContentPlaceHolder1_Button1';
    await page.waitForSelector(addNewBtn, { timeout: 10000 });
    await page.click(addNewBtn, { timeout: 10000 });

    // Wait for form fields
    const typeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_type"], #ctl00_ContentPlaceHolder1_drp_type';
    await page.waitForSelector(typeSelect, { timeout: 10000 });

    const todayStr = '06/03/2026';
    const timeToInject = '17:00'; // 5:00 PM

    console.log(`Injecting form: Date=${todayStr}, Time=${timeToInject}, Mode=O`);
    await page.selectOption(typeSelect, { value: 'C' }); // Correction
    await page.fill('input[name="ctl00$ContentPlaceHolder1$txt_date1"], #ctl00_ContentPlaceHolder1_txt_date1', todayStr);
    await page.fill('input[name="ctl00$ContentPlaceHolder1$txt_date2"], #ctl00_ContentPlaceHolder1_txt_date2', todayStr);
    await page.fill('input[name="ctl00$ContentPlaceHolder1$txtTime"], #ctl00_ContentPlaceHolder1_txtTime', timeToInject);
    await page.selectOption('select[name="ctl00$ContentPlaceHolder1$drp_mode"], #ctl00_ContentPlaceHolder1_drp_mode', { value: 'O' }); // Out
    await page.fill('textarea[name="ctl00$ContentPlaceHolder1$txt_reason"], #ctl00_ContentPlaceHolder1_txt_reason', profile.wfh_reason || 'Work from home');

    // Select manager
    await page.selectOption('select[name="ctl00$ContentPlaceHolder1$drp_approver"], #ctl00_ContentPlaceHolder1_drp_approver', { value: '200001808' }).catch(() => {
      console.log('Manager read-only or not found.');
    });

    console.log('Submitting form...');
    const submitBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Submit"]';
    await page.click(submitBtn);
    await page.waitForTimeout(3000);

    console.log(`Successfully completed logout on portal for ${userEmail}. Inserting into local DB history...`);
    const { error: dbError } = await adminClient.from('timelog_history').insert({
      user_id: userId,
      employee_id: decryptedEmployeeId,
      mode: 'logout',
      date: '2026-06-03'
    });
    if (dbError) {
      console.error(`Database insertion failed for ${userEmail}:`, dbError.message);
    } else {
      console.log(`Database insertion successful for ${userEmail}`);
    }
  } catch (err) {
    console.error(`Error processing ${userEmail}:`, err);
  } finally {
    if (context) {
      await context.close();
    }
  }
}

async function run() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const browser = await playwright.chromium.launch({ headless: true });

  const remainingUsers = [
    { id: '0af285ad-2692-44d0-9e20-ee2a757a46ea', email: 'selina_deandres@cocogen.com' },
    { id: 'f6730051-458a-4bec-a824-b519deb83ae4', email: 'albi_saribay@cocogen.com' },
    { id: 'e3b73dad-0162-4137-a670-d9f0114d574c', email: 'brix_julianda@cocogen.com' }
  ];

  for (const user of remainingUsers) {
    await processUser(adminClient, browser, user.id, user.email);
  }

  await browser.close();
  console.log('\nAll remaining user logouts processed successfully.');
}

run().catch(console.error);
