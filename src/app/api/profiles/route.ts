import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

// GET: Fetch all profiles (restricted to Admin users)
export async function GET() {
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

    // Retrieve all users from Auth using the Admin Client
    const adminClient = createAdminClient();
    const { data: authData, error: authUsersError } = await adminClient.auth.admin.listUsers();
    
    if (authUsersError) {
      console.error('Failed to list auth users:', authUsersError);
      return NextResponse.json({ error: 'Failed to retrieve employees list.', details: authUsersError.message }, { status: 500 });
    }

    // Map profiles
    const employees = (authData?.users || []).map((u: any) => ({
      id: u.id,
      email: u.email || 'Unknown User'
    }));

    // Sort by email
    employees.sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json(employees);

  } catch (error: any) {
    console.error('Profiles list fetch error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
