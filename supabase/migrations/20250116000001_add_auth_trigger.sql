-- Add the missing trigger to create profiles when users sign up
-- This trigger calls handle_new_user() when a new user is created in auth.users

-- First, drop the trigger if it exists (to avoid duplicates)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger that fires after a new user is inserted into auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON public.profiles TO supabase_auth_admin;
GRANT ALL ON public.user_roles TO supabase_auth_admin;

-- Backfill: Create profiles for any existing auth users who don't have profiles
INSERT INTO public.profiles (user_id, display_name, avatar_url)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data ->> 'display_name', au.raw_user_meta_data ->> 'full_name', split_part(au.email, '@', 1)),
  COALESCE(au.raw_user_meta_data ->> 'avatar_url', NULL)
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.user_id = au.id
);

-- Backfill: Create user_roles for any existing auth users who don't have roles
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'user'::public.app_role
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id
);
