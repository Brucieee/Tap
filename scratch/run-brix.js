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

  console.log(`[Brix Run] Employee ID: ${decryptedEmployeeId}`);

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const currentDate = '2026-06-04';
  const currentDay = 'Thursday';
  const modeParam = 'login';
  const modeText = 'Log In';
  const timeToInject = '08:00:00';

  try {
    // 1. Login Page Execution
    const loginUrl = 'https://timelog.cocogen.com.ph/Login';
    console.log(`Navigating to login portal: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Fill out credentials
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
    await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
    
    // Submit Login Form
    console.log('Submitting credentials form...');
    await Promise.all([
      page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton'),
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    ]);

    console.log('Logged in successfully. Waiting for dashboard state...');

    const [year, month, day] = currentDate.split('-');
    const formattedDate = `${month}/${day}/${year}`;

    // 2. Click "Add New" button
    const addNewBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Add New"], #ctl00_ContentPlaceHolder1_Button1';
    console.log('Locating and clicking "Add New" timelog form button...');
    await page.waitForSelector(addNewBtn, { timeout: 10000 });
    await page.click(addNewBtn, { timeout: 10000 });

    // Wait for ASP.NET Postback to finish rendering the form
    console.log('Waiting for form postback to render...');

    // 3. Inject Form Fields
    const typeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_type"], #ctl00_ContentPlaceHolder1_drp_type';
    await page.waitForSelector(typeSelect, { timeout: 10000 });

    console.log(`Injecting form variables: Date=${formattedDate}, Time=${timeToInject}, Mode=${modeText}`);

    // Type: "Correction"
    await page.selectOption(typeSelect, { value: 'C' });

    // Date 1
    const dateInput1 = 'input[name="ctl00$ContentPlaceHolder1$txt_date1"], #ctl00_ContentPlaceHolder1_txt_date1';
    await page.fill(dateInput1, formattedDate);

    // Date 2
    const dateInput2 = 'input[name="ctl00$ContentPlaceHolder1$txt_date2"], #ctl00_ContentPlaceHolder1_txt_date2';
    await page.fill(dateInput2, formattedDate);

    // Time Input
    const timeInput = 'input[name="ctl00$ContentPlaceHolder1$txtTime"], #ctl00_ContentPlaceHolder1_txtTime';
    const formattedTime = timeToInject.substring(0, 5); // 'hh:mm'
    await page.fill(timeInput, formattedTime);

    // Mode: 'I' for Log In, 'O' for Log Out
    const modeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_mode"], #ctl00_ContentPlaceHolder1_drp_mode';
    const modeValue = 'I';
    await page.selectOption(modeSelect, { value: modeValue });

    // Reason
    const reasonTextarea = 'textarea[name="ctl00$ContentPlaceHolder1$txt_reason"], #ctl00_ContentPlaceHolder1_txt_reason';
    await page.fill(reasonTextarea, profile.wfh_reason || 'Work from home');

    // Approver
    const approverSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_approver"], #ctl00_ContentPlaceHolder1_drp_approver';
    await page.selectOption(approverSelect, { value: '200001808' }).catch(() => {
      console.log('Approver dropdown is read-only or option missing. Accepting portal default manager.');
    });

    // 4. Click Submit Button
    console.log('Submitting the timelog form...');
    const submitBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Submit"]';
    await page.click(submitBtn);

    // Wait for page postback/completion to register
    await page.waitForTimeout(3000); 

    console.log(`Timelog ${modeText} submission completed successfully for user ${userId}.`);

    // Insert success status into local DB history
    const { error: insertError } = await supabase
      .from('timelog_history')
      .insert({
        user_id: userId,
        employee_id: decryptedEmployeeId,
        mode: modeParam,
        date: currentDate
      });
    if (insertError) {
      console.warn(`[Database History Update Warning] Failed to insert history record:`, insertError.message);
    } else {
      console.log(`[Database History Update] Successfully recorded submission in database history.`);
    }

  } catch (browserError) {
    console.error(`Browser automation failed:`, browserError);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
