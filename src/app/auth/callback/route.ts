import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      
      console.error('Auth callback exchange error:', error);
    } catch (err) {
      console.error('Auth callback unhandled error:', err);
    }
  }

  // On failure, redirect back to login page with query warning
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate session. Please try manually.`);
}
