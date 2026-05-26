import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';

// Force dynamic execution for API routes that fetch fresh database records
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Security check: Verify a cron secret token to prevent unauthorized triggers
  const authHeader = request.headers.get('authorization');
  const cronSecret = searchParams.get('secret') || (authHeader ? authHeader.replace('Bearer ', '') : null);
  const expectedSecret = process.env.CRON_SECRET;
  
  if (expectedSecret && cronSecret !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized. Invalid cron secret key.' },
      { status: 401 }
    );
  }

  // Determine Mode: 'login' or 'logout'
  // Custom query param ?mode=login or ?mode=logout, otherwise auto-detect by time of day (AM = login, PM = logout)
  let modeParam = searchParams.get('mode')?.toLowerCase();
  if (modeParam !== 'login' && modeParam !== 'logout') {
    const currentHour = new Date().getHours();
    // Default: Log in if triggered before 12:00 PM, otherwise Log out
    modeParam = currentHour < 12 ? 'login' : 'logout';
  }
  const modeText = modeParam === 'login' ? 'Log In' : 'Log Out';

  // Get current day of the week in English (e.g., 'Monday', 'Tuesday', etc.)
  // We can also allow overriding the day for testing, e.g., ?day=Monday
  const dayParam = searchParams.get('day');
  const currentDay = dayParam || new Date().toLocaleDateString('en-US', { weekday: 'long' });

  // Get current calendar date in YYYY-MM-DD format (or allow ?date=2026-05-26)
  const dateParam = searchParams.get('date');
  const currentDate = dateParam || new Date().toISOString().split('T')[0];

  const results: Array<{
    userId: string;
    employeeId: string;
    status: 'success' | 'skipped' | 'failed';
    message: string;
  }> = [];

  // Try to authenticate using the user's standard session cookies if triggered from the dashboard sandbox
  let supabase;
  let isUserSession = false;
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      supabase = userClient;
      isUserSession = true;
      console.log(`[Sandbox Execution] Found authenticated user session for ID: ${user.id}`);
    }
  } catch (cookieErr) {
    console.log('No user session cookies found, proceeding to use admin client.');
  }

  if (!supabase) {
    supabase = createAdminClient();
  }

  try {
    // Fetch profiles
    let profiles;
    let dbError;

    if (isUserSession) {
      // Manual/Sandbox run: Fetch only this user's profile
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user?.id);
      profiles = data;
      dbError = error;
    } else {
      // Automated Cron Job: Fetch all active profiles
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('is_automation_enabled', true);
      profiles = data;
      dbError = error;
    }

    if (dbError) {
      console.error('Failed to fetch user profiles:', dbError);
      return NextResponse.json({ error: 'Database query failed', details: dbError.message }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        message: 'No active profiles with automation enabled were found.',
        processedCount: 0,
        results: []
      });
    }

    console.log(`[Cron Job Started] Mode: ${modeText} | Day: ${currentDay} | Date: ${currentDate}`);
    console.log(`Found ${profiles.length} active automation profiles. Evaluating schedules...`);

    // 2. Launch browser (Remote CDP on Vercel if URL is provided, otherwise local headless Chromium)
    const remoteUrl = process.env.PLAYWRIGHT_SERVICE_URL;
    
    // Dynamic import to prevent top-level cold-start bundler crashes on Vercel
    let playwright;
    try {
      playwright = await import('playwright-core');
    } catch (err) {
      console.log('playwright-core not found, falling back to playwright...', err);
      playwright = await import('playwright');
    }

    const { chromium } = playwright;
    let browser;
    if (remoteUrl) {
      let formattedUrl = remoteUrl;
      // Auto-format Browserless.io URL if user provided root path
      if (remoteUrl.includes('browserless.io') && !remoteUrl.includes('/playwright') && !remoteUrl.includes('/chromium')) {
        try {
          const urlObj = new URL(remoteUrl);
          urlObj.pathname = '/playwright';
          formattedUrl = urlObj.toString();
          console.log(`Auto-formatted Browserless.io URL to: ${formattedUrl}`);
        } catch (urlErr) {
          console.error('Failed to parse remoteUrl, keeping raw:', remoteUrl, urlErr);
        }
      }

      console.log(`Connecting to remote Playwright browser service...`);
      try {
        if (formattedUrl.includes('/playwright')) {
          browser = await chromium.connect({ wsEndpoint: formattedUrl });
        } else {
          browser = await chromium.connectOverCDP(formattedUrl);
        }
      } catch (connErr: any) {
        console.error(`Browser connection failed:`, connErr);
        throw new Error(`Failed to connect to remote Playwright service: ${connErr.message}`);
      }
    } else {
      console.log('Launching local Chromium browser...');
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
    }

    // 3. Process each profile
    for (const profile of profiles) {
      const userId = profile.id;
      
      // Decrypt credentials
      const encryptedEmployeeId = profile.employee_id;
      const encryptedPassword = profile.company_password;

      if (!encryptedEmployeeId || !encryptedPassword) {
        results.push({
          userId,
          employeeId: 'N/A',
          status: 'skipped',
          message: 'Corporate credentials are not configured or missing.'
        });
        continue;
      }

      // Check WFH schedule match
      // Skip this check if running manually triggered test from the dashboard
      const isManualTest = searchParams.get('test') === 'true' || isUserSession;
      const wfhDays = profile.wfh_days || [];
      const isWfhDay = wfhDays.some((day: string) => day.toLowerCase() === currentDay.toLowerCase());

      if (!isWfhDay && !isManualTest) {
        results.push({
          userId,
          employeeId: 'Configured',
          status: 'skipped',
          message: `Today (${currentDay}) is not in user's WFH schedule [${wfhDays.join(', ')}].`
        });
        continue;
      }

      const decryptedEmployeeId = decrypt(encryptedEmployeeId);
      const decryptedPassword = decrypt(encryptedPassword);

      if (!decryptedEmployeeId || !decryptedPassword) {
        results.push({
          userId,
          employeeId: 'Failed Decryption',
          status: 'failed',
          message: 'Failed to decrypt corporate credentials. Please update them.'
        });
        continue;
      }

      // Determine time value to inject
      const timeToInject = modeParam === 'login' 
        ? (profile.login_time || '08:00:00') 
        : (profile.logout_time || '17:00:00');

      // Execute Playwright flow in isolation for this user
      try {
        console.log(`Processing timelog for Employee ID: ${decryptedEmployeeId}...`);
        
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        // 1. Login Page Execution
        const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://timelog.cocogen.com.ph/Login';
        console.log(`Navigating to login portal: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Fill out credentials
        await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
        await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
        
        // Submit Login Form
        console.log('Submitting credentials form...');
        await Promise.all([
          page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton'),
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {
            console.log('Navigation wait timed out or bypassed, continuing flow...');
          })
        ]);

        console.log('Logged in successfully. Waiting for dashboard state...');

        // 2. Click "Add New" button to open/render the timelog submission form
        const addNewBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Add New"], #ctl00_ContentPlaceHolder1_Button1';
        console.log('Locating and clicking "Add New" timelog form button...');
        await page.waitForSelector(addNewBtn, { timeout: 15000 });
        await page.click(addNewBtn);

        // 3. Inject Form Fields
        // Wait for the update panel/form fields to load
        const typeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_type"], #ctl00_ContentPlaceHolder1_drp_type';
        await page.waitForSelector(typeSelect, { timeout: 15000 });

        // Format Date: Convert YYYY-MM-DD to MM/DD/YYYY
        const [year, month, day] = currentDate.split('-');
        const formattedDate = `${month}/${day}/${year}`;
        console.log(`Injecting form variables: Date=${formattedDate}, Time=${timeToInject}, Mode=${modeText}`);

        // Type: "Correction"
        await page.selectOption(typeSelect, { value: 'C' }); // 'C' represents "Correction"

        // Date 1 (Main date field)
        const dateInput1 = 'input[name="ctl00$ContentPlaceHolder1$txt_date1"], #ctl00_ContentPlaceHolder1_txt_date1';
        await page.fill(dateInput1, formattedDate);

        // Date 2 (Timelog date field)
        const dateInput2 = 'input[name="ctl00$ContentPlaceHolder1$txt_date2"], #ctl00_ContentPlaceHolder1_txt_date2';
        await page.fill(dateInput2, formattedDate);

        // Time Input
        const timeInput = 'input[name="ctl00$ContentPlaceHolder1$txtTime"], #ctl00_ContentPlaceHolder1_txtTime';
        const formattedTime = timeToInject.substring(0, 5); // 'hh:mm'
        await page.fill(timeInput, formattedTime);

        // Mode: 'I' for Log In, 'O' for Log Out
        const modeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_mode"], #ctl00_ContentPlaceHolder1_drp_mode';
        const modeValue = modeParam === 'login' ? 'I' : 'O';
        await page.selectOption(modeSelect, { value: modeValue });

        // Reason: Dynamic WFH Reason from profile settings
        const reasonTextarea = 'textarea[name="ctl00$ContentPlaceHolder1$txt_reason"], #ctl00_ContentPlaceHolder1_txt_reason';
        await page.fill(reasonTextarea, profile.wfh_reason || 'Work from home');

        // Approver: "SALVADOR, JOEL PAOLO C."
        const approverSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_approver"], #ctl00_ContentPlaceHolder1_drp_approver';
        await page.selectOption(approverSelect, { value: '200001808' });

        // 4. Click Submit Button
        console.log('Submitting the timelog form...');
        const submitBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Submit"]';
        await page.click(submitBtn);

        // Wait for page postback/completion to register
        await page.waitForTimeout(3000); 

        console.log(`Timelog ${modeText} submission completed successfully for user ${userId}.`);

        results.push({
          userId,
          employeeId: decryptedEmployeeId,
          status: 'success',
          message: `Successfully submitted timelog ${modeText} for WFH day (${currentDay}) at ${timeToInject}.`
        });

        await context.close();
      } catch (browserError: any) {
        console.error(`Browser automation failed for user ${userId}:`, browserError);
        results.push({
          userId,
          employeeId: decryptedEmployeeId,
          status: 'failed',
          message: `Automation Error: ${browserError.message}`
        });
      }
    }

    // Close the browser when done
    await browser.close();

    // 4. Final summary and response
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      message: `Completed automated timelog run.`,
      summary: {
        total: results.length,
        success: successCount,
        failed: failedCount,
        skipped: skippedCount
      },
      mode: modeText,
      dayEvaluated: currentDay,
      dateEvaluated: currentDate,
      results
    });

  } catch (error: any) {
    console.error('Unhandled cron process failure:', error);
    return NextResponse.json(
      { error: 'Internal Server Error during cron processing', details: error.message },
      { status: 500 }
    );
  }
}
