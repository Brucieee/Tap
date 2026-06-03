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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const { data, error } = await adminClient
    .from('user_profiles')
    .select('id, employee_id, wfh_days, login_time, logout_time, is_automation_enabled, role');
    
  if (error) {
    console.error(error);
  } else {
    console.log('Profiles:', JSON.stringify(data, null, 2));
  }
}
run();
