import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createStandlyAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';
import { logStorage } from '../../cron/run-timelog/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Extend serverless execution duration up to 5 minutes

async function runRecoveryFlow(request: NextRequest, searchParams: URLSearchParams) {
  // 1. Authenticate user session & verify Admin role (or bypass for local testing)
  const bypassAuth = searchParams.get('bypassAuth') === 'true';
  const isDryRun = searchParams.get('dryRun') === 'true';
  
  let user = null;
  if (bypassAuth) {
    user = { id: '581f44dd-ee1b-4c93-8ead-0d292a994ed5' }; // Bruce (Admin)
    console.log('[Recovery Scanner] Bypassing Auth. Using default admin user ID:', user.id);
  } else {
    const supabase = await createClient();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized. Please log in.' }, { status: 401 });
    }
    user = authUser;
  }

  const adminClientForRole = createAdminClient();
  const { data: profile } = await adminClientForRole
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden. Admin privileges required.' }, { status: 403 });
  }

  // 2. Determine recovery date
  const dateParam = searchParams.get('date');
  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Invalid or missing date parameter. Format must be YYYY-MM-DD.' }, { status: 400 });
  }
  const targetDate = dateParam;

  // Resolve target day of the week in Manila time
  const targetDateObj = new Date(`${targetDate}T12:00:00+08:00`);
  const targetDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long'
  }).format(targetDateObj);

  console.log(`[Recovery Scanner] Starting scan for date: ${targetDate} (${targetDay})`);

  const results: Array<{
    userId: string;
    employeeId: string;
    status: 'success' | 'skipped' | 'failed';
    message: string;
  }> = [];

  const adminClient = createAdminClient();

  // 3. Fetch Tap users for email mapping
  const tapUserEmails = new Map<string, string>();
  try {
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

  // 4. Fetch Standly database details
  let holidays: any[] = [];
  let standlyProfiles: any[] = [];
  let standlyLeaves: any[] = [];
  
  try {
    const standlySupabase = createStandlyAdminClient();
    const [holidaysRes, pRes, leavesRes] = await Promise.all([
      standlySupabase.from('holidays').select('*'),
      standlySupabase.from('profiles').select('id, email'),
      standlySupabase.from('leaves').select('*')
    ]);

    if (holidaysRes.error) console.error('Error fetching Standly holidays:', holidaysRes.error);
    else holidays = holidaysRes.data || [];

    if (pRes.error) console.error('Error fetching Standly profiles:', pRes.error);
    else standlyProfiles = pRes.data || [];

    if (leavesRes.error) console.error('Error fetching Standly leaves:', leavesRes.error);
    else standlyLeaves = leavesRes.data || [];
  } catch (standlyErr) {
    console.error('Failed to query Standly database in recovery:', standlyErr);
  }

  // Check if targetDate is a holiday
  const matchedHoliday = holidays.find((h: any) => h.date === targetDate);
  if (matchedHoliday) {
    const msg = `Skipped: Target date ${targetDate} is a holiday: ${matchedHoliday.name}.`;
    console.log(`[Recovery Scanner] ${msg}`);
    return NextResponse.json({
      message: msg,
      summary: { total: 0, success: 0, failed: 0, skipped: 0 },
      results: []
    });
  }

  // Fetch company events
  let companyEvents: any[] = [];
  try {
    const { data: eventsData } = await adminClient.from('company_events').select('*');
    companyEvents = eventsData || [];
  } catch (err) {
    console.error('Failed to query company events:', err);
  }

  // 5. Fetch all active automation user profiles
  const { data: profiles, error: dbError } = await adminClient
    .from('user_profiles')
    .select('*')
    .eq('is_automation_enabled', true);

  if (dbError || !profiles || profiles.length === 0) {
    console.log('[Recovery Scanner] No active automated user profiles found.');
    return NextResponse.json({
      message: 'No active profiles with automation enabled found.',
      results: []
    });
  }

  console.log(`[Recovery Scanner] Found ${profiles.length} active automated profiles. Beginning sequential scan...`);

  // Setup browser configurations
  const remoteUrl = process.env.NODE_ENV === 'development' ? null : process.env.PLAYWRIGHT_SERVICE_URL;
  let playwright;
  try {
    playwright = await import('playwright-core');
  } catch (err) {
    playwright = await import('playwright');
  }
  const { chromium } = playwright;

  let formattedUrl = remoteUrl;
  if (remoteUrl && remoteUrl.includes('browserless.io') && !remoteUrl.includes('/playwright') && !remoteUrl.includes('/chromium')) {
    try {
      const urlObj = new URL(remoteUrl);
      urlObj.pathname = '/chromium/playwright';
      formattedUrl = urlObj.toString();
    } catch (e) {}
  }

  // Process users sequentially to preserve browser connections
  for (const userProfile of profiles) {
    const userId = userProfile.id;
    const userEmail = tapUserEmails.get(userId) || 'unknown';
    const encryptedEmployeeId = userProfile.employee_id;
    const encryptedPassword = userProfile.company_password;

    if (!encryptedEmployeeId || !encryptedPassword) {
      console.log(`[Recovery] User ${userEmail}: Skipped - Credentials missing.`);
      results.push({ userId, employeeId: 'N/A', status: 'skipped', message: 'Corporate credentials not configured.' });
      continue;
    }

    const decryptedEmployeeId = decrypt(encryptedEmployeeId);
    const decryptedPassword = decrypt(encryptedPassword);

    if (!decryptedEmployeeId || !decryptedPassword) {
      console.log(`[Recovery] User ${userEmail}: Failed - Decryption error.`);
      results.push({ userId, employeeId: 'Failed Decryption', status: 'failed', message: 'Failed to decrypt credentials.' });
      continue;
    }

    // Company Event Overrides
    const matchedEvent = companyEvents.find((e: any) => e.date === targetDate);
    const isExcludedFromEvent = matchedEvent && matchedEvent.excluded_users && matchedEvent.excluded_users.includes(userId);

    if (matchedEvent && isExcludedFromEvent) {
      console.log(`[Recovery] User ${userEmail}: Skipped - Excluded from event "${matchedEvent.title}".`);
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'skipped', message: `Excluded from event: ${matchedEvent.title}` });
      continue;
    }

    let stdLoginTime = userProfile.login_time || '08:00:00';
    let stdLogoutTime = userProfile.logout_time || '17:00:00';

    if (matchedEvent && !isExcludedFromEvent) {
      stdLoginTime = matchedEvent.login_time || '08:00:00';
      stdLogoutTime = matchedEvent.logout_time || '12:00:00';
    }

    // Standly Leaves Check
    let activeLeave: any = null;
    if (userEmail && standlyProfiles.length > 0 && standlyLeaves.length > 0) {
      const standlyProfile = standlyProfiles.find(
        (p: any) => p.email && p.email.toLowerCase() === userEmail.toLowerCase()
      );
      if (standlyProfile) {
        activeLeave = standlyLeaves.find((l: any) => {
          if (l.user_id !== standlyProfile.id) return false;
          return targetDate >= l.start_date && targetDate <= l.end_date;
        });
      }
    }

    // Build scheduled actions for the date
    interface ScheduledAction {
      mode: 'login' | 'logout';
      time: string;
      reason: string;
    }
    const scheduledActions: ScheduledAction[] = [];
    let leaveDescription = '';

    if (activeLeave) {
      const { start_time, end_time, reason, type } = activeLeave;
      const leaveTypeStr = reason || type || 'On leave';
      
      if (start_time && end_time) {
        const timeInfo = ` (Half-day: ${start_time.substring(0, 5)} - ${end_time.substring(0, 5)})`;
        leaveDescription = leaveTypeStr + timeInfo;
        
        if (start_time < '12:00:00' && end_time <= '13:00:00') {
          // Morning Half-day Leave
          scheduledActions.push({ mode: 'login', time: '13:00:00', reason: `Morning half-day leave - Login at 1 PM` });
          scheduledActions.push({ mode: 'logout', time: stdLogoutTime, reason: `Morning half-day leave - Standard logout` });
        } else if (start_time >= '12:00:00') {
          // Afternoon Half-day Leave
          scheduledActions.push({ mode: 'login', time: stdLoginTime, reason: `Afternoon half-day leave - Standard login` });
          scheduledActions.push({ mode: 'logout', time: '12:00:00', reason: `Afternoon half-day leave - Logout at 12 PM` });
        } else {
          leaveDescription = `Full-day leave (${leaveTypeStr} ${start_time.substring(0, 5)} - ${end_time.substring(0, 5)})`;
        }
      } else {
        leaveDescription = `Full-day leave (${leaveTypeStr})`;
      }
    } else {
      scheduledActions.push({ mode: 'login', time: stdLoginTime, reason: 'Standard login' });
      scheduledActions.push({ mode: 'logout', time: stdLogoutTime, reason: 'Standard logout' });
    }

    if (activeLeave && scheduledActions.length === 0) {
      console.log(`[Recovery] User ${userEmail}: Skipped - Full-day leave (${leaveDescription}).`);
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'skipped', message: `Full-day leave today: ${leaveDescription}` });
      continue;
    }

    // Determine WFH schedule match
    const offsets = userProfile.wfh_offsets || {};
    const offsetOverride = offsets[targetDate];
    let isWfhDay = false;
    let wfhReasonText = '';
    const resolvedStatus = offsetOverride 
      ? (typeof offsetOverride === 'object' ? offsetOverride.status : offsetOverride)
      : null;

    if (resolvedStatus === 'wfh') {
      isWfhDay = true;
      wfhReasonText = 'Custom WFH offset override';
    } else if (resolvedStatus === 'office') {
      isWfhDay = false;
      wfhReasonText = 'Custom Office offset override';
    } else {
      const wfhDays = userProfile.wfh_days || [];
      isWfhDay = wfhDays.some((day: string) => day.toLowerCase() === targetDay.toLowerCase());
      wfhReasonText = `Not in WFH schedule [${wfhDays.join(', ')}]`;
    }

    // Fetch database logs for target date to identify missing items
    let userHistory: any[] = [];
    try {
      const { data: dbLogs } = await adminClient
        .from('timelog_history')
        .select('*')
        .eq('user_id', userId)
        .eq('date', targetDate);
      userHistory = dbLogs || [];
    } catch (dbErr) {
      console.error(`[Recovery] Failed to fetch database history for ${userEmail}:`, dbErr);
    }

    // Check if they had a morning login (means we should log them out even if it is Office day)
    const hasManualLoginToday = userHistory.some(h => h.mode === 'login');

    if (!isWfhDay && !hasManualLoginToday) {
      console.log(`[Recovery] User ${userEmail}: Skipped - ${wfhReasonText} and no active morning login.`);
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'skipped', message: wfhReasonText });
      continue;
    }

    // Identify which scheduled actions are missing
    const missingActions = scheduledActions.filter(act => !userHistory.some(h => h.mode === act.mode));

    // If it's an Office day, we ONLY log them out if they logged in manually
    const finalActionsToRun = missingActions.filter(act => {
      if (isWfhDay) return true;
      return act.mode === 'logout' && hasManualLoginToday;
    });

    if (finalActionsToRun.length === 0) {
      console.log(`[Recovery] User ${userEmail}: Fully logged. No action needed.`);
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'skipped', message: 'No missing logs for this date.' });
      continue;
    }

    console.log(`[Recovery] User ${userEmail} requires attention. Missing actions: ${finalActionsToRun.map(a => a.mode).join(', ')}`);

    // Run Playwright flow for missing actions
    let localBrowser: any = null;
    let context: any = null;
    let userSuccessCount = 0;
    let userFailedMessage = '';

    try {
      if (formattedUrl) {
        if (formattedUrl.includes('/playwright')) {
          localBrowser = await chromium.connect({ wsEndpoint: formattedUrl, timeout: 20000 });
        } else {
          localBrowser = await chromium.connectOverCDP(formattedUrl, { timeout: 20000 });
        }
      } else {
        localBrowser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
      }

      context = await localBrowser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();

      // Log in to Portal
      const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://timelog.cocogen.com.ph/Login';
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId);
      await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword);
      await page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton');
      
      await page.waitForURL((url: any) => url.href.includes('/members/Home') || url.href.includes('Home') || url.href.includes('view'), { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      }).catch(async () => {
        const currentUrl = page.url();
        if (!currentUrl.includes('/members/Home') && !currentUrl.includes('Home')) {
          await page.goto('https://timelog.cocogen.com.ph/members/Home', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
      });

      // Get page text to double check portal grid
      const pageText = await page.innerText('body').catch(() => '');
      const lowerText = pageText.toLowerCase();

      // Formats to check (e.g. "07/01/2026")
      const [year, month, day] = targetDate.split('-');
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

      // Process actions
      for (const action of finalActionsToRun) {
        const hasModeKeyword = action.mode === 'login'
          ? /\b(in|login|log in|time in|clock in)\b/i.test(lowerText)
          : /\b(out|logout|log out|time out|clock out)\b/i.test(lowerText);

        const resolvedModeText = action.mode === 'login' ? 'Log In' : 'Log Out';

        if (hasDatePattern && hasModeKeyword) {
          console.log(`[Double Run Check] User ${userEmail}: ${resolvedModeText} already on portal grid. Syncing database.`);
          await adminClient.from('timelog_history').insert({
            user_id: userId,
            employee_id: decryptedEmployeeId,
            mode: action.mode,
            date: targetDate
          });
          userSuccessCount++;
          continue;
        }

        // Click "Add New"
        const addNewBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Add New"], #ctl00_ContentPlaceHolder1_Button1';
        await page.waitForSelector(addNewBtn, { timeout: 10000 });
        await page.click(addNewBtn);

        // Fill form
        const typeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_type"], #ctl00_ContentPlaceHolder1_drp_type';
        await page.waitForSelector(typeSelect, { timeout: 10000 });

        // Select 'Correction'
        await page.selectOption(typeSelect, { value: 'C' });

        const formattedDate = `${month}/${day}/${year}`;
        await page.fill('input[name="ctl00$ContentPlaceHolder1$txt_date1"], #ctl00_ContentPlaceHolder1_txt_date1', formattedDate);
        await page.fill('input[name="ctl00$ContentPlaceHolder1$txt_date2"], #ctl00_ContentPlaceHolder1_txt_date2', formattedDate);

        const formattedTime = action.time.substring(0, 5); // 'hh:mm'
        await page.fill('input[name="ctl00$ContentPlaceHolder1$txtTime"], #ctl00_ContentPlaceHolder1_txtTime', formattedTime);

        const modeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_mode"], #ctl00_ContentPlaceHolder1_drp_mode';
        await page.selectOption(modeSelect, { value: action.mode === 'login' ? 'I' : 'O' });

        await page.fill('textarea[name="ctl00$ContentPlaceHolder1$txt_reason"], #ctl00_ContentPlaceHolder1_txt_reason', userProfile.wfh_reason || 'Work from home');

        const approverSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_approver"], #ctl00_ContentPlaceHolder1_drp_approver';
        await page.selectOption(approverSelect, { value: '200001808' }).catch(() => {});

        if (isDryRun) {
          console.log(`[Dry Run Mode] Skipping actual portal submission and database write for User ${userEmail} (${resolvedModeText}).`);
        } else {
          console.log(`[Submission] Submitting ${resolvedModeText} for User ${userEmail} at ${action.time}`);
          const submitBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Submit"]';
          await page.click(submitBtn);

          await page.waitForTimeout(3000);

          // Write to history
          await adminClient.from('timelog_history').insert({
            user_id: userId,
            employee_id: decryptedEmployeeId,
            mode: action.mode,
            date: targetDate
          });
        }

        userSuccessCount++;
      }
    } catch (err: any) {
      console.error(`[Error] Automation failed for ${userEmail}:`, err.message);
      userFailedMessage = err.message;
    } finally {
      if (context) await context.close().catch(() => {});
      if (localBrowser) await localBrowser.close().catch(() => {});
    }

    if (userSuccessCount === finalActionsToRun.length) {
      console.log(`[Success] User ${userEmail}: Completed all ${userSuccessCount} missing submissions.`);
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'success', message: `Successfully recovered ${userSuccessCount} missing log(s).` });
    } else if (userSuccessCount > 0) {
      console.log(`[Partial Success] User ${userEmail}: Completed ${userSuccessCount}/${finalActionsToRun.length}. Error: ${userFailedMessage}`);
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'failed', message: `Recovered ${userSuccessCount}/${finalActionsToRun.length} logs. Error: ${userFailedMessage}` });
    } else {
      results.push({ userId, employeeId: decryptedEmployeeId, status: 'failed', message: `Failed: ${userFailedMessage}` });
    }
  }

  const successCount = results.filter(r => r.status === 'success').length;
  const failedCount = results.filter(r => r.status === 'failed').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;

  console.log(`[Recovery Completed] Total scanned: ${profiles.length} | Success: ${successCount} | Failed: ${failedCount} | Skipped: ${skippedCount}`);

  return NextResponse.json({
    message: 'Completed manual logs recovery scan.',
    summary: {
      total: profiles.length,
      success: successCount,
      failed: failedCount,
      skipped: skippedCount
    },
    results
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const isStream = searchParams.get('stream') === 'true';

  if (isStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const storeLog = (msg: string, status: 'info' | 'success' | 'warn' | 'error') => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status, message: msg })}\n\n`));
          } catch (e) {
            // Stream closed
          }
        };

        await logStorage.run({ log: storeLog }, async () => {
          try {
            const flowResponse = await runRecoveryFlow(request, searchParams);
            let flowData = {};
            
            if (flowResponse instanceof Response) {
              flowData = await flowResponse.json();
            } else if (flowResponse && typeof (flowResponse as any).json === 'function') {
              flowData = await (flowResponse as any).json();
            } else {
              flowData = flowResponse;
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'final', data: flowData })}\n\n`));
          } catch (err: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: `Recovery process crashed: ${err.message}` })}\n\n`));
          } finally {
            controller.close();
          }
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });
  }

  return runRecoveryFlow(request, searchParams);
}
