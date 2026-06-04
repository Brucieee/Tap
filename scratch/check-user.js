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
  const userId = 'e3b73dad-0162-4137-a670-d9f0114d574c';
  const currentDate = '2026-06-04';
  
  try {
    console.log(`Checking user: ${userId}`);
    const { data: profile, error: profileError } = await adminClient
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
      
    if (profileError) {
      console.error('Profile query error:', profileError);
    } else {
      console.log('User profile:', JSON.stringify(profile, null, 2));
    }
    
    // Get Auth user details to find email
    const { data: authUser, error: authUserError } = await adminClient.auth.admin.getUserById(userId);
    if (authUserError) {
      console.error('Auth user query error:', authUserError);
    } else {
      console.log('Auth user email:', authUser.user.email);
    }
    
    console.log('\nChecking history for today:', currentDate);
    const { data: history, error: historyError } = await adminClient
      .from('timelog_history')
      .select('*')
      .eq('user_id', userId)
      .eq('date', currentDate);
      
    if (historyError) {
      console.error('History query error:', historyError);
    } else {
      console.log('Timelog history for today:', JSON.stringify(history, null, 2));
    }

    console.log('\nChecking holidays for today:', currentDate);
    const standlyDbUrl = env.STANDLY_PUBLIC_SUPABASE_URL;
    const standlyDbKey = env.STANDLY_SUPABASE_SRK;
    console.log('Standly DB Config:', {
      hasUrl: !!standlyDbUrl,
      hasKey: !!standlyDbKey
    });
    
    const standlyClient = createClient(standlyDbUrl, standlyDbKey);
    
    const { data: holidays, error: holidaysError } = await standlyClient
      .from('holidays')
      .select('*');
      
    if (holidaysError) {
      console.error('Holidays query error:', holidaysError);
    } else {
      const todayHolidays = holidays.filter(h => h.date === currentDate);
      console.log('Holidays for today:', JSON.stringify(todayHolidays, null, 2));
    }
    
    // Fetch all Standly profiles to see email mapping
    const { data: standlyProfiles, error: standlyProfilesError } = await standlyClient
      .from('profiles')
      .select('*');
    if (standlyProfilesError) {
      console.error('Standly profiles query error:', standlyProfilesError);
    } else {
      console.log('All Standly profiles:', JSON.stringify(standlyProfiles.map(p => ({ id: p.id, email: p.email, name: p.full_name })), null, 2));
    }

    // Also check leaves in Standly
    const { data: leaves, error: leavesError } = await standlyClient
      .from('leaves')
      .select('*');
      
    if (leavesError) {
      console.error('Leaves query error:', leavesError);
    } else {
      // Find leaves covering today
      const todayLeaves = leaves.filter(l => currentDate >= l.start_date && currentDate <= l.end_date);
      console.log('Leaves covering today:', JSON.stringify(todayLeaves, null, 2));
    }
    
    // Check company events in Tap
    const { data: events, error: eventsError } = await adminClient
      .from('company_events')
      .select('*')
      .eq('date', currentDate);
      
    if (eventsError) {
      console.error('Events query error:', eventsError);
    } else {
      console.log('Company events for today:', JSON.stringify(events, null, 2));
    }

  } catch (err) {
    console.error('Execution error:', err);
  }
}

run();
