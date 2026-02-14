-- Trigger to automatically create a username for new users if not provided
-- Derived from display_name or email prefix

CREATE OR REPLACE FUNCTION public.handle_new_user_username()
RETURNS TRIGGER AS $$
DECLARE
    base_username TEXT;
    final_username TEXT;
    rand_suffix TEXT;
BEGIN
    -- Only run if username is null
    IF NEW.username IS NULL OR NEW.username = 'null' THEN
        -- Generate base username from display_name or email prefix
        IF NEW.display_name IS NOT NULL AND NEW.display_name != '' THEN
            base_username := lower(regexp_replace(NEW.display_name, '[^a-zA-Z0-9]', '', 'g'));
        ELSE
            -- Try to get email prefix if available
            -- Note: For new profiles created by trigger on auth.users, we might not have email in profiles yet
            -- so we use a fallback
            base_username := 'user';
        END IF;

        -- Ensure it's at least 3 chars
        IF length(base_username) < 3 THEN
            base_username := base_username || 'fan';
        END IF;

        final_username := base_username;

        -- Check for uniqueness and add random suffix if needed
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
            rand_suffix := floor(random() * 9000 + 1000)::text;
            final_username := base_username || rand_suffix;
        END WHILE;

        NEW.username := final_username;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to profiles
DROP TRIGGER IF EXISTS on_profile_created_username ON public.profiles;
CREATE TRIGGER on_profile_created_username
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user_username();
