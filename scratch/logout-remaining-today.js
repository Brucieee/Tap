const fs = require('fs');
const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
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

const execute = process.argv.includes('--execute');
const targetDate = '2026-06-29';

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function requestLogOut(userId, email) {
  return new Promise((resolve) => {
    console.log(`[HTTP Request] Triggering logout for ${email} (${userId})...`);
    
    // We add test=true to bypass WFH days / holiday checks for manual recovery,
    // and we also forward dryRun status if executing in dry-run mode.
    const dryRunParam = execute ? '' : '&dryRun=true';
    const path = `/api/cron/run-timelog?mode=logout&date=${targetDate}&userId=${userId}&test=true${dryRunParam}&stream=true`;
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.trim().substring(6));
              if (data.status === 'final') {
                console.log(`[Result for ${email}]:`, JSON.stringify(data.data, null, 2));
              } else {
                console.log(`[Stream Log - ${email}] ${data.status.toUpperCase()}: ${data.message}`);
              }
            } catch (e) {
              // Ignore non-JSON stream details
            }
          }
        }
      });
      res.on('end', () => {
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`[Error for ${email}]: ${e.message}`);
      resolve();
    });

    req.end();
  });
}

async function run() {
  console.log(`\nStarting Logout Recovery Script for Date: ${targetDate}`);
  console.log(`Mode: ${execute ? 'EXECUTE (Actual portal submissions)' : 'DRY RUN (Simulate/Log list)'}`);
  
  // 1. Get all Tap auth users for email mapping
  const tapUserEmails = new Map();
  const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers();
  if (authUsersError) {
    console.error('Error fetching auth users:', authUsersError);
    process.exit(1);
  }
  authUsers.users.forEach(u => {
    if (u.email) tapUserEmails.set(u.id, u.email.toLowerCase());
  });

  // 2. Fetch active user profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, employee_id, login_time, logout_time')
    .eq('is_automation_enabled', true);

  if (profilesError) {
    console.error('Error fetching user profiles:', profilesError);
    process.exit(1);
  }

  // 3. Fetch today's timelog history
  const { data: history, error: historyError } = await supabase
    .from('timelog_history')
    .select('*')
    .eq('date', targetDate);

  if (historyError) {
    console.error('Error fetching timelog history:', historyError);
    process.exit(1);
  }

  // Group history by user and mode
  const userHistory = {};
  history.forEach(log => {
    if (!userHistory[log.user_id]) {
      userHistory[log.user_id] = { login: false, logout: false };
    }
    userHistory[log.user_id][log.mode.toLowerCase()] = true;
  });

  // Find users who logged in today but didn't log out
  const usersToLogout = [];
  for (const profile of profiles) {
    const userId = profile.id;
    const email = tapUserEmails.get(userId) || 'unknown';
    const status = userHistory[userId] || { login: false, logout: false };
    
    if (status.login && !status.logout) {
      usersToLogout.push({ id: userId, email });
    }
  }

  console.log(`\nFound ${usersToLogout.length} users logged in without a corresponding logout today:`);
  usersToLogout.forEach(u => console.log(` - ${u.email} (${u.id})`));

  if (usersToLogout.length === 0) {
    console.log('\nNo users need logout recovery. Exiting.');
    return;
  }

  console.log('\nProcessing logouts...');
  // We process sequentially to prevent Browserless/Puppeteer concurrency limits
  for (const user of usersToLogout) {
    await requestLogOut(user.id, user.email);
  }

  console.log('\nLogout recovery processing finished.');
}

run().catch(console.error);
