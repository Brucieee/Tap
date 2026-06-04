const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

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
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: authData, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error fetching auth users:', error);
  } else {
    console.log('Tap Auth Users:');
    console.log(authData.users.map(u => ({ id: u.id, email: u.email })));
  }
}

run().catch(console.error);
