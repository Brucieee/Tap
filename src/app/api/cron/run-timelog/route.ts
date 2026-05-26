import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { decrypt } from '@/utils/encryption';
import { chromium } from 'playwright';

// Force dynamic execution for API routes that fetch fresh database records
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  // Security check: Verify a cron secret token to prevent unauthorized triggers
  const cronSecret = searchParams.get('secret');
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

  const supabase = createAdminClient();

  try {
    // 1. Fetch all users with automation enabled
    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('is_automation_enabled', true);

    if (error) {
      console.error('Failed to fetch user profiles:', error);
      return NextResponse.json({ error: 'Database query failed', details: error.message }, { status: 500 });
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

    // 2. Launch headless browser
    // Set headless: true for production serverless execution.
    // Allow launching with specific arguments for reliability in server environments.
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

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
      const wfhDays = profile.wfh_days || [];
      // Support flexible casing (e.g. 'monday' vs 'Monday')
      const isWfhDay = wfhDays.some((day: string) => day.toLowerCase() === currentDay.toLowerCase());

      if (!isWfhDay) {
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
        const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://portal.company.com/login';
        console.log(`Navigating to login portal: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 30000 });

        // Fill out credentials
        // Use standard selectors and robust fallbacks (inputs by name, id, placeholder)
        await page.fill('input[name="employee_id"], #employee_id, input[placeholder*="Employee ID"]', decryptedEmployeeId);
        await page.fill('input[type="password"], #company_password, input[name="password"]', decryptedPassword);
        
        // Submit Login Form
        await Promise.all([
          page.click('button[type="submit"], #login-btn, button:has-text("Login")'),
          page.waitForURL(/dashboard|home|index|portal/i, { timeout: 15000 }).catch(() => {
            console.log('Explicit redirect URL not matched, proceeding with current page state');
          })
        ]);

        console.log('Login form submitted. Navigating to Add Timelog...');

        // 2. Navigate to Timelog form page
        const timelogUrl = process.env.COMPANY_PORTAL_TIMELOG_URL || 'https://portal.company.com/timelog/add';
        await page.goto(timelogUrl, { waitUntil: 'networkidle', timeout: 20000 });

        // 3. Inject Form Fields
        console.log(`Injecting form: Date=${currentDate}, Time=${timeToInject}, Mode=${modeText}`);
        
        // Type: "Addition"
        // Select by dropdown value or text
        const typeSelect = 'select[name="type"], select#type, select[placeholder*="Type"]';
        await page.waitForSelector(typeSelect, { timeout: 5000 });
        await page.selectOption(typeSelect, { label: 'Addition' });

        // Date: Calendar Date (YYYY-MM-DD)
        const dateInput = 'input[type="date"], input[name="date"], input#date';
        await page.fill(dateInput, currentDate);

        // Timelog: Specific time stamp (login_time or logout_time)
        const timeInput = 'input[type="time"], input[name="time"], input#time';
        // HTML time inputs accept hh:mm or hh:mm:ss format
        const formattedTime = timeToInject.substring(0, 5); // Take 'hh:mm'
        await page.fill(timeInput, formattedTime);

        // Mode: "Log In" or "Log Out"
        const modeSelect = 'select[name="mode"], select#mode';
        await page.selectOption(modeSelect, { label: modeText });

        // Reason: "Work from home"
        const reasonTextarea = 'textarea[name="reason"], textarea#reason';
        await page.fill(reasonTextarea, 'Work from home');

        // Approver: "SALVADOR, JOEL PAOLO  C."
        const approverSelect = 'select[name="approver"], select#approver';
        await page.selectOption(approverSelect, { label: 'SALVADOR, JOEL PAOLO  C.' });

        // 4. Click Submit Button
        console.log('Submitting the timelog form...');
        const submitBtn = 'button[type="submit"], button#submit-timelog, button:has-text("Submit")';
        await page.click(submitBtn);

        // Optional: Wait for success confirmation (message, toast, redirects, etc.)
        await page.waitForTimeout(2000); 

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
