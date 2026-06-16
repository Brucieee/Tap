import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { encrypt, decrypt } from '@/utils/encryption';

export const dynamic = 'force-dynamic';

// GET: Fetch user profile and decrypt credentials on the server
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    // Retrieve profile from database
    const { data: profile, error: dbError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError) {
      // If profile does not exist yet, return empty default schema
      if (dbError.code === 'PGRST116') {
        return NextResponse.json({
          id: user.id,
          employee_id: '',
          company_password: '',
          myportal_employee_id: '',
          myportal_password: '',
          wfh_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          login_time: '08:00:00',
          logout_time: '17:00:00',
          is_automation_enabled: true,
          wfh_reason: 'Work from home',
          role: 'user',
          wfh_offsets: {}
        });
      }
      return NextResponse.json({ error: 'Database query failed.', details: dbError.message }, { status: 500 });
    }

    // Decrypt credentials safely on the server before sending to client
    const decryptedEmployeeId = profile.employee_id ? decrypt(profile.employee_id) : '';
    const decryptedPassword = profile.company_password ? decrypt(profile.company_password) : '';
    const decryptedMyportalEmployeeId = profile.myportal_employee_id ? decrypt(profile.myportal_employee_id) : '';
    const decryptedMyportalPassword = profile.myportal_password ? decrypt(profile.myportal_password) : '';

    return NextResponse.json({
      ...profile,
      employee_id: decryptedEmployeeId,
      company_password: decryptedPassword,
      myportal_employee_id: decryptedMyportalEmployeeId,
      myportal_password: decryptedMyportalPassword
    });

  } catch (error: any) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Save profile data after encrypting credentials on the server
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      employee_id,
      company_password,
      myportal_employee_id,
      myportal_password,
      wfh_days,
      login_time,
      logout_time,
      is_automation_enabled,
      wfh_reason,
      wfh_offsets
    } = body;

    // Encrypt the credentials
    const encryptedEmployeeId = employee_id ? encrypt(employee_id) : null;
    const encryptedPassword = company_password ? encrypt(company_password) : null;
    const encryptedMyportalEmployeeId = myportal_employee_id ? encrypt(myportal_employee_id) : null;
    const encryptedMyportalPassword = myportal_password ? encrypt(myportal_password) : null;

    // Fetch existing profile to preserve password if the user didn't modify it
    let finalPassword = encryptedPassword;
    let finalMyportalPassword = encryptedMyportalPassword;
    
    if (company_password === '__PRESERVED_PASSWORD__' || myportal_password === '__PRESERVED_PASSWORD__') {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('company_password, myportal_password')
        .eq('id', user.id)
        .single();
      
      if (company_password === '__PRESERVED_PASSWORD__') {
        finalPassword = existingProfile?.company_password || null;
      }
      if (myportal_password === '__PRESERVED_PASSWORD__') {
        finalMyportalPassword = existingProfile?.myportal_password || null;
      }
    }

    // Upsert into Supabase user_profiles table
    const { error: upsertError } = await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        employee_id: encryptedEmployeeId,
        company_password: finalPassword,
        myportal_employee_id: encryptedMyportalEmployeeId,
        myportal_password: finalMyportalPassword,
        wfh_days: wfh_days || [],
        login_time: login_time || '08:00:00',
        logout_time: logout_time || '17:00:00',
        is_automation_enabled: is_automation_enabled !== undefined ? is_automation_enabled : true,
        wfh_reason: wfh_reason || 'Work from home',
        wfh_offsets: wfh_offsets || {}
      });

    if (upsertError) {
      return NextResponse.json({ error: 'Failed to save settings.', details: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Configuration saved and encrypted successfully.' });

  } catch (error: any) {
    console.error('Profile save error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
