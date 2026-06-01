import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createStandlyAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';

// Force dynamic execution for API routes that fetch fresh database records
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extend serverless execution duration up to 60 seconds (Hobby plan supports up to 300s!)

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

  // Get current hour in Philippine Time (PHT, Asia/Manila, GMT+8)
  const currentPhtHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      hour12: false
    }).format(new Date()),
    10
  );

  // Determine Mode: 'login' or 'logout'
  // Custom query param ?mode=login or ?mode=logout, otherwise auto-detect by time of day (AM = login, PM = logout)
  let modeParam = searchParams.get('mode')?.toLowerCase();
  if (modeParam !== 'login' && modeParam !== 'logout') {
    // Default: Log in if triggered before 12:00 PM PHT, otherwise Log out
    modeParam = currentPhtHour < 12 ? 'login' : 'logout';
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
  let sessionUser: any = null;
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      supabase = userClient;
      isUserSession = true;
      sessionUser = user;
      console.log(`[Sandbox Execution] Found authenticated user session for ID: ${user.id}`);
    }
  } catch (cookieErr) {
    console.log('No user session cookies found, proceeding to use admin client.');
  }

  if (!supabase) {
    console.log('Initializing Supabase Admin Client. Env validation:', {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
    });
    supabase = createAdminClient();
  }

  try {
    // 1. Fetch Tap users via a dedicated admin client to map user_id to actual email
    const tapUserEmails = new Map<string, string>();
    if (sessionUser && sessionUser.email) {
      tapUserEmails.set(sessionUser.id, sessionUser.email.toLowerCase());
    }

    try {
      const adminClient = createAdminClient();
      const { data: authData, error: authUsersError } = await adminClient.auth.admin.listUsers();
      if (authUsersError) {
        console.error('Failed to list Tap users for email mapping:', authUsersError);
      } else if (authData?.users) {
        authData.users.forEach((u: any) => {
          if (u.email) {
            tapUserEmails.set(u.id, u.email.toLowerCase());
          }
        });
      }
    } catch (adminErr) {
      console.error('Exception during admin listing Tap users:', adminErr);
    }

    // 2. Fetch Standly holidays, profiles, and leaves securely
    let holidays: any[] = [];
    let standlyProfiles: any[] = [];
    let standlyLeaves: any[] = [];
    
    try {
      const standlySupabase = createStandlyAdminClient();
      
      const [holidaysRes, profilesRes, leavesRes] = await Promise.all([
        standlySupabase.from('holidays').select('*'),
        standlySupabase.from('profiles').select('id, email'),
        standlySupabase.from('leaves').select('*')
      ]);

      if (holidaysRes.error) console.error('Error fetching Standly holidays in scheduler:', holidaysRes.error);
      else holidays = holidaysRes.data || [];

      if (profilesRes.error) console.error('Error fetching Standly profiles in scheduler:', profilesRes.error);
      else standlyProfiles = profilesRes.data || [];

      if (leavesRes.error) console.error('Error fetching Standly leaves in scheduler:', leavesRes.error);
      else standlyLeaves = leavesRes.data || [];

    } catch (standlyErr) {
      console.error('Failed to query Standly database in scheduler:', standlyErr);
    }

    // Check if currentDate is a holiday
    const matchedHoliday = holidays.find((h: any) => h.date === currentDate);
    const isManualTest = searchParams.get('test') === 'true' || isUserSession;

    if (matchedHoliday) {
      const msg = `Skipped: Today (${currentDate}) is a holiday in Standly: ${matchedHoliday.name}.`;
      console.log(`[Cron Job] ${msg}`);
      return NextResponse.json({
        message: msg,
        summary: {
          total: 0,
          success: 0,
          failed: 0,
          skipped: 0
        },
        mode: modeText,
        dayEvaluated: currentDay,
        dateEvaluated: currentDate,
        results: [
          {
            userId: 'Holiday',
            employeeId: 'N/A',
            status: 'skipped',
            message: msg
          }
        ]
      });
    }

    // Fetch global company events
    let companyEvents: any[] = [];
    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('company_events')
        .select('*');
      if (eventsError) {
        console.error('Error fetching company events in scheduler:', eventsError);
      } else {
        companyEvents = eventsData || [];
      }
    } catch (err) {
      console.error('Failed to query company events in scheduler:', err);
    }

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
    if (matchedHoliday && isManualTest) {
      console.log(`[Warning] Today is a holiday (${matchedHoliday.name}), but running anyway because this is a manual test run.`);
    }
    console.log(`Found ${profiles.length} active automation profiles. Evaluating schedules...`);

    // 2. Launch browser (Remote CDP on Vercel if URL is provided, otherwise local headless Chromium)
    const remoteUrl = process.env.PLAYWRIGHT_SERVICE_URL;
    
    // Test browserless reachability
    try {
      console.log('Testing Browserless API reachability via fetch...');
      const testRes = await fetch('https://chrome.browserless.io/status');
      console.log('Browserless status response code:', testRes.status);
    } catch (fetchErr: any) {
      console.error('Browserless API fetch check failed:', fetchErr.message);
    }

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
          urlObj.pathname = '/chromium/playwright';
          formattedUrl = urlObj.toString();
          console.log(`Auto-formatted Browserless.io URL to: ${formattedUrl}`);
        } catch (urlErr) {
          console.error('Failed to parse remoteUrl, keeping raw:', remoteUrl, urlErr);
        }
      }

      console.log(`Connecting to remote Playwright browser service...`);
      try {
        if (formattedUrl.includes('/playwright')) {
          console.log('Connecting via Playwright native chromium.connect...');
          browser = await chromium.connect({ 
            wsEndpoint: formattedUrl,
            timeout: 15000
          });
        } else {
          console.log('Connecting via CDP chromium.connectOverCDP...');
          browser = await chromium.connectOverCDP(formattedUrl, {
            timeout: 15000
          });
        }
        console.log('Successfully established connection to Playwright Remote Browser!');
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
      
      // Get Tap user email to match with Standly profile for leaves
      const userEmailStr = tapUserEmails.get(userId);
      let isUserOnLeave = false;
      let leaveReason = '';
      
      if (userEmailStr && standlyProfiles.length > 0 && standlyLeaves.length > 0) {
        const standlyProfile = standlyProfiles.find(
          (p: any) => p.email && p.email.toLowerCase() === userEmailStr.toLowerCase()
        );
        
        if (standlyProfile) {
          const userLeave = standlyLeaves.find((l: any) => {
            if (l.user_id !== standlyProfile.id) return false;
            
            // Check if date matches
            const isDateMatched = currentDate >= l.start_date && currentDate <= l.end_date;
            if (!isDateMatched) return false;

            // Check if time matches current login/logout mode for half-day leaves
            if (l.start_time && l.end_time) {
              if (modeParam === 'login') {
                // Morning leave covers the login mode (starts before 12:00 PM)
                return l.start_time < '12:00:00';
              } else {
                // Afternoon leave covers the logout mode (ends after 12:00 PM)
                return l.end_time > '12:00:00';
              }
            }

            // Full-day leave
            return true;
          });
          
          if (userLeave) {
            isUserOnLeave = true;
            const timeInfo = (userLeave.start_time && userLeave.end_time)
              ? ` (Half-day: ${userLeave.start_time.substring(0, 5)} - ${userLeave.end_time.substring(0, 5)})`
              : '';
            leaveReason = (userLeave.reason || userLeave.type || 'On leave') + timeInfo;
          }
        }
      }

      // Decrypt credentials
      const encryptedEmployeeId = profile.employee_id;
      const encryptedPassword = profile.company_password;

      if (!encryptedEmployeeId || !encryptedPassword) {
        console.log(`[Profile Evaluation] User ${userId}: Skipped - Corporate credentials missing.`);
        results.push({
          userId,
          employeeId: 'N/A',
          status: 'skipped',
          message: 'Corporate credentials are not configured or missing.'
        });
        continue;
      }

      const isManualTest = searchParams.get('test') === 'true' || isUserSession;

      // Handle Holiday skip for manual tests logging
      if (matchedHoliday && isManualTest) {
        console.log(`[Profile Evaluation] User ${userId}: Holiday Warning - Today is a holiday: ${matchedHoliday.name}.`);
      }

      // Check Standly Leave skip
      if (isUserOnLeave) {
        console.log(`[Profile Evaluation] User ${userId}: Skipped - User is on leave (${leaveReason}).`);
        const decryptedEmployeeId = decrypt(encryptedEmployeeId);
        results.push({
          userId,
          employeeId: decryptedEmployeeId || 'Configured',
          status: 'skipped',
          message: `Skipped: User is on leave [${leaveReason}].`
        });
        continue;
      }

      // Check WFH schedule match
      // Skip this check if running manually triggered test from the dashboard
      const wfhDays = profile.wfh_days || [];
      const isWfhDay = wfhDays.some((day: string) => day.toLowerCase() === currentDay.toLowerCase());

      if (!isWfhDay && !isManualTest) {
        console.log(`[Profile Evaluation] User ${userId}: Skipped - Today (${currentDay}) is not in WFH schedule.`);
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
        console.log(`[Profile Evaluation] User ${userId}: Failed - Decryption error.`);
        results.push({
          userId,
          employeeId: 'Failed Decryption',
          status: 'failed',
          message: 'Failed to decrypt corporate credentials. Please update them.'
        });
        continue;
      }

      // Check database for existing successful submission today
      try {
        const { data: dbLog, error: dbLogError } = await supabase
          .from('timelog_history')
          .select('*')
          .eq('user_id', userId)
          .eq('date', currentDate)
          .eq('mode', modeParam)
          .limit(1);

        if (dbLogError) {
          console.warn(`[Database History Check Warning] Failed to query timelog_history for user ${userId}:`, dbLogError.message);
        } else if (!isManualTest && dbLog && dbLog.length > 0) {
          const skipMsg = `Skipped: Today's ${modeText} timelog already exists in Tap database history (submitted at ${dbLog[0].created_at}).`;
          console.log(`[Database History Check] ${skipMsg}`);
          results.push({
            userId,
            employeeId: decryptedEmployeeId,
            status: 'skipped',
            message: skipMsg
          });
          continue;
        }
      } catch (err: any) {
        console.warn(`[Database History Check Exception] Gracefully falling back to browser scraping check:`, err.message);
      }

      // Check for global company event overriding standard hours on this specific date
      const matchedEvent = companyEvents.find((e: any) => e.date === currentDate);
      const isExcludedFromEvent = matchedEvent && matchedEvent.excluded_users && matchedEvent.excluded_users.includes(userId);
      
      let timeToInject;
      if (matchedEvent && !isExcludedFromEvent) {
        timeToInject = modeParam === 'login'
          ? (matchedEvent.login_time || '08:00:00')
          : (matchedEvent.logout_time || '12:00:00');
        console.log(`[Company Event Override] User ${userId}: Found company event "${matchedEvent.title}" for date ${currentDate}. Overriding hours for ${modeText} mode to ${timeToInject}`);
      } else {
        if (matchedEvent && isExcludedFromEvent) {
          console.log(`[Company Event Exclusion] User ${userId}: Excluded from event "${matchedEvent.title}" for date ${currentDate}. Keeping standard hours.`);
        }
        timeToInject = modeParam === 'login' 
          ? (profile.login_time || '08:00:00') 
          : (profile.logout_time || '17:00:00');
      }

      // In dynamic hourly scheduling mode (?schedule=hourly), check if the user's configured hour matches the current PHT hour
      const isHourlySchedule = searchParams.get('schedule') === 'hourly';
      const configuredHour = parseInt(timeToInject.split(':')[0], 10);
      
      if (isHourlySchedule && !isManualTest && configuredHour !== currentPhtHour) {
        const msg = `Skipped: User's configured ${modeText} hour (${configuredHour}) does not match current PHT hour (${currentPhtHour}).`;
        console.log(`[Profile Evaluation] User ${userId}: ${msg}`);
        results.push({
          userId,
          employeeId: decryptedEmployeeId,
          status: 'skipped',
          message: msg
        });
        continue;
      }

      // Execute Playwright flow in isolation for this user with automatic self-healing retries
      const maxRetries = 3;
      let attempt = 0;
      let success = false;
      let lastError: any = null;

      while (attempt < maxRetries && !success) {
        attempt++;
        let context: any = null;

        try {
          if (attempt > 1) {
            console.log(`[Retry Attempt ${attempt}/${maxRetries}] Retrying timelog flow for Employee ID: ${decryptedEmployeeId} in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log(`Processing timelog for Employee ID: ${decryptedEmployeeId}...`);
          }

          context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          });
          const page = await context.newPage();

          // 1. Login Page Execution
          const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://timelog.cocogen.com.ph/Login';
          console.log(`Navigating to login portal: ${loginUrl}`);
          await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 15000 });

          // Fill out credentials
          await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId, { timeout: 10000 });
          await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword, { timeout: 10000 });
          
          // Submit Login Form
          console.log('Submitting credentials form...');
          await Promise.all([
            page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton', { timeout: 10000 }),
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {
              console.log('Navigation wait timed out or bypassed, continuing flow...');
            })
          ]);

          console.log('Logged in successfully. Waiting for dashboard state...');

          // Format Date: Convert YYYY-MM-DD to MM/DD/YYYY
          const [year, month, day] = currentDate.split('-');
          const formattedDate = `${month}/${day}/${year}`;

          // Check if today's timelog for the current mode already exists on the landing dashboard grid to prevent double submissions.
          const pageText = await page.innerText('body').catch(() => '');
          const lowerText = pageText.toLowerCase();
          
          // Formats to check (e.g. "05/28/2026" or "5/28/2026" or "05/28/26" or "5/28/26")
          const cleanMonth = parseInt(month, 10).toString();
          const cleanDay = parseInt(day, 10).toString();
          const shortYear = year.substring(2);
          
          const datePatterns = [
            `${month}/${day}/${year}`,
            `${cleanMonth}/${cleanDay}/${year}`,
            `${month}/${day}/${shortYear}`,
            `${cleanMonth}/${cleanDay}/${shortYear}`
          ];

          const hasDatePattern = datePatterns.some(pat => lowerText.includes(pat));
          const hasModeKeyword = modeParam === 'login'
            ? /\b(in|login|log in|time in|clock in)\b/i.test(lowerText)
            : /\b(out|logout|log out|time out|clock out)\b/i.test(lowerText);

          if (hasDatePattern && hasModeKeyword) {
            const skipMsg = `Skipped: Today's ${modeText} timelog already exists on the company portal grid.`;
            console.log(`[Double Run Check] ${skipMsg}`);
            results.push({
              userId,
              employeeId: decryptedEmployeeId,
              status: 'skipped',
              message: skipMsg
            });
            success = true;
            break;
          }

          // 2. Click "Add New" button to open/render the timelog submission form
          const addNewBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Add New"], #ctl00_ContentPlaceHolder1_Button1';
          console.log('Locating and clicking "Add New" timelog form button...');
          await page.waitForSelector(addNewBtn, { timeout: 10000 });
          await page.click(addNewBtn, { timeout: 10000 });

          // Wait for ASP.NET Postback to finish rendering the form
          console.log('Waiting for form postback to render...');
          await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(1000); // Small buffer for DOM to become editable

          // 3. Inject Form Fields
          // Wait for the update panel/form fields to load
          const typeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_type"], #ctl00_ContentPlaceHolder1_drp_type';
          await page.waitForSelector(typeSelect, { timeout: 10000 });

          console.log(`Injecting form variables: Date=${formattedDate}, Time=${timeToInject}, Mode=${modeText}`);

          // Type: "Correction"
          await page.selectOption(typeSelect, { value: 'C' }, { timeout: 5000 }); // 'C' represents "Correction"

          // Date 1 (Main date field)
          const dateInput1 = 'input[name="ctl00$ContentPlaceHolder1$txt_date1"], #ctl00_ContentPlaceHolder1_txt_date1';
          await page.fill(dateInput1, formattedDate, { timeout: 5000 });

          // Date 2 (Timelog date field)
          const dateInput2 = 'input[name="ctl00$ContentPlaceHolder1$txt_date2"], #ctl00_ContentPlaceHolder1_txt_date2';
          await page.fill(dateInput2, formattedDate, { timeout: 5000 });

          // Time Input
          const timeInput = 'input[name="ctl00$ContentPlaceHolder1$txtTime"], #ctl00_ContentPlaceHolder1_txtTime';
          const formattedTime = timeToInject.substring(0, 5); // 'hh:mm'
          await page.fill(timeInput, formattedTime, { timeout: 5000 });

          // Mode: 'I' for Log In, 'O' for Log Out
          const modeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_mode"], #ctl00_ContentPlaceHolder1_drp_mode';
          const modeValue = modeParam === 'login' ? 'I' : 'O';
          await page.selectOption(modeSelect, { value: modeValue }, { timeout: 5000 });

          // Reason: Dynamic WFH Reason from profile settings
          const reasonTextarea = 'textarea[name="ctl00$ContentPlaceHolder1$txt_reason"], #ctl00_ContentPlaceHolder1_txt_reason';
          await page.fill(reasonTextarea, profile.wfh_reason || 'Work from home', { timeout: 5000 });

          // Approver: Attempt to select "SALVADOR, JOEL PAOLO C." if available, otherwise gracefully accept portal default
          const approverSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_approver"], #ctl00_ContentPlaceHolder1_drp_approver';
          await page.selectOption(approverSelect, { value: '200001808' }, { timeout: 5000 }).catch(() => {
            console.log('Approver dropdown is read-only or option missing. Accepting portal default manager.');
          });

          // 4. Click Submit Button
          console.log('Submitting the timelog form...');
          const submitBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Submit"]';
          await page.click(submitBtn);

          // Wait for page postback/completion to register
          await page.waitForTimeout(3000); 

          console.log(`Timelog ${modeText} submission completed successfully for user ${userId}.`);

          // Save success status to local DB history
          try {
            const { error: insertError } = await supabase
              .from('timelog_history')
              .insert({
                user_id: userId,
                employee_id: decryptedEmployeeId,
                mode: modeParam,
                date: currentDate
              });
            if (insertError) {
              console.warn(`[Database History Update Warning] Failed to insert history record for user ${userId}:`, insertError.message);
            } else {
              console.log(`[Database History Update] Successfully recorded submission in database history for user ${userId}.`);
            }
          } catch (insertErr: any) {
            console.warn(`[Database History Update Exception] Failed to insert history record:`, insertErr.message);
          }

          results.push({
            userId,
            employeeId: decryptedEmployeeId,
            status: 'success',
            message: (matchedEvent && !isExcludedFromEvent)
              ? `Successfully submitted timelog ${modeText} for Company Event [${matchedEvent.title}] at ${timeToInject}.`
              : `Successfully submitted timelog ${modeText} for WFH day (${currentDay}) at ${timeToInject}.`
          });

          success = true;
        } catch (browserError: any) {
          console.error(`Browser automation failed for user ${userId} on attempt ${attempt}/${maxRetries}:`, browserError);
          lastError = browserError;
        } finally {
          if (context) {
            await context.close();
          }
        }
      }

      if (!success) {
        results.push({
          userId,
          employeeId: decryptedEmployeeId,
          status: 'failed',
          message: `Automation Error (failed after ${maxRetries} attempts): ${lastError?.message || 'Unknown error'}`
        });
      }
    }

    // Close the browser when done
    await browser.close();

    // 4. Final summary and response
    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;

    console.log(`[Cron Job Finished] Total Profiles: ${results.length} | Success: ${successCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);
    console.log('Final Results Details:', JSON.stringify(results, null, 2));

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
