import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createStandlyAdminClient } from '@/utils/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Authenticate user session in Tap
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    const standlySupabase = createStandlyAdminClient();

    // 1. Fetch holidays
    const { data: holidays, error: holidaysError } = await standlySupabase
      .from('holidays')
      .select('*')
      .order('date', { ascending: true });

    if (holidaysError) {
      console.error('Error fetching Standly holidays:', holidaysError);
    }

    // 2. Fetch Standly profile matching the user's email
    const { data: profile, error: profileError } = await standlySupabase
      .from('profiles')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching Standly profile:', profileError);
    }

    let leaves = [];
    if (profile) {
      // 3. Fetch leaves for this profile
      const { data: leavesData, error: leavesError } = await standlySupabase
        .from('leaves')
        .select('*')
        .eq('user_id', profile.id)
        .order('start_date', { ascending: true });

      if (leavesError) {
        console.error('Error fetching Standly leaves:', leavesError);
      } else {
        leaves = leavesData || [];
      }
    }

    return NextResponse.json({
      holidays: holidays || [],
      leaves: leaves
    });

  } catch (error: any) {
    console.error('Failed to fetch Standly info:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
