import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createStandlyAdminClient } from '@/utils/supabase/admin';
import { decrypt } from '@/utils/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for serverless functions

// Helper to launch browser
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

    console.log('Connecting to remote Playwright service for Leaves Sync Cron...');
    const maxConnRetries = 12;
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
    console.log('Launching local Chromium browser for Leaves Sync Cron...');
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

// Helper: Login to MyPortal
async function loginToMyPortal(page: any, employeeId: string, passwordString: string) {
  const loginUrl = 'https://myportal.cocogen.com.ph/';
  console.log(`Navigating to login portal: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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
    console.warn('MyPortal login redirection timed out. Current URL:', page.url());
    const currentUrl = page.url();
    if (currentUrl.includes('LoginMain') || currentUrl === loginUrl) {
      throw new Error('Authentication failed on MyPortal.');
    }
  });

  console.log('Successfully authenticated with MyPortal.');
}

// GET: Run leave synchronization for all users
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  // Security check: Verify a cron secret token
  const authHeader = request.headers.get('authorization');
  const cronSecret = searchParams.get('secret') || (authHeader ? authHeader.replace('Bearer ', '') : null);
  const expectedSecret = process.env.CRON_SECRET;
  
  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized. Invalid cron secret key.' }, { status: 401 });
  }

  const isDryRun = searchParams.get('dryRun') === 'true' || process.env.DRY_RUN === 'true';

  // 1. Initialize Supabase Admin Clients
  const supabase = createAdminClient();
  const standlySupabase = createStandlyAdminClient();

  const syncResults: any[] = [];

  try {
    // 2. Fetch Tap users and Standly profiles/leaves
    console.log('[Cron Leaves Sync] Querying user credentials and Standly database...');
    
    // Fetch Tap users with configured credentials
    const { data: tapProfiles, error: dbError } = await supabase
      .from('user_profiles')
      .select('id, myportal_employee_id, myportal_password')
      .not('myportal_employee_id', 'is', null)
      .not('myportal_password', 'is', null);

    if (dbError || !tapProfiles || tapProfiles.length === 0) {
      return NextResponse.json({ message: 'No users with MyPortal credentials configured.', usersCount: 0 });
    }

    // Map Tap user IDs to emails
    const tapUserEmails = new Map<string, string>();
    const { data: authData, error: authUsersError } = await supabase.auth.admin.listUsers();
    if (!authUsersError && authData?.users) {
      authData.users.forEach((u: any) => {
        if (u.email) {
          tapUserEmails.set(u.id, u.email.toLowerCase());
        }
      });
    }

    // Fetch Standly profiles and leaves
    const [standlyProfilesRes, standlyLeavesRes] = await Promise.all([
      standlySupabase.from('profiles').select('id, email'),
      standlySupabase.from('leaves').select('*')
    ]);

    const standlyProfiles = standlyProfilesRes.data || [];
    const standlyLeaves = standlyLeavesRes.data || [];

    console.log(`[Cron Leaves Sync] Processing ${tapProfiles.length} configured users...`);

    // 3. Process each user sequentially to respect Browserless concurrency limits
    for (const profile of tapProfiles) {
      const email = tapUserEmails.get(profile.id);
      if (!email) {
        console.warn(`[Cron Leaves Sync] Skipping user ${profile.id}: Email mapping not found in Tap.`);
        continue;
      }

      const standlyProfile = standlyProfiles.find(p => p.email?.toLowerCase() === email.toLowerCase());
      if (!standlyProfile) {
        console.warn(`[Cron Leaves Sync] Skipping user ${email}: Standly profile not found.`);
        continue;
      }

      // Filter Standly leaves for this user
      const userStandlyLeaves = standlyLeaves.filter(l => l.user_id === standlyProfile.id);

      const decryptedEmployeeId = decrypt(profile.myportal_employee_id);
      const decryptedPassword = decrypt(profile.myportal_password);

      if (!decryptedEmployeeId || !decryptedPassword) {
        console.error(`[Cron Leaves Sync] Failed to decrypt credentials for user ${email}`);
        continue;
      }

      console.log(`[Cron Leaves Sync] Starting sync for ${email}...`);
      
      let browser: any = null;
      let context: any = null;
      let page: any = null;
      const userSummary: any = {
        email,
        filed: [],
        deleted: [],
        errors: []
      };

      try {
        // Launch browser and login
        browser = await getBrowserInstance();
        context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        });
        page = await context.newPage();

        await loginToMyPortal(page, decryptedEmployeeId, decryptedPassword);

        // Fetch MyPortal leaves
        const summaryUrl = 'https://myportal.cocogen.com.ph/members/myp_reqs.aspx?ID=LV&SNODE=201&T=Leaves';
        await page.goto(summaryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

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

        // Parse leaves grid
        const tableSelector = '#ctl00_MainPlaceHolder_summ1_gvRequest, table[id*="gvRequest"]';
        const rowsLocator = page.locator(`${tableSelector} tr`);
        const rowCount = await rowsLocator.count();
        const myPortalLeaves: any[] = [];

        for (let i = 1; i < rowCount; i++) {
          const row = rowsLocator.nth(i);
          const cells = row.locator('td');
          const cellCount = await cells.count();
          if (cellCount < 6) continue;

          const statusImg = cells.nth(0).locator('img').first();
          let status = 'Unknown';
          if (await statusImg.count() > 0) {
            const src = await statusImg.getAttribute('src') || '';
            if (src.toLowerCase().includes('/a.png')) status = 'Approved';
            else if (src.toLowerCase().includes('/1.png')) status = 'Pending';
            else if (src.toLowerCase().includes('/r.png')) status = 'Rejected';
            else if (src.toLowerCase().includes('/d.png')) status = 'Deleted';
          }

          const docNo = (await cells.nth(1).innerText()).trim();
          const startText = (await cells.nth(4).innerText()).trim();
          const endText = (await cells.nth(5).innerText()).trim();

          const convertDate = (dStr: string) => {
            const parts = dStr.split('/');
            return parts.length === 3 ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : dStr;
          };

          myPortalLeaves.push({
            status,
            docNo,
            startDate: convertDate(startText),
            endDate: convertDate(endText)
          });
        }

        // Determine actions needed (Only sync leaves starting from today onwards)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. File leaves that exist in Standly but are missing in MyPortal (starting today onwards)
        const activeStandlyLeaves = userStandlyLeaves.filter((leave: any) => {
          const startDate = new Date(leave.start_date);
          startDate.setHours(0, 0, 0, 0);
          return startDate >= today;
        });

        const unsyncedLeaves = activeStandlyLeaves.filter((leave: any) => {
          const isMatched = myPortalLeaves.some((mpl: any) => {
            return mpl.startDate === leave.start_date && mpl.endDate === leave.end_date && mpl.status.toLowerCase() !== 'deleted' && mpl.status.toLowerCase() !== 'rejected';
          });
          return !isMatched;
        });

        for (const leave of unsyncedLeaves) {
          if (isDryRun) {
            console.log(`[Dry Run] Would file leave for ${email}: ${leave.start_date} to ${leave.end_date}`);
            userSummary.filed.push({ startDate: leave.start_date, endDate: leave.end_date, dryRun: true });
            continue;
          }

          try {
            console.log(`Filing leave for ${email}: ${leave.start_date}...`);
            const applyUrl = 'https://myportal.cocogen.com.ph/members/myp_reqa.aspx?ID=LV&T=Leaves';
            await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            let myPortalTypeCode = 'VACLVE';
            const lt = leave.type.toLowerCase();
            if (lt === 'vacation') myPortalTypeCode = 'VACLVE';
            else if (lt === 'sick') myPortalTypeCode = 'SCKLVE';
            else if (lt === 'birthday') myPortalTypeCode = 'BDAYLVE';
            else if (lt === 'bereavement') myPortalTypeCode = 'BERLVE';
            else if (lt === 'paternity') myPortalTypeCode = 'PATLVE';
            else if (lt === 'wellness') myPortalTypeCode = 'WELLVE';

            const convertToMDY = (dStr: string) => {
              const parts = dStr.split('-');
              return parts.length === 3 ? `${parts[1]}/${parts[2]}/${parts[0]}` : dStr;
            };
            const formattedStart = convertToMDY(leave.start_date);
            const formattedEnd = convertToMDY(leave.end_date);

            let modeValue = 'N';
            if (leave.start_time && leave.end_time) {
              if (leave.start_time < '12:00:00' && leave.end_time <= '13:00:00') modeValue = 'A';
              else if (leave.start_time >= '12:00:00') modeValue = 'P';
            }

            const typeDropdown = page.locator('#ctl00_MainPlaceHolder_newapp1_trans_dd, select[name*="trans_dd"]').first();
            await typeDropdown.waitFor({ state: 'visible', timeout: 15000 });
            await typeDropdown.selectOption(myPortalTypeCode);
            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForTimeout(500);

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
              await reasonTextarea.fill(leave.reason || 'Sync from Tap/Standly');
            }

            const approverDropdown = page.locator('#ctl00_MainPlaceHolder_newapp1_APPROVER_dd, select[name*="APPROVER_dd"]').first();
            if (await approverDropdown.count() > 0) {
              await approverDropdown.selectOption('200001808');
              await page.waitForLoadState('networkidle').catch(() => {});
              await page.waitForTimeout(500);
            }

            const computeDaysBtn = page.locator('#ctl00_MainPlaceHolder_newapp1_B_UNITS, input[name*="B_UNITS"]').first();
            if (await computeDaysBtn.count() > 0) {
              await computeDaysBtn.click();
              await page.waitForLoadState('networkidle').catch(() => {});
              await page.waitForTimeout(1000);
            }

            const submitBtn = page.locator('#ctl00_MainPlaceHolder_newapp1_Add_btn, input[type="submit"][value="Add"], input[name*="Add_btn"]').first();
            await submitBtn.click();
            await page.waitForLoadState('networkidle').catch(() => {});

            let fileSuccess = false;
            let fileErrorMsg = '';

            for (let attempt = 0; attempt < 60; attempt++) {
              await page.waitForTimeout(500);
              const currentUrl = page.url();
              if (currentUrl.includes('myp_reqs.aspx')) {
                fileSuccess = true;
                break;
              }

              try {
                const bodyText = await page.innerText('body');
                if (bodyText.toLowerCase().includes('successfully submitted')) {
                  fileSuccess = true;
                  break;
                }
              } catch {}

              const messageLabel = page.locator('#ctl00_MainPlaceHolder_newapp1_MessageLabel').first();
              if (await messageLabel.count() > 0) {
                const msg = await messageLabel.innerText();
                if (msg.trim()) {
                  if (msg.toLowerCase().includes('success') || msg.toLowerCase().includes('saved') || msg.toLowerCase().includes('filed') || msg.toLowerCase().includes('submitted')) {
                    fileSuccess = true;
                    break;
                  } else {
                    fileErrorMsg = msg.trim();
                  }
                }
              }
            }

            if (!fileSuccess) {
              throw new Error(fileErrorMsg || 'Form submission timed out or did not redirect.');
            }

            userSummary.filed.push({ startDate: leave.start_date, endDate: leave.end_date, status: 'success' });
            console.log(`Successfully filed leave for ${email}: ${leave.start_date}`);
          } catch (fileErr: any) {
            console.error(`Failed to file leave for ${email}:`, fileErr.message);
            userSummary.errors.push(`File error for ${leave.start_date}: ${fileErr.message}`);
          }
        }

        // 2. Delete leaves that are on MyPortal but were cancelled/deleted in Standly
        const activeMyPortalLeaves = myPortalLeaves.filter(mpl => {
          const startDate = new Date(mpl.startDate);
          startDate.setHours(0, 0, 0, 0);
          return mpl.status.toLowerCase() === 'pending' && startDate >= today;
        });
        const deletedStandlyLeaves = activeMyPortalLeaves.filter((mpl: any) => {
          const existsInStandly = userStandlyLeaves.some((leave: any) => {
            return leave.start_date === mpl.startDate && leave.end_date === mpl.endDate;
          });
          return !existsInStandly;
        });

        for (const mpl of deletedStandlyLeaves) {
          if (isDryRun) {
            console.log(`[Dry Run] Would delete leave for ${email}: docNo ${mpl.docNo}`);
            userSummary.deleted.push({ docNo: mpl.docNo, dryRun: true });
            continue;
          }

          try {
            console.log(`Deleting leave request ${mpl.docNo} for ${email}...`);
            const viewUrl = `https://myportal.cocogen.com.ph/members/myp_reqd.aspx?docno=${mpl.docNo}`;
            await page.goto(viewUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Setup dialog handler to accept delete alert box
            page.once('dialog', async (dialog: any) => {
              await dialog.accept().catch(() => {});
            });

            // Find Delete button
            const deleteBtn = page.locator('#ctl00_MainPlaceHolder_newapp1_Del_btn, input[value="Delete"], input[name*="Del_btn"]').first();
            await deleteBtn.waitFor({ state: 'visible', timeout: 10000 });
            await deleteBtn.click();
            await page.waitForLoadState('networkidle').catch(() => {});

            userSummary.deleted.push({ docNo: mpl.docNo, status: 'success' });
            console.log(`Successfully deleted leave request ${mpl.docNo} for ${email}`);
          } catch (delErr: any) {
            console.error(`Failed to delete leave request ${mpl.docNo} for ${email}:`, delErr.message);
            userSummary.errors.push(`Delete error for ${mpl.docNo}: ${delErr.message}`);
          }
        }
      } catch (userErr: any) {
        console.error(`[Cron Leaves Sync] Exception during user ${email} sync:`, userErr.message);
        userSummary.errors.push(`User processing failure: ${userErr.message}`);
      } finally {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      }

      syncResults.push(userSummary);
    }
  } catch (cronErr: any) {
    console.error('[Cron Leaves Sync] Global exception:', cronErr);
    return NextResponse.json({ error: cronErr.message || 'Internal Server Error' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Leaves sync cron completed.',
    results: syncResults
  });
}
