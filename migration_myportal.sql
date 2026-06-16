-- Migration SQL: Add MyPortal Credentials support to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS myportal_employee_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS myportal_password TEXT;
