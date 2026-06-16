import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Extend serverless execution limit to 300 seconds

// Helper to launch browser (shares the same configuration as portal-logs and run-timelog)
async function getBrowserInstance() {
  const remoteUrl = process.env.NODE_ENV === 'development' ? null : process.env.PLAYWRIGHT_SERVICE_URL;
  let playwright;
  try {
    playwright = await import('playwright-core');
  } catch (err) {
    playwright = await import('playwright');
  }

  const { chromium } = playwright;
  let browser = null;

  if (remoteUrl) {
    let formattedUrl = remoteUrl;
    if (remoteUrl.includes('browserless.io') && !remoteUrl.includes('/playwright') && !remoteUrl.includes('/chromium')) {
      try {
        const urlObj = new URL(remoteUrl);
        urlObj.pathname = '/chromium/playwright';
        formattedUrl = urlObj.toString();
      } catch (urlErr) {
        console.error('Failed to parse remoteUrl, keeping raw:', remoteUrl, urlErr);
      }
    }

    console.log('Connecting to remote Playwright service for MyPortal...');
    const maxConnRetries = 3;
    let connAttempt = 0;
    let connSuccess = false;

    while (connAttempt < maxConnRetries && !connSuccess) {
      connAttempt++;
      try {
        if (connAttempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        if (formattedUrl.includes('/playwright')) {
          browser = await chromium.connect({ wsEndpoint: formattedUrl, timeout: 20000 });
        } else {
          browser = await chromium.connectOverCDP(formattedUrl, { timeout: 20000 });
        }
        connSuccess = true;
      } catch (connErr: any) {
        console.error(`Browser connection attempt ${connAttempt} failed:`, connErr.message);
        if (connAttempt >= maxConnRetries) {
          console.warn('Fallback: remote Playwright service is unreachable (limit reached or down). Launching local Chromium browser...');
          try {
            browser = await chromium.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            });
            connSuccess = true;
          } catch (localLaunchErr: any) {
            console.error('Local chromium launch fallback failed:', localLaunchErr.message);
            throw new Error(`The remote browser service (Browserless/Playwright) is currently unavailable or has reached its usage limit, and local browser execution is not supported on Vercel. Details: ${connErr.message}`);
          }
        }
      }
    }
  } else {
    console.log('Launching local Chromium browser for MyPortal...');
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (localLaunchErr: any) {
      console.error('Local chromium launch failed:', localLaunchErr.message);
      throw new Error(`Local browser execution is not supported in the current serverless environment. Please configure PLAYWRIGHT_SERVICE_URL with a valid remote browser service endpoint. Details: ${localLaunchErr.message}`);
    }
  }

  return browser;
}

// Helper: Login to MyPortal and return page/context
async function loginToMyPortal(page: any, employeeId: string, passwordString: string) {
  const loginUrl = 'https://myportal.cocogen.com.ph/';
  console.log(`Navigating to login portal: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Locate login fields
  const userField = page.locator('input[name="LoginMain$UserName"], #LoginMain_UserName').first();
  const passField = page.locator('input[name="LoginMain$Password"], #LoginMain_Password').first();
  const loginBtn = page.locator('input[name="LoginMain$LoginButton"], #LoginMain_LoginButton').first();

  await userField.waitFor({ state: 'visible', timeout: 15000 });
  await userField.fill(employeeId);
  await passField.fill(passwordString);
  await loginBtn.click();

  console.log('Waiting for MyPortal login redirection...');
  await page.waitForURL((url: any) => url.href.includes('/members/') || url.href.includes('aspx'), {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  }).catch(async (e: any) => {
    console.warn('MyPortal waitForURL timed out or failed. Checking current URL:', page.url());
    const currentUrl = page.url();
    if (currentUrl.includes('LoginMain') || currentUrl === loginUrl) {
      throw new Error('Authentication failed on MyPortal. Please check your credentials.');
    }
  });

  console.log('Successfully authenticated with MyPortal.');
}

// GET: Fetch leave summaries from MyPortal
export async function GET(request: NextRequest) {
  let browser: any = null;
  let context: any = null;

  try {
    // 1. Authenticate Tap User Session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // 2. Fetch User Profile credentials
    const { data: profile, error: dbError } = await supabase
      .from('user_profiles')
      .select('myportal_employee_id, myportal_password')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const encryptedEmployeeId = profile.myportal_employee_id;
    const encryptedPassword = profile.myportal_password;

    if (!encryptedEmployeeId || !encryptedPassword) {
      return NextResponse.json({ error: 'MyPortal credentials are not configured.' }, { status: 400 });
    }

    const decryptedEmployeeId = decrypt(encryptedEmployeeId);
    const decryptedPassword = decrypt(encryptedPassword);

    if (!decryptedEmployeeId || !decryptedPassword) {
      return NextResponse.json({ error: 'Failed to decrypt MyPortal credentials.' }, { status: 500 });
    }

    // 3. Launch browser and Login
    browser = await getBrowserInstance();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await loginToMyPortal(page, decryptedEmployeeId, decryptedPassword);

    // 4. Navigate to Leaves Request Summary page
    const summaryUrl = 'https://myportal.cocogen.com.ph/members/myp_reqs.aspx?ID=LV&SNODE=201&T=Leaves';
    console.log(`Navigating to leaves summary page: ${summaryUrl}`);
    await page.goto(summaryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 5. Update Date Filters to get all leaves for current/adjacent years
    const currentYear = new Date().getFullYear();
    const startDateVal = `01/01/${currentYear - 1}`;
    const endDateVal = `12/31/${currentYear + 1}`;

    const startFilter = page.locator('input[name*="dtr_Start$textBox"], #ctl00_MainPlaceHolder_summ1_dtr_Start_textBox').first();
    const endFilter = page.locator('input[name*="dtr_End$textBox"], #ctl00_MainPlaceHolder_summ1_dtr_End_textBox').first();
    const refreshBtn = page.locator('input[name*="Refresh_btn"], #ctl00_MainPlaceHolder_summ1_Refresh_btn').first();

    if (await startFilter.count() > 0) {
      await startFilter.fill(startDateVal);
      await endFilter.fill(endDateVal);
      await refreshBtn.click();
      await page.waitForTimeout(3000); // Wait for ASP.NET postback
    }

    // 6. Scrape the table rows
    const tableSelector = '#ctl00_MainPlaceHolder_summ1_gvRequest, table[id*="gvRequest"]';
    const rowsLocator = page.locator(`${tableSelector} tr`);
    const rowCount = await rowsLocator.count();

    const leavesList: any[] = [];

    console.log(`Found grid rows: ${rowCount}`);

    for (let i = 1; i < rowCount; i++) {
      const row = rowsLocator.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();

      // Ensure it's a data row and not header/footer
      if (cellCount < 6) continue;

      // Status (Cell 0)
      const statusImg = cells.nth(0).locator('img').first();
      let status = 'Unknown';
      if (await statusImg.count() > 0) {
        const src = await statusImg.getAttribute('src') || '';
        if (src.toLowerCase().includes('/a.png')) {
          status = 'Approved';
        } else if (src.toLowerCase().includes('/1.png')) {
          status = 'Pending';
        } else if (src.toLowerCase().includes('/r.png')) {
          status = 'Rejected';
        } else if (src.toLowerCase().includes('/d.png')) {
          status = 'Deleted';
        } else {
          status = src.split('/').pop()?.replace('.png', '') || 'Unknown';
        }
      }

      // DOCNO (Cell 1)
      const docNoText = await cells.nth(1).innerText();
      const docNo = docNoText.trim();

      // Days (Cell 2)
      const daysText = await cells.nth(2).innerText();
      const days = parseFloat(daysText.trim()) || 0;

      // Type (Cell 3)
      const typeText = await cells.nth(3).innerText();
      const rawType = typeText.trim();

      // Map raw type code to user-friendly string
      let type = 'other';
      if (rawType.includes('VAC')) type = 'vacation';
      else if (rawType.includes('SCK')) type = 'sick';
      else if (rawType.includes('BDAY') || rawType.includes('BIRTH')) type = 'birthday';
      else if (rawType.includes('BER')) type = 'bereavement';
      else if (rawType.includes('PAT')) type = 'paternity';
      else if (rawType.includes('WEL')) type = 'wellness';

      // Start Date (Cell 4)
      const startText = await cells.nth(4).innerText();
      const startDateRaw = startText.trim(); // MM/DD/YYYY format

      // End Date (Cell 5)
      const endText = await cells.nth(5).innerText();
      const endDateRaw = endText.trim(); // MM/DD/YYYY format

      // Convert MM/DD/YYYY to YYYY-MM-DD for standard format
      const convertDate = (dStr: string) => {
        const parts = dStr.split('/');
        if (parts.length === 3) {
          const m = parts[0].padStart(2, '0');
          const d = parts[1].padStart(2, '0');
          const y = parts[2];
          return `${y}-${m}-${d}`;
        }
        return dStr;
      };

      leavesList.push({
        status,
        docNo,
        days,
        rawType,
        type,
        startDate: convertDate(startDateRaw),
        endDate: convertDate(endDateRaw),
      });
    }

    await browser.close();
    return NextResponse.json({ leaves: leavesList });

  } catch (error: any) {
    console.error('Error fetching MyPortal leaves:', error);
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: File a new leave request on MyPortal
export async function POST(request: NextRequest) {
  let browser: any = null;
  let context: any = null;
  let page: any = null;

  try {
    const body = await request.json();
    const { leaveType, startDate, endDate, startTime, endTime, reason } = body;

    if (!leaveType || !startDate || !endDate) {
      return NextResponse.json({ error: 'Leave type, start date, and end date are required.' }, { status: 400 });
    }

    // 1. Authenticate Tap User Session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // 2. Fetch User Profile credentials
    const { data: profile, error: dbError } = await supabase
      .from('user_profiles')
      .select('myportal_employee_id, myportal_password')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const encryptedEmployeeId = profile.myportal_employee_id;
    const encryptedPassword = profile.myportal_password;

    if (!encryptedEmployeeId || !encryptedPassword) {
      return NextResponse.json({ error: 'MyPortal credentials are not configured.' }, { status: 400 });
    }

    const decryptedEmployeeId = decrypt(encryptedEmployeeId);
    const decryptedPassword = decrypt(encryptedPassword);

    // 3. Launch browser and Login
    browser = await getBrowserInstance();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    page = await context.newPage();

    await loginToMyPortal(page, decryptedEmployeeId, decryptedPassword);

    // 4. Navigate to New Leave page
    const applyUrl = 'https://myportal.cocogen.com.ph/members/myp_reqa.aspx?ID=LV&T=Leaves';
    console.log(`Navigating to apply leave page: ${applyUrl}`);
    await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 5. Formulate Inputs
    // Map standly leave type to MyPortal option value
    let myPortalTypeCode = 'VACLVE'; // default
    const lt = leaveType.toLowerCase();
    if (lt === 'vacation') myPortalTypeCode = 'VACLVE';
    else if (lt === 'sick') myPortalTypeCode = 'SCKLVE';
    else if (lt === 'birthday') myPortalTypeCode = 'BDAYLVE';
    else if (lt === 'bereavement') myPortalTypeCode = 'BERLVE';
    else if (lt === 'paternity') myPortalTypeCode = 'PATLVE';
    else if (lt === 'wellness') myPortalTypeCode = 'WELLVE';

    // Format YYYY-MM-DD to MM/DD/YYYY
    const convertToMDY = (dStr: string) => {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}/${parts[0]}`;
      }
      return dStr;
    };
    const formattedStart = convertToMDY(startDate);
    const formattedEnd = convertToMDY(endDate);

    // Determine Mode: N = Normal, A = AM, P = PM
    let modeValue = 'N';
    if (startTime && endTime) {
      if (startTime < '12:00:00' && endTime <= '13:00:00') {
        modeValue = 'A'; // AM Half Day
      } else if (startTime >= '12:00:00') {
        modeValue = 'P'; // PM Half Day
      }
    }

    console.log(`Filing leave: Type=${myPortalTypeCode}, Start=${formattedStart}, End=${formattedEnd}, Mode=${modeValue}`);

    // Fill form elements
    const typeDropdown = page.locator('#ctl00_MainPlaceHolder_newapp1_trans_dd, select[name*="trans_dd"]').first();
    await typeDropdown.waitFor({ state: 'visible', timeout: 15000 });
    await typeDropdown.selectOption(myPortalTypeCode);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500); // Allow ASP.NET postback / values to refresh

    const startDateInput = page.locator('#ctl00_MainPlaceHolder_newapp1_C_START_DATE_textBox').first();
    await startDateInput.click();
    await startDateInput.focus();
    await startDateInput.evaluate((el: any) => { el.value = ''; });
    await startDateInput.pressSequentially(formattedStart, { delay: 50 });
    await startDateInput.evaluate((el: any) => {
      el.dispatchEvent(new Event('change'));
      el.dispatchEvent(new Event('blur'));
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);

    const endDateInput = page.locator('#ctl00_MainPlaceHolder_newapp1_C_END_DATE_textBox').first();
    await endDateInput.click();
    await endDateInput.focus();
    await endDateInput.evaluate((el: any) => { el.value = ''; });
    await endDateInput.pressSequentially(formattedEnd, { delay: 50 });
    await endDateInput.evaluate((el: any) => {
      el.dispatchEvent(new Event('change'));
      el.dispatchEvent(new Event('blur'));
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(500);

    const modeDropdown = page.locator('#ctl00_MainPlaceHolder_newapp1_MODE, select[name*="MODE"]').first();
    if (await modeDropdown.count() > 0) {
      await modeDropdown.selectOption(modeValue);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
    }

    const reasonTextarea = page.locator('#ctl00_MainPlaceHolder_newapp1_REMARKS, textarea[name*="REMARKS"]').first();
    if (await reasonTextarea.count() > 0) {
      await reasonTextarea.fill(reason || 'Sync from Tap/Standly');
    }

    const approverDropdown = page.locator('#ctl00_MainPlaceHolder_newapp1_APPROVER_dd, select[name*="APPROVER_dd"]').first();
    if (await approverDropdown.count() > 0) {
      await approverDropdown.selectOption('200001808');
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
    }

    // Click the "..." button (B_UNITS) to compute/validate leave days before submission
    const computeDaysBtn = page.locator('#ctl00_MainPlaceHolder_newapp1_B_UNITS, input[name*="B_UNITS"]').first();
    if (await computeDaysBtn.count() > 0) {
      console.log('Found Compute Days button (...). Clicking to calculate days...');
      await computeDaysBtn.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(1000); // Wait for ASP.NET postback calculation
    } else {
      console.log('No Compute Days button (...) found. Proceeding directly to submit.');
    }

    // Submit / Add
    const submitBtn = page.locator('#ctl00_MainPlaceHolder_newapp1_Add_btn, input[type="submit"][value="Add"], input[name*="Add_btn"]').first();
    await submitBtn.click();
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log('Submitted leave application. Checking for success redirection or validation messages...');
    
    let success = false;
    let finalError = '';
    
    // Check for up to 30 seconds (60 iterations * 500ms) to accommodate slow server response
    for (let attempt = 0; attempt < 60; attempt++) {
      await page.waitForTimeout(500);
      const currentUrl = page.url();
      
      // If we redirected back to the summary page, filing was successful!
      if (currentUrl.includes('myp_reqs.aspx')) {
        success = true;
        break;
      }
      
      // Check for success text anywhere in the body
      try {
        const bodyText = await page.innerText('body');
        if (bodyText.toLowerCase().includes('successfully submitted') || 
            bodyText.toLowerCase().includes('application request was successfully submitted')) {
          success = true;
          break;
        }
      } catch (bodyErr) {
        console.warn('Failed to read body text:', bodyErr);
      }

      // Check for error text in the message label
      const messageLabel = page.locator('#ctl00_MainPlaceHolder_newapp1_MessageLabel').first();
      if (await messageLabel.count() > 0) {
        const msg = await messageLabel.innerText();
        if (msg.trim()) {
          if (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('saved') || msg.toLowerCase().includes('filed') || msg.toLowerCase().includes('submitted')) {
            success = true;
            break;
          } else {
            finalError = msg.trim();
          }
        }
      }
      
      // Check validation summary
      const validationSummary = page.locator('#ctl00_MainPlaceHolder_newapp1_ADD_vs').first();
      if (await validationSummary.count() > 0) {
        const vsText = await validationSummary.innerText();
        if (vsText.trim()) {
          finalError = vsText.trim();
        }
      }
    }
    
    if (!success) {
      throw new Error(finalError || 'Filing leave failed. The form was not redirected or submitted successfully.');
    }

    // Close browser
    await browser.close();

    // Invalidate the portal logs cache so fresh data is loaded next time
    try {
      await supabase
        .from('portal_logs_cache')
        .delete()
        .eq('user_id', user.id);
      console.log(`[Cache Invalidation] Cleared portal logs cache for user ${user.id} due to leave filing`);
    } catch (cacheErr) {
      console.warn('Failed to clear portal_logs_cache:', cacheErr);
    }

    return NextResponse.json({ success: true, message: 'Leave request filed successfully on MyPortal.' });

  } catch (error: any) {
    console.error('Error filing leave on MyPortal:', error);
    if (page) {
      try {
        await page.screenshot({ path: 'error_screenshot.png', fullPage: true });
        console.log('Saved error screenshot to error_screenshot.png');
      } catch (screenshotErr) {
        console.error('Failed to capture error screenshot:', screenshotErr);
      }
    }
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Delete a leave request on MyPortal
export async function DELETE(request: NextRequest) {
  let browser: any = null;
  let context: any = null;

  try {
    const { searchParams } = new URL(request.url);
    const docNo = searchParams.get('docNo');

    if (!docNo) {
      return NextResponse.json({ error: 'Document Number (docNo) is required.' }, { status: 400 });
    }

    // 1. Authenticate Tap User Session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }

    // 2. Fetch User Profile credentials
    const { data: profile, error: dbError } = await supabase
      .from('user_profiles')
      .select('myportal_employee_id, myportal_password')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    const encryptedEmployeeId = profile.myportal_employee_id;
    const encryptedPassword = profile.myportal_password;

    if (!encryptedEmployeeId || !encryptedPassword) {
      return NextResponse.json({ error: 'MyPortal credentials are not configured.' }, { status: 400 });
    }

    const decryptedEmployeeId = decrypt(encryptedEmployeeId);
    const decryptedPassword = decrypt(encryptedPassword);

    // 3. Launch browser and Login
    browser = await getBrowserInstance();
    context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    await loginToMyPortal(page, decryptedEmployeeId, decryptedPassword);

    // Register dialog handler to auto-accept the confirmation popup
    page.on('dialog', async (dialog: any) => {
      console.log(`Dialog opened: [${dialog.type()}] "${dialog.message()}". Accepting...`);
      await dialog.accept();
    });

    // 4. Navigate directly to delete confirmation page
    const deleteUrl = `https://myportal.cocogen.com.ph/members/myp_reqd.aspx?ID=LV&DOCNO=${docNo}`;
    console.log(`Navigating to delete page: ${deleteUrl}`);
    await page.goto(deleteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Look for confirmation submit button
    const deleteBtn = page.locator('#ctl00_MainPlaceHolder_appdtl1_RequestFormView_Delete_btn, input[type="submit"][value="Delete"], input[name*="Delete_btn"]').first();
    
    if (await deleteBtn.count() > 0) {
      console.log('Clicking delete/confirm button...');
      await deleteBtn.click();
      await page.waitForTimeout(3000); // Allow server to register deletion
    } else {
      console.warn('Delete button not found. Assuming already deleted or not permitted.');
      throw new Error('Could not find the delete button on the portal delete page.');
    }

    await browser.close();

    // Invalidate the portal logs cache so fresh data is loaded next time
    try {
      await supabase
        .from('portal_logs_cache')
        .delete()
        .eq('user_id', user.id);
      console.log(`[Cache Invalidation] Cleared portal logs cache for user ${user.id} due to leave deletion`);
    } catch (cacheErr) {
      console.warn('Failed to clear portal_logs_cache:', cacheErr);
    }

    return NextResponse.json({ success: true, message: `Leave request ${docNo} deleted successfully from MyPortal.` });

  } catch (error: any) {
    console.error('Error deleting leave on MyPortal:', error);
    if (browser) await browser.close().catch(() => {});
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
