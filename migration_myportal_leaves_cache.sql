-- Create myportal_leaves_cache table to speed up dashboard loads
CREATE TABLE IF NOT EXISTS public.myportal_leaves_cache (
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE PRIMARY KEY,
    leaves JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.myportal_leaves_cache ENABLE ROW LEVEL SECURITY;

-- Select policy
DROP POLICY IF EXISTS "Users can view their own myportal leaves cache" ON public.myportal_leaves_cache;
CREATE POLICY "Users can view their own myportal leaves cache" 
    ON public.myportal_leaves_cache 
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Insert policy
DROP POLICY IF EXISTS "Users can insert their own myportal leaves cache" ON public.myportal_leaves_cache;
CREATE POLICY "Users can insert their own myportal leaves cache" 
    ON public.myportal_leaves_cache 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Update policy
DROP POLICY IF EXISTS "Users can update their own myportal leaves cache" ON public.myportal_leaves_cache;
CREATE POLICY "Users can update their own myportal leaves cache" 
    ON public.myportal_leaves_cache 
    FOR UPDATE 
    USING (auth.uid() = user_id);
