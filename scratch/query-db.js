const fs = require('fs');
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

async function run() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('--- Fetching User Profiles ---');
  const { data: profiles, error: err1 } = await supabase.from('user_profiles').select('*');
  if (err1) {
    console.error('Error profiles:', err1);
  } else {
    console.log(JSON.stringify(profiles.map(p => ({
      id: p.id,
      employee_id: p.employee_id,
      wfh_days: p.wfh_days,
      login_time: p.login_time,
      logout_time: p.logout_time,
      is_automation_enabled: p.is_automation_enabled,
      wfh_offsets: p.wfh_offsets
    })), null, 2));
  }

  console.log('\n--- Fetching Timelog History for 2026-06-03 ---');
  const { data: history, error: err2 } = await supabase
    .from('timelog_history')
    .select('*')
    .eq('date', '2026-06-03');
  if (err2) {
    console.error('Error history:', err2);
  } else {
    console.log(JSON.stringify(history, null, 2));
  }
}

run().catch(console.error);
