import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { decrypt } from '@/utils/encryption';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    // Verify user role is admin
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden. Admin privileges required.' }, { status: 403 });
    }

    // Retrieve all users from Auth using the Admin Client to map emails
    const adminClient = createAdminClient();
    
    // Retrieve all logs using the admin client to bypass Row Level Security (RLS)
    const { data: logs, error: logsError } = await adminClient
      .from('timelog_history')
      .select('*')
      .order('created_at', { ascending: false });

    if (logsError) {
      return NextResponse.json({ error: 'Failed to retrieve logs.', details: logsError.message }, { status: 500 });
    }

    const { data: authData, error: authUsersError } = await adminClient.auth.admin.listUsers();
    
    if (authUsersError) {
      console.error('Failed to list auth users:', authUsersError);
      return NextResponse.json({ error: 'Failed to retrieve employees list.', details: authUsersError.message }, { status: 500 });
    }

    const userEmailMap: Record<string, string> = {};
    if (authData?.users) {
      authData.users.forEach((u: any) => {
        userEmailMap[u.id] = u.email || 'Unknown User';
      });
    }

    const formattedLogs = logs.map(log => {
      let decryptedEmpId = log.employee_id;
      try {
        if (log.employee_id && log.employee_id.length > 10) {
          decryptedEmpId = decrypt(log.employee_id);
        }
      } catch (err) {
        // Fallback to raw string if it is already decrypted or fails to decrypt
      }
      return {
        ...log,
        employee_id: decryptedEmpId,
        email: userEmailMap[log.user_id] || 'Unknown User'
      };
    });

    return NextResponse.json(formattedLogs);
  } catch (error: any) {
    console.error('Logs fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
