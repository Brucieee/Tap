-- Create user_profiles table linked to Supabase auth.users
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    employee_id TEXT, -- Encrypted AES-256 string
    company_password TEXT, -- Encrypted AES-256 string
    myportal_employee_id TEXT, -- Encrypted AES-256 string for MyPortal
    myportal_password TEXT, -- Encrypted AES-256 string for MyPortal
    wfh_days TEXT[] DEFAULT '{}', -- Array of days, e.g., ['Monday', 'Wednesday', 'Friday']
    login_time TIME WITHOUT TIME ZONE DEFAULT '08:00:00',
    logout_time TIME WITHOUT TIME ZONE DEFAULT '17:00:00',
    is_automation_enabled BOOLEAN DEFAULT TRUE,
    wfh_reason TEXT DEFAULT 'Work from home',
    wfh_offsets JSONB DEFAULT '{}'::jsonb,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Schema Migration: Run this if your user_profiles table already exists to add the columns:
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS wfh_reason TEXT DEFAULT 'Work from home';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS wfh_offsets JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS myportal_employee_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS myportal_password TEXT;

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for row level security
-- 1. Enable select for users on their own profile
DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
CREATE POLICY "Users can view their own profile" 
    ON public.user_profiles 
    FOR SELECT 
    USING (auth.uid() = id);

-- 2. Enable insert for users on their own profile
DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;
CREATE POLICY "Users can create their own profile" 
    ON public.user_profiles 
    FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- 3. Enable update for users on their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
CREATE POLICY "Users can update their own profile" 
    ON public.user_profiles 
    FOR UPDATE 
    USING (auth.uid() = id);

-- 4. Enable delete for users on their own profile
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.user_profiles;
CREATE POLICY "Users can delete their own profile" 
    ON public.user_profiles 
    FOR DELETE 
    USING (auth.uid() = id);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_user_profile_updated ON public.user_profiles;
CREATE TRIGGER on_user_profile_updated
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Automatically create a profile row when a new user registers via Supabase auth (optional but highly recommended for smooth UX)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, wfh_days, login_time, logout_time, is_automation_enabled, wfh_reason)
    VALUES (
        NEW.id,
        ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], -- Default to all weekdays WFH
        '08:00:00',
        '17:00:00',
        TRUE,
        'Work from home'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger the handle_new_user function when a user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 5. Create timelog_history table to prevent double submissions
CREATE TABLE IF NOT EXISTS public.timelog_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    employee_id TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'login' or 'logout'
    date DATE NOT NULL, -- format YYYY-MM-DD
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, date, mode)
);

-- Enable RLS
ALTER TABLE public.timelog_history ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "Users can view their own timelog history" ON public.timelog_history;
CREATE POLICY "Users can view their own timelog history" 
    ON public.timelog_history 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Insert policy
DROP POLICY IF EXISTS "Users can create their own timelog history" ON public.timelog_history;
CREATE POLICY "Users can create their own timelog history" 
    ON public.timelog_history 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 6. Create portal_logs_cache table to speed up dashboard loads
CREATE TABLE IF NOT EXISTS public.portal_logs_cache (
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE PRIMARY KEY,
    logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.portal_logs_cache ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "Users can view their own portal logs cache" ON public.portal_logs_cache;
CREATE POLICY "Users can view their own portal logs cache" 
    ON public.portal_logs_cache 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Insert policy
DROP POLICY IF EXISTS "Users can insert their own portal logs cache" ON public.portal_logs_cache;
CREATE POLICY "Users can insert their own portal logs cache" 
    ON public.portal_logs_cache 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Update policy
DROP POLICY IF EXISTS "Users can update their own portal logs cache" ON public.portal_logs_cache;
CREATE POLICY "Users can update their own portal logs cache" 
    ON public.portal_logs_cache 
    FOR UPDATE 
    USING (auth.uid() = user_id);


