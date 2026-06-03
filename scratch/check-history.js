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

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  try {
    console.log('Fetching last 20 rows of timelog_history...');
    const { data, error } = await adminClient
      .from('timelog_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('Recent history:', JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error('Execution error:', err);
  }
}

run();
