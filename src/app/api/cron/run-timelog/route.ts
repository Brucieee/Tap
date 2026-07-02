import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createStandlyAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { decrypt } from '@/utils/encryption';
import { AsyncLocalStorage } from 'async_hooks';

// Force dynamic execution for API routes that fetch fresh database records
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Extend serverless execution duration up to 300 seconds (5 minutes)

export const logStorage = new AsyncLocalStorage<{
  log: (msg: string, status: 'info' | 'success' | 'warn' | 'error') => void;
}>();

// Override console globally to pipe execution logs into request storage when active
if (typeof global !== 'undefined') {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    const store = logStorage.getStore();
    if (store) {
      store.log(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '), 'info');
    }
    originalLog(...args);
  };

  console.error = (...args: any[]) => {
    const store = logStorage.getStore();
    if (store) {
      store.log(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '), 'error');
    }
    originalError(...args);
  };

  console.warn = (...args: any[]) => {
    const store = logStorage.getStore();
    if (store) {
      store.log(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '), 'warn');
    }
    originalWarn(...args);
  };
}

async function runTimelogFlow(request: NextRequest, searchParams: URLSearchParams) {
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
  const hourParam = searchParams.get('hour');
  const currentPhtHour = hourParam ? parseInt(hourParam, 10) : parseInt(
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
  const currentDay = dayParam || new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long'
  }).format(new Date());

  // Get current calendar date in YYYY-MM-DD format (or allow ?date=2026-05-26)
  const dateParam = searchParams.get('date');
  const currentDate = dateParam || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  const isDryRun = searchParams.get('dryRun') === 'true' || process.env.DRY_RUN === 'true';

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
      // Manual/Sandbox run: Fetch targeted profile or all profiles if requested by admin
      const targetUserId = searchParams.get('userId');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (targetUserId === 'all') {
        // Verify admin
        const { data: adminProfile } = await supabase.from('user_profiles').select('role').eq('id', user?.id).single();
        if (adminProfile?.role === 'admin') {
          const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('is_automation_enabled', true);
          profiles = data;
          dbError = error;
        } else {
          return NextResponse.json({ error: 'Forbidden. Admin privileges required to trigger for all users.' }, { status: 403 });
        }
      } else {
        let fetchId = user?.id;
        if (targetUserId) {
          // Verify admin
          const { data: adminProfile } = await supabase.from('user_profiles').select('role').eq('id', user?.id).single();
          if (adminProfile?.role === 'admin') {
            fetchId = targetUserId;
          } else {
            return NextResponse.json({ error: 'Forbidden. Admin privileges required to trigger for another user.' }, { status: 403 });
          }
        }

        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', fetchId);
        profiles = data;
        dbError = error;
      }
    } else {
      // Automated Cron Job: Fetch active profiles (allow targeting a specific userId if provided)
      const targetUserId = searchParams.get('userId');
      let query = supabase
        .from('user_profiles')
        .select('*')
        .eq('is_automation_enabled', true);
      
      if (targetUserId && targetUserId !== 'all') {
        query = query.eq('id', targetUserId);
      }
      
      const { data, error } = await query;
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

    // 2. Setup browser launcher settings (Remote CDP on Vercel if URL is provided, otherwise local headless Chromium)
    const remoteUrl = process.env.NODE_ENV === 'development' ? null : process.env.PLAYWRIGHT_SERVICE_URL;
    
    // Dynamic import to prevent top-level cold-start bundler crashes on Vercel
    let playwright;
    try {
      playwright = await import('playwright-core');
    } catch (err) {
      console.log('playwright-core not found, falling back to playwright...', err);
      playwright = await import('playwright');
    }

    const { chromium } = playwright;
    let formattedUrl = remoteUrl;
    if (remoteUrl && remoteUrl.includes('browserless.io') && !remoteUrl.includes('/playwright') && !remoteUrl.includes('/chromium')) {
      try {
        const urlObj = new URL(remoteUrl);
        urlObj.pathname = '/chromium/playwright';
        formattedUrl = urlObj.toString();
        console.log(`Auto-formatted Browserless.io URL to: ${formattedUrl}`);
      } catch (urlErr) {
        console.error('Failed to parse remoteUrl, keeping raw:', remoteUrl, urlErr);
      }
    }

    // 3. Process each profile in parallel
    const processProfile = async (profile: any) => {
      const userId = profile.id;
      
      // Decrypt credentials first
      const encryptedEmployeeId = profile.employee_id;
      const encryptedPassword = profile.company_password;

      if (!encryptedEmployeeId || !encryptedPassword) {
        console.log(`[Profile Evaluation] User ${userId}: Skipped - Corporate credentials missing.`);
        return {
          userId,
          employeeId: 'N/A',
          status: 'skipped' as const,
          message: 'Corporate credentials are not configured or missing.'
        };
      }

      const decryptedEmployeeId = decrypt(encryptedEmployeeId);
      const decryptedPassword = decrypt(encryptedPassword);

      if (!decryptedEmployeeId || !decryptedPassword) {
        console.log(`[Profile Evaluation] User ${userId}: Failed - Decryption error.`);
        return {
          userId,
          employeeId: 'Failed Decryption',
          status: 'failed' as const,
          message: 'Failed to decrypt corporate credentials. Please update them.'
        };
      }

      // Check for global company event overriding standard hours on this specific date
      const matchedEvent = companyEvents.find((e: any) => e.date === currentDate);
      const isExcludedFromEvent = matchedEvent && matchedEvent.excluded_users && matchedEvent.excluded_users.includes(userId);
      
      if (matchedEvent && isExcludedFromEvent) {
        const msg = `Skipped: User is excluded from Company Event "${matchedEvent.title}" on date ${currentDate}.`;
        console.log(`[Company Event Exclusion] User ${userId}: ${msg}`);
        return {
          userId,
          employeeId: decryptedEmployeeId,
          status: 'skipped' as const,
          message: msg
        };
      }

      // Determine standard times
      let stdLoginTime: string;
      let stdLogoutTime: string;
      
      if (matchedEvent && !isExcludedFromEvent) {
        stdLoginTime = matchedEvent.login_time || '08:00:00';
        stdLogoutTime = matchedEvent.logout_time || '12:00:00';
        console.log(`[Company Event Override] User ${userId}: Found company event "${matchedEvent.title}" for date ${currentDate}. Standard times set to Login: ${stdLoginTime}, Logout: ${stdLogoutTime}`);
      } else {
        stdLoginTime = profile.login_time || '08:00:00';
        stdLogoutTime = profile.logout_time || '17:00:00';
      }

      // Get Tap user email to match with Standly profile for leaves
      const userEmailStr = tapUserEmails.get(userId);
      let activeLeave: any = null;
      
      if (userEmailStr && standlyProfiles.length > 0 && standlyLeaves.length > 0) {
        const standlyProfile = standlyProfiles.find(
          (p: any) => p.email && p.email.toLowerCase() === userEmailStr.toLowerCase()
        );
        
        if (standlyProfile) {
          activeLeave = standlyLeaves.find((l: any) => {
            if (l.user_id !== standlyProfile.id) return false;
            // Check if date matches
            return currentDate >= l.start_date && currentDate <= l.end_date;
          });
        }
      }

      interface ScheduledAction {
        mode: 'login' | 'logout';
        time: string;
        hour: number;
        reason: string;
      }
      
      const scheduledActions: ScheduledAction[] = [];
      let leaveDescription = '';
      
      if (activeLeave) {
        const { start_time, end_time, reason, type } = activeLeave;
        const leaveTypeStr = reason || type || 'On leave';
        
        if (start_time && end_time) {
          // Half-day leave
          const timeInfo = ` (Half-day: ${start_time.substring(0, 5)} - ${end_time.substring(0, 5)})`;
          leaveDescription = leaveTypeStr + timeInfo;
          
          if (start_time < '12:00:00' && end_time <= '13:00:00') {
            // Morning Half-day Leave
            // Login at 1:00 PM (13:00:00)
            scheduledActions.push({
              mode: 'login',
              time: '13:00:00',
              hour: 13,
              reason: `Morning half-day leave (${leaveDescription}) - Login at 1 PM`
            });
            // Logout at stdLogoutTime
            scheduledActions.push({
              mode: 'logout',
              time: stdLogoutTime,
              hour: parseInt(stdLogoutTime.split(':')[0], 10),
              reason: `Morning half-day leave (${leaveDescription}) - Standard logout`
            });
          } else if (start_time >= '12:00:00') {
            // Afternoon Half-day Leave
            // Login at stdLoginTime
            scheduledActions.push({
              mode: 'login',
              time: stdLoginTime,
              hour: parseInt(stdLoginTime.split(':')[0], 10),
              reason: `Afternoon half-day leave (${leaveDescription}) - Standard login`
            });
            // Logout at 12:00 PM (12:00:00)
            scheduledActions.push({
              mode: 'logout',
              time: '12:00:00',
              hour: 12,
              reason: `Afternoon half-day leave (${leaveDescription}) - Logout at 12 PM`
            });
          } else {
            // Covers the whole day (e.g. 8 AM to 5 PM) -> treat as Full-day leave
            leaveDescription = `Full-day leave (${leaveTypeStr} ${start_time.substring(0, 5)} - ${end_time.substring(0, 5)})`;
          }
        } else {
          // Full-day leave
          leaveDescription = `Full-day leave (${leaveTypeStr})`;
        }
      } else {
        // Standard Day (No Leave)
        scheduledActions.push({
          mode: 'login',
          time: stdLoginTime,
          hour: parseInt(stdLoginTime.split(':')[0], 10),
          reason: 'Standard login'
        });
        scheduledActions.push({
          mode: 'logout',
          time: stdLogoutTime,
          hour: parseInt(stdLogoutTime.split(':')[0], 10),
          reason: 'Standard logout'
        });
      }

      // Fetch today's history for this user to check what has already been submitted
      let userHistory: any[] = [];
      try {
        const { data: dbLogs, error: dbLogError } = await supabase
          .from('timelog_history')
          .select('*')
          .eq('user_id', userId)
          .eq('date', currentDate);
        
        if (dbLogError) {
          console.warn(`[Database History Check Warning] Failed to query timelog_history for user ${userId}:`, dbLogError.message);
        } else if (dbLogs) {
          userHistory = dbLogs;
        }
      } catch (err: any) {
        console.warn(`[Database History Check Exception] Gracefully falling back to empty history:`, err.message);
      }

      // Resolve the active action for this request
      const isHourlySchedule = searchParams.get('schedule') === 'hourly';
      let matchedAction: ScheduledAction | undefined = undefined;
      
      if (isHourlySchedule && !isManualTest) {
        // Find all scheduled actions whose hour has arrived or passed
        const eligibleActions = scheduledActions.filter(act => act.hour <= currentPhtHour);
        // Exclude actions that are already recorded in DB history
        const pendingActions = eligibleActions.filter(act => !userHistory.some(h => h.mode === act.mode));
        
        if (pendingActions.length > 0) {
          // Sort ascending to execute the earliest unsubmitted action first
          pendingActions.sort((a, b) => a.hour - b.hour);
          matchedAction = pendingActions[0];
        }
      } else {
        // Manual/Sandbox run: match by requested modeParam
        matchedAction = scheduledActions.find(act => act.mode === modeParam);
      }

      if (!matchedAction) {
        let skipMsg = '';
        if (activeLeave && scheduledActions.length === 0) {
          skipMsg = `Skipped: User is on full-day leave today (${leaveDescription}).`;
        } else if (isHourlySchedule && !isManualTest) {
          skipMsg = `Skipped: All scheduled actions up to current hour (${currentPhtHour}) have been submitted or none configured. Scheduled today: ${scheduledActions.map(a => `${a.mode} at ${a.time}`).join(', ')}`;
        } else {
          skipMsg = `Skipped: Requested mode "${modeParam}" is not scheduled today due to leave or schedule constraints. Scheduled today: ${scheduledActions.map(a => `${a.mode} at ${a.time}`).join(', ')}`;
        }
        
        console.log(`[Profile Evaluation] User ${userId}: ${skipMsg}`);
        return {
          userId,
          employeeId: decryptedEmployeeId,
          status: 'skipped' as const,
          message: skipMsg
        };
      }

      const resolvedMode = matchedAction.mode;
      const timeToInject = matchedAction.time;
      const actionReason = matchedAction.reason;
      const resolvedModeText = resolvedMode === 'login' ? 'Log In' : 'Log Out';

      // Handle Holiday skip warning for manual tests
      if (matchedHoliday && isManualTest) {
        console.log(`[Profile Evaluation] User ${userId}: Holiday Warning - Today is a holiday: ${matchedHoliday.name}.`);
      }

      // Determine if there is an active half-day leave for bypassing standard WFH schedule constraints
      let isHalfDayLeave = false;
      if (activeLeave) {
        const { start_time, end_time } = activeLeave;
        if (start_time && end_time) {
          if ((start_time < '12:00:00' && end_time <= '13:00:00') || (start_time >= '12:00:00')) {
            isHalfDayLeave = true;
          }
        }
      }

      // Check WFH schedule match
      // Skip this check if running manually triggered test from the dashboard or if on half-day leave
      const offsets = profile.wfh_offsets || {};
      const offsetOverride = offsets[currentDate]; // YYYY-MM-DD
      
      let isWfhDay = false;
      let wfhReasonText = '';
      const resolvedStatus = offsetOverride 
        ? (typeof offsetOverride === 'object' ? offsetOverride.status : offsetOverride)
        : null;

      if (resolvedStatus === 'wfh') {
        isWfhDay = true;
        wfhReasonText = `Custom WFH offset override active for today (${currentDate})`;
      } else if (resolvedStatus === 'office') {
        isWfhDay = false;
        wfhReasonText = `Custom Office/On-Site offset override active for today (${currentDate})`;
      } else {
        const wfhDays = profile.wfh_days || [];
        isWfhDay = wfhDays.some((day: string) => day.toLowerCase() === currentDay.toLowerCase());
        wfhReasonText = `Today (${currentDay}) is not in WFH schedule [${wfhDays.join(', ')}]`;
      }

      let hasManualLoginToday = false;
      if (resolvedMode === 'logout') {
        const todayLogin = userHistory.find(h => h.mode === 'login');
        if (todayLogin) {
          hasManualLoginToday = true;
          console.log(`[Profile Evaluation] User ${userId}: Found active morning login in history for today (${currentDate}). Forcing auto-logout execution despite today being an Office day.`);
        }
      }

      if (!isWfhDay && !isManualTest && !hasManualLoginToday && !isHalfDayLeave) {
        console.log(`[Profile Evaluation] User ${userId}: Skipped - ${wfhReasonText}.`);
        return {
          userId,
          employeeId: decryptedEmployeeId,
          status: 'skipped' as const,
          message: wfhReasonText
        };
      }

      // Check database for existing successful submission today using cached userHistory
      const existingDbLog = userHistory.find(h => h.mode === resolvedMode);
      if (!isManualTest && existingDbLog) {
        const skipMsg = `Skipped: Today's ${resolvedModeText} timelog already exists in Tap database history (submitted at ${existingDbLog.created_at}).`;
        console.log(`[Database History Check] ${skipMsg}`);
        return {
          userId,
          employeeId: decryptedEmployeeId,
          status: 'skipped' as const,
          message: skipMsg
        };
      }

      // Execute Playwright flow in isolation for this user with automatic self-healing retries
      const maxRetries = 3;
      let attempt = 0;
      let success = false;
      let lastError: any = null;

      while (attempt < maxRetries && !success) {
        attempt++;
        let localBrowser: any = null;
        let context: any = null;

        try {
          if (attempt > 1) {
            console.log(`[Retry Attempt ${attempt}/${maxRetries}] Retrying timelog flow for Employee ID: ${decryptedEmployeeId} in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log(`Processing timelog for Employee ID: ${decryptedEmployeeId}...`);
          }

          if (formattedUrl) {
            console.log(`Connecting to remote Playwright browser service for ${decryptedEmployeeId}...`);
            const maxConnRetries = 12; // Wait up to 30 seconds for concurrent slots to open up
            let connAttempt = 0;
            let connSuccess = false;
            
            while (connAttempt < maxConnRetries && !connSuccess) {
              connAttempt++;
              try {
                if (connAttempt > 1) {
                  const backoffMs = 2500;
                  console.log(`[Browser Queue] Slot occupied for ${decryptedEmployeeId}. Attempt ${connAttempt}/${maxConnRetries}: Retrying remote connection in ${backoffMs}ms...`);
                  await new Promise(resolve => setTimeout(resolve, backoffMs));
                }

                if (formattedUrl.includes('/playwright')) {
                  localBrowser = await chromium.connect({ 
                    wsEndpoint: formattedUrl,
                    timeout: 20000
                  });
                } else {
                  localBrowser = await chromium.connectOverCDP(formattedUrl, {
                    timeout: 20000
                  });
                }
                connSuccess = true;
              } catch (connErr: any) {
                console.error(`[Browser Connection Attempt ${connAttempt} Failed for ${decryptedEmployeeId}]:`, connErr.message);
                if (connAttempt >= maxConnRetries) {
                  console.warn(`Fallback: remote Playwright service is unreachable. Launching local Chromium browser for ${decryptedEmployeeId}...`);
                  try {
                    localBrowser = await chromium.launch({
                      headless: true,
                      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
            console.log(`Launching local Chromium browser for ${decryptedEmployeeId}...`);
            try {
              localBrowser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
              });
            } catch (localLaunchErr: any) {
              console.error('Local chromium launch failed:', localLaunchErr.message);
              throw new Error(`Local browser execution is not supported in the current serverless environment. Please configure PLAYWRIGHT_SERVICE_URL with a valid remote browser service endpoint. Details: ${localLaunchErr.message}`);
            }
          }

          context = await localBrowser.newContext({
            viewport: { width: 1280, height: 800 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          });
          const page = await context.newPage();

          // 1. Login Page Execution
          const loginUrl = process.env.COMPANY_PORTAL_LOGIN_URL || 'https://timelog.cocogen.com.ph/Login';
          console.log(`Navigating to login portal: ${loginUrl}`);
          await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

          // Fill out credentials
          await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$UserName"], #ctl00_ContentPlaceHolder1_Login1_UserName', decryptedEmployeeId, { timeout: 10000 });
          await page.fill('input[name="ctl00$ContentPlaceHolder1$Login1$Password"], #ctl00_ContentPlaceHolder1_Login1_Password', decryptedPassword, { timeout: 10000 });
          
          // Submit Login Form
          console.log('Submitting credentials form...');
          await page.click('input[name="ctl00$ContentPlaceHolder1$Login1$LoginButton"], #ctl00_ContentPlaceHolder1_Login1_LoginButton', { timeout: 10000 });
          
          console.log('Waiting for login redirection...');
          await page.waitForURL((url: any) => url.href.includes('/members/Home') || url.href.includes('Home') || url.href.includes('view'), { 
            waitUntil: 'domcontentloaded', 
            timeout: 15000 
          }).catch(async () => {
            console.log('waitForURL timed out, checking/forcing navigation to Home page...');
            const currentUrl = page.url();
            if (!currentUrl.includes('/members/Home') && !currentUrl.includes('Home')) {
              await page.goto('https://timelog.cocogen.com.ph/members/Home', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            }
          });

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
          const hasModeKeyword = resolvedMode === 'login'
            ? /\b(in|login|log in|time in|clock in)\b/i.test(lowerText)
            : /\b(out|logout|log out|time out|clock out)\b/i.test(lowerText);

          if (hasDatePattern && hasModeKeyword) {
            const skipMsg = `Skipped: Today's ${resolvedModeText} timelog already exists on the company portal grid.`;
            console.log(`[Double Run Check] ${skipMsg}`);
            success = true;
            return {
              userId,
              employeeId: decryptedEmployeeId,
              status: 'skipped' as const,
              message: skipMsg
            };
          }

          // 2. Click "Add New" button to open/render the timelog submission form
          const addNewBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Add New"], #ctl00_ContentPlaceHolder1_Button1';
          console.log('Locating and clicking "Add New" timelog form button...');
          await page.waitForSelector(addNewBtn, { timeout: 10000 });
          await page.click(addNewBtn, { timeout: 10000 });

          // Wait for ASP.NET Postback to finish rendering the form
          console.log('Waiting for form postback to render...');

          // 3. Inject Form Fields
          // Wait for the update panel/form fields to load
          const typeSelect = 'select[name="ctl00$ContentPlaceHolder1$drp_type"], #ctl00_ContentPlaceHolder1_drp_type';
          await page.waitForSelector(typeSelect, { timeout: 10000 });

          console.log(`Injecting form variables: Date=${formattedDate}, Time=${timeToInject}, Mode=${resolvedModeText}`);

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
          const modeValue = resolvedMode === 'login' ? 'I' : 'O';
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
          if (isDryRun) {
            console.log(`[Dry Run Mode] Skipping actual submission click on portal for user ${userId}.`);
          } else {
            console.log('Submitting the timelog form...');
            const submitBtn = 'input[name="ctl00$ContentPlaceHolder1$Button1"][value="Submit"]';
            await page.click(submitBtn);

            // Wait for page postback/completion to register
            await page.waitForTimeout(3000); 
          }

          console.log(`Timelog ${resolvedModeText} submission completed successfully for user ${userId}.`);

          // Save success status to local DB history
          if (isDryRun) {
            console.log(`[Dry Run Mode] Skipping database history record insertion for user ${userId}.`);
          } else {
            try {
              const { error: insertError } = await supabase
                .from('timelog_history')
                .insert({
                  user_id: userId,
                  employee_id: decryptedEmployeeId,
                  mode: resolvedMode,
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
          }

          let successMessage = '';
          if (matchedEvent && !isExcludedFromEvent) {
            successMessage = `Successfully submitted timelog ${resolvedModeText} for Company Event [${matchedEvent.title}] at ${timeToInject}.`;
          } else if (hasManualLoginToday) {
            successMessage = `Successfully submitted automated manual-override timelog ${resolvedModeText} due to active morning login at ${timeToInject}.`;
          } else {
            successMessage = `Successfully submitted timelog ${resolvedModeText} (${actionReason}) at ${timeToInject}.`;
          }

          success = true;
          return {
            userId,
            employeeId: decryptedEmployeeId,
            status: 'success' as const,
            message: successMessage
          };
        } catch (browserError: any) {
          console.error(`Browser automation failed for user ${userId} on attempt ${attempt}/${maxRetries}:`, browserError);
          lastError = browserError;
        } finally {
          if (context) {
            await context.close().catch(() => {});
          }
          if (localBrowser) {
            await localBrowser.close().catch(() => {});
          }
        }
      }

      return {
        userId,
        employeeId: decryptedEmployeeId,
        status: 'failed' as const,
        message: `Automation Error (failed after ${maxRetries} attempts): ${lastError?.message || 'Unknown error'}`
      };
    };

    // Process profiles in parallel to prevent Vercel Serverless timeouts
    const results = await Promise.all(profiles.map(profile => processProfile(profile)));



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
  } finally {
    console.log('Successfully completed cron route execution.');
  }
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
            const flowResponse = await runTimelogFlow(request, searchParams);
            let flowData = {};
            
            // Extract JSON object safely from the Response returned by runTimelogFlow
            if (flowResponse instanceof Response) {
              flowData = await flowResponse.json();
            } else if (flowResponse && typeof (flowResponse as any).json === 'function') {
              flowData = await (flowResponse as any).json();
            } else {
              flowData = flowResponse;
            }
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'final', data: flowData })}\n\n`));
          } catch (err: any) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: 'error', message: `Fatal process error: ${err.message}` })}\n\n`));
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

  return runTimelogFlow(request, searchParams);
}
