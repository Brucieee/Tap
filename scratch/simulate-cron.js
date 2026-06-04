const fs = require('fs');
const crypto = require('crypto');
const playwright = require('playwright');
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

const getMasterKey = () => {
  const key = env.ENCRYPTION_KEY;
  const keySource = key || 'default-development-fallback-key-must-be-32-bytes';
  return crypto.createHash('sha256').update(keySource).digest();
};

function decrypt(encryptedText) {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format. Expected iv:ciphertext');
    }
    const [ivHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getMasterKey(), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

async function run() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const standlyDbUrl = env.STANDLY_PUBLIC_SUPABASE_URL;
  const standlyDbKey = env.STANDLY_SUPABASE_SRK;
  const standlyClient = createClient(standlyDbUrl, standlyDbKey);

  // Setup evaluation constants: June 4, 2026 is a Thursday
  const currentDate = '2026-06-04';
  const currentDay = 'Thursday';
  const currentPhtHour = 8;
  const modeParam = 'login';
  const modeText = 'Log In';

  console.log(`[Simulation] Date: ${currentDate} | Day: ${currentDay} | Hour: ${currentPhtHour} | Mode: ${modeParam}`);

  // 1. Fetch Tap auth users for email mapping
  const tapUserEmails = new Map();
  const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers();
  if (authUsersError) {
    console.error('Error listing auth users:', authUsersError);
  } else {
    authUsers.users.forEach(u => {
      if (u.email) tapUserEmails.set(u.id, u.email.toLowerCase());
    });
  }

  // 2. Fetch Standly database details
  const { data: holidays } = await standlyClient.from('holidays').select('*');
  const { data: standlyProfiles } = await standlyClient.from('profiles').select('id, email');
  const { data: standlyLeaves } = await standlyClient.from('leaves').select('*');

  // 3. Fetch active Tap profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('is_automation_enabled', true);

  if (profilesError) {
    console.error('Error fetching user profiles:', profilesError);
    return;
  }

  console.log(`Found ${profiles.length} active profiles.`);

  for (const profile of profiles) {
    const userId = profile.id;
    const userEmailStr = tapUserEmails.get(userId);
    console.log(`\nEvaluating User ID: ${userId} (${userEmailStr || 'No Email'})`);

    // Check Standly Leave skip
    let isUserOnLeave = false;
    let leaveReason = '';
    
    if (userEmailStr && standlyProfiles && standlyLeaves) {
      const standlyProfile = standlyProfiles.find(
        p => p.email && p.email.toLowerCase() === userEmailStr.toLowerCase()
      );
      
      if (standlyProfile) {
        const userLeave = standlyLeaves.find(l => {
          if (l.user_id !== standlyProfile.id) return false;
          const isDateMatched = currentDate >= l.start_date && currentDate <= l.end_date;
          if (!isDateMatched) return false;

          if (l.start_time && l.end_time) {
            if (modeParam === 'login') {
              return l.start_time < '12:00:00';
            } else {
              return l.end_time > '12:00:00';
            }
          }
          return true;
        });
        
        if (userLeave) {
          isUserOnLeave = true;
          leaveReason = userLeave.reason || userLeave.type || 'On leave';
        }
      }
    }

    if (isUserOnLeave) {
      console.log(`-> SKIPPED: User is on leave [${leaveReason}].`);
      continue;
    }

    // Check WFH schedule match
    const offsets = profile.wfh_offsets || {};
    const offsetOverride = offsets[currentDate];
    let isWfhDay = false;
    let wfhReasonText = '';
    const resolvedStatus = offsetOverride 
      ? (typeof offsetOverride === 'object' ? offsetOverride.status : offsetOverride)
      : null;

    if (resolvedStatus === 'wfh') {
      isWfhDay = true;
      wfhReasonText = 'Offset WFH override';
    } else if (resolvedStatus === 'office') {
      isWfhDay = false;
      wfhReasonText = 'Offset Office override';
    } else {
      const wfhDays = profile.wfh_days || [];
      isWfhDay = wfhDays.some(day => day.toLowerCase() === currentDay.toLowerCase());
      wfhReasonText = `Today (${currentDay}) is not in WFH schedule [${wfhDays.join(', ')}]`;
    }

    if (!isWfhDay) {
      console.log(`-> SKIPPED: ${wfhReasonText}`);
      continue;
    }

    // Check dynamic hourly schedule
    const timeToInject = modeParam === 'login' ? (profile.login_time || '08:00:00') : (profile.logout_time || '17:00:00');
    const configuredHour = parseInt(timeToInject.split(':')[0], 10);
    if (configuredHour !== currentPhtHour) {
      console.log(`-> SKIPPED: Configured hour (${configuredHour}) !== current PHT hour (${currentPhtHour})`);
      continue;
    }

    console.log(`-> MATCHED! Would run login automation for Employee ID: ${decrypt(profile.employee_id)} at configured time ${timeToInject}`);
  }
}

run().catch(console.error);
