const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Manually parse .env.local
const envPath = 'c:/Users/Bruce/Downloads/Tap/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[0].split('=')[0].trim();
    let value = match[0].substring(match[0].indexOf('=') + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value;
  }
});

async function run() {
  const supabaseUrl = env.STANDLY_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.STANDLY_SUPABASE_SRK;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Standly environment variables in .env.local');
    return;
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log('--- Fetching Standly Profiles ---');
  const { data: profiles, error: err1 } = await supabase.from('profiles').select('id, email');
  if (err1) {
    console.error('Error profiles:', err1);
  } else {
    console.log(`Found ${profiles.length} profiles:`);
    console.log(JSON.stringify(profiles, null, 2));
  }

  console.log('\n--- Fetching Standly Leaves ---');
  const { data: leaves, error: err2 } = await supabase.from('leaves').select('*').order('created_at', { ascending: false }).limit(20);
  if (err2) {
    console.error('Error leaves:', err2);
  } else {
    console.log(`Found ${leaves.length} leaves:`);
    console.log(JSON.stringify(leaves, null, 2));
  }
}

run().catch(console.error);
