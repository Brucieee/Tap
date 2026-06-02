-- Migration SQL: Add WFH Offsets support to user_profiles
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS wfh_offsets JSONB DEFAULT '{}'::jsonb;
