import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

    // Today's date in local time
    const today = new Date().toLocaleDateString('en-CA'); // 'YYYY-MM-DD'

    // Fetch today's logs
    const { data: logs } = await supabase.from('timelog_history').select('mode').eq('date', today);
    
    // Fetch total active automated users
    const { count: activeUsers } = await supabase.from('user_profiles').select('*', { count: 'exact', head: true }).eq('is_automation_enabled', true);

    const logins = logs?.filter(l => l.mode === 'login').length || 0;
    const logouts = logs?.filter(l => l.mode === 'logout').length || 0;

    return NextResponse.json({
      todayLogins: logins,
      todayLogouts: logouts,
      activeAutomatedUsers: activeUsers || 0,
      todayDate: today
    });
  } catch (err) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
