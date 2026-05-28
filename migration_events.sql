-- Migration SQL: Add Role and Create Company Events Table

-- 1. Add role column to user_profiles if it doesn't exist
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 2. Create company_events table
CREATE TABLE IF NOT EXISTS public.company_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    date DATE NOT NULL UNIQUE,
    login_time TIME WITHOUT TIME ZONE DEFAULT '08:00:00',
    logout_time TIME WITHOUT TIME ZONE DEFAULT '12:00:00',
    excluded_users UUID[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Enable Row Level Security (RLS) on company_events
ALTER TABLE public.company_events ENABLE ROW LEVEL SECURITY;

-- 4. Re-create helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.user_profiles 
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create security policies for company_events
DROP POLICY IF EXISTS "Allow authenticated users to view company events" ON public.company_events;
CREATE POLICY "Allow authenticated users to view company events" 
    ON public.company_events 
    FOR SELECT 
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow admins to insert company events" ON public.company_events;
CREATE POLICY "Allow admins to insert company events" 
    ON public.company_events 
    FOR INSERT 
    TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to update company events" ON public.company_events;
CREATE POLICY "Allow admins to update company events" 
    ON public.company_events 
    FOR UPDATE 
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Allow admins to delete company events" ON public.company_events;
CREATE POLICY "Allow admins to delete company events" 
    ON public.company_events 
    FOR DELETE 
    TO authenticated
    USING (public.is_admin());

-- 6. Add excluded_users column to company_events if table already exists
ALTER TABLE public.company_events ADD COLUMN IF NOT EXISTS excluded_users UUID[] DEFAULT '{}';

