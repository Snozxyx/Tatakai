-- Add admin role for gabhastigirisinha@gmail.com
-- This migration adds the admin role to the specified user

DO $$
DECLARE
    target_user_id uuid;
    existing_role_count integer;
BEGIN
    -- Find the user by email
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE email = 'gabhastigirisinha@gmail.com';
    
    IF target_user_id IS NOT NULL THEN
        -- Check if user already has a role
        SELECT COUNT(*) INTO existing_role_count
        FROM public.user_roles
        WHERE user_id = target_user_id;
        
        IF existing_role_count > 0 THEN
            -- Update existing role to admin
            UPDATE public.user_roles
            SET role = 'admin'
            WHERE user_id = target_user_id;
            RAISE NOTICE 'Updated existing role to admin for gabhastigirisinha@gmail.com (user_id: %)', target_user_id;
        ELSE
            -- Insert new admin role
            INSERT INTO public.user_roles (user_id, role)
            VALUES (target_user_id, 'admin');
            RAISE NOTICE 'Admin role granted to gabhastigirisinha@gmail.com (user_id: %)', target_user_id;
        END IF;
    ELSE
        RAISE NOTICE 'User gabhastigirisinha@gmail.com not found. They need to sign up first.';
    END IF;
END $$;
