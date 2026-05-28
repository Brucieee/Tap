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
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const userClient = createClient(supabaseUrl, anonKey);

async function run() {
  const testEmail = `test_admin_temp_${Date.now()}@cocogen.com`;
  const testPassword = 'TempPassword123!';
  let userId = null;

  try {
    console.log(`[Test] Creating temporary admin user: ${testEmail}`);
    
    // 1. Create the auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    userId = authData.user.id;
    console.log(`[Test] Created auth user with ID: ${userId}`);

    // 2. Update user_profile to set role = 'admin'
    console.log(`[Test] Updating user profile role = 'admin'`);
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .update({
        role: 'admin',
        employee_id: 'test-emp-id',
        wfh_days: ['Monday'],
        login_time: '08:00:00',
        logout_time: '17:00:00',
        is_automation_enabled: true
      })
      .eq('id', userId);

    if (profileError) {
      throw new Error(`Failed to create user profile: ${profileError.message}`);
    }

    // 3. Log in as the temporary admin user using the anon client
    console.log(`[Test] Logging in as temporary admin user...`);
    const { data: sessionData, error: loginError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (loginError) {
      throw new Error(`Login failed: ${loginError.message}`);
    }

    const authedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`
        }
      }
    });

    // 4. Try to insert into company_events
    console.log(`[Test] Attempting to insert event into company_events under RLS...`);
    const { data: eventData, error: insertError } = await authedClient
      .from('company_events')
      .insert({
        title: 'RLS Test Event',
        date: '2099-12-31',
        login_time: '08:00:00',
        logout_time: '12:00:00',
        excluded_users: []
      })
      .select();

    if (insertError) {
      console.error(`[Failure] RLS INSERT failed: ${insertError.message}`);
    } else {
      console.log(`[Success] RLS INSERT succeeded!`, eventData);
    }

    // 5. Try to update company_events
    if (!insertError) {
      console.log(`[Test] Attempting to update event under RLS...`);
      const { data: updateData, error: updateError } = await authedClient
        .from('company_events')
        .update({ title: 'RLS Test Event Updated' })
        .eq('date', '2099-12-31')
        .select();

      if (updateError) {
        console.error(`[Failure] RLS UPDATE failed: ${updateError.message}`);
      } else {
        console.log(`[Success] RLS UPDATE succeeded!`, updateData);
      }

      // 6. Clean up company event
      console.log(`[Test] Cleaning up company event...`);
      const { error: deleteEventError } = await authedClient
        .from('company_events')
        .delete()
        .eq('date', '2099-12-31');

      if (deleteEventError) {
        console.error(`[Failure] RLS DELETE failed: ${deleteEventError.message}`);
      } else {
        console.log(`[Success] RLS DELETE succeeded!`);
      }
    }

  } catch (err) {
    console.error(`[Error] Test execution failed:`, err.message);
  } finally {
    // 7. Cleanup Auth User & Profile
    if (userId) {
      console.log(`[Test] Cleaning up temporary user profile and auth user...`);
      await adminClient.from('user_profiles').delete().eq('id', userId);
      await adminClient.auth.admin.deleteUser(userId);
      console.log(`[Test] Cleanup completed.`);
    }
  }
}

run();
