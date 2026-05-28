import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

// GET: Fetch all company events (accessible by any logged-in user)
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Authenticate user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized user session.' }, { status: 401 });
    }

    // Retrieve events from database sorted by date
    const { data: events, error: dbError } = await supabase
      .from('company_events')
      .select('*')
      .order('date', { ascending: true });

    if (dbError) {
      return NextResponse.json({ error: 'Database query failed.', details: dbError.message }, { status: 500 });
    }

    return NextResponse.json(events || []);

  } catch (error: any) {
    console.error('Company events GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Add or update a company event (restricted to Admin users)
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { title, date, login_time, logout_time, excluded_users } = body;

    if (!title || !date) {
      return NextResponse.json({ error: 'Title and Date are required.' }, { status: 400 });
    }

    // Clean up times
    const cleanLogin = login_time ? (login_time.length === 5 ? `${login_time}:00` : login_time) : '08:00:00';
    const cleanLogout = logout_time ? (logout_time.length === 5 ? `${logout_time}:00` : logout_time) : '12:00:00';

    // Upsert the event matching by date
    const { data, error: upsertError } = await supabase
      .from('company_events')
      .upsert({
        title,
        date,
        login_time: cleanLogin,
        logout_time: cleanLogout,
        excluded_users: excluded_users || []
      }, { onConflict: 'date' })
      .select();

    if (upsertError) {
      return NextResponse.json({ error: 'Failed to save event.', details: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Company event saved successfully.', event: data?.[0] });

  } catch (error: any) {
    console.error('Company events POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE: Remove a company event (restricted to Admin users)
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required for deletion.' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('company_events')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete event.', details: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Company event deleted successfully.' });

  } catch (error: any) {
    console.error('Company events DELETE error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
