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

  console.log('--- Fetching Timelog History for 2026-06-04 ---');
  const { data: logs, error } = await supabase
    .from('timelog_history')
    .select('*')
    .eq('date', '2026-06-04');

  if (error) {
    console.error('Error fetching logs:', error);
    return;
  }

  console.log(`Found ${logs.length} logs for today.`);

  // Find logs that were accidentally created today due to test=true
  // Specifically for: john_lopez@cocogen.com (9f91acc5-9ede-4e37-89f8-5b563ee75464)
  // and albi_saribay@cocogen.com (f6730051-458a-4bec-a824-b519deb83ae4)
  const targetUserIds = [
    '9f91acc5-9ede-4e37-89f8-5b563ee75464',
    'f6730051-458a-4bec-a824-b519deb83ae4'
  ];

  const accidentalLogs = logs.filter(l => targetUserIds.includes(l.user_id));
  console.log(`Found ${accidentalLogs.length} accidental logs to clean up.`);

  for (const log of accidentalLogs) {
    console.log(`Deleting log ID: ${log.id} for User ID: ${log.user_id}`);
    const { error: deleteError } = await supabase
      .from('timelog_history')
      .delete()
      .eq('id', log.id);

    if (deleteError) {
      console.error(`Failed to delete log ${log.id}:`, deleteError);
    } else {
      console.log(`Successfully deleted log ${log.id}!`);
    }
  }
}

run().catch(console.error);
