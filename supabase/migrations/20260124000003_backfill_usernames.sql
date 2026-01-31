-- Migration to backfill usernames for existing users
-- This will take the display_name or email and append a random suffix for uniqueness

DO $$
DECLARE
    user_record RECORD;
    base_username TEXT;
    final_username TEXT;
    rand_suffix TEXT;
BEGIN
    FOR user_record IN SELECT user_id, display_name, (SELECT email FROM auth.users WHERE id = user_id) as email FROM public.profiles WHERE username IS NULL OR username = 'null' LOOP
        
        -- Generate base username from display_name or email
        IF user_record.display_name IS NOT NULL AND user_record.display_name != '' THEN
            base_username := lower(regexp_replace(user_record.display_name, '[^a-zA-Z0-9]', '', 'g'));
        ELSE
            base_username := lower(split_part(user_record.email, '@', 1));
            base_username := regexp_replace(base_username, '[^a-zA-Z0-9]', '', 'g');
        END IF;

        -- Ensure it's at least 3 chars
        IF length(base_username) < 3 THEN
            base_username := base_username || 'user';
        END IF;

        final_username := base_username;

        -- Check for uniqueness and add random suffix if needed
        WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
            rand_suffix := floor(random() * 9000 + 1000)::text;
            final_username := base_username || rand_suffix;
        END WHILE;

        -- Update the profile
        UPDATE public.profiles 
        SET username = final_username 
        WHERE user_id = user_record.user_id;

    END LOOP;
END $$;
