-- Tatakai Enhancements Migration
-- 1. AI Recommendation Infrastructure
-- 2. Auto-username generation trigger
-- 3. Profile enhancements

-- ============================================
-- 1. AI RECOMMENDATION INFRASTRUCTURE
-- ============================================

-- Cache for raw AI responses to avoid redundant API calls
CREATE TABLE IF NOT EXISTS public.ai_recommendation_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    query_params jsonb NOT NULL UNIQUE, -- Store the hash or stringified parameters
    result jsonb NOT NULL,
    provider text DEFAULT 'google-gemini',
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Store personalized recommendations for users
CREATE TABLE IF NOT EXISTS public.ai_recommendation_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    anime_ids text[] DEFAULT '{}',
    recommendation_logic text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- 2. PROFILE ENHANCEMENTS
-- ============================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS preferred_theme text DEFAULT 'cherry-blossom';

-- ============================================
-- 3. AUTO-USERNAME GENERATION TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    base_username text;
    final_username text;
    counter integer := 0;
    rand_suffix text;
BEGIN
    -- Get base name from full_name or email
    IF NEW.raw_user_meta_data->>'full_name' IS NOT NULL THEN
        base_username := lower(regexp_replace(NEW.raw_user_meta_data->>'full_name', '[^a-zA-Z0-0]', '', 'g'));
    ELSE
        base_username := lower(split_part(NEW.email, '@', 1));
    END IF;

    -- Ensure base_username is at least 3 chars
    IF length(base_username) < 3 THEN
        base_username := base_username || 'user';
    END IF;

    final_username := base_username;

    -- Check for uniqueness and add random suffix if needed
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
        counter := counter + 1;
        rand_suffix := floor(random() * 9000 + 1000)::text;
        final_username := base_username || rand_suffix;
        
        -- Prevent infinite loop just in case
        IF counter > 10 THEN
            final_username := base_username || extract(epoch from now())::text;
            EXIT;
        END IF;
    END WHILE;

    INSERT INTO public.profiles (user_id, display_name, avatar_url, username)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NULL),
        final_username
    );
  
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';


-- ============================================
-- 4. ALARMS / NOTIFICATIONS SYSTEM (Admin)
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error', 'maintenance')),
    is_broadcast boolean DEFAULT true,
    recipient_id uuid REFERENCES auth.users(id),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================================
-- 5. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_ai_cache_params ON public.ai_recommendation_cache USING gin (query_params);
CREATE INDEX IF NOT EXISTS idx_ai_results_user ON public.ai_recommendation_results(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_recipient ON public.admin_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_broadcast ON public.admin_notifications(is_broadcast) WHERE is_broadcast = true;

-- ============================================
-- 6. RLS POLICIES
-- ============================================

ALTER TABLE public.ai_recommendation_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cache" ON public.ai_recommendation_cache FOR SELECT USING (true);
CREATE POLICY "Admins can manage cache" ON public.ai_recommendation_cache FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own recommendations" ON public.ai_recommendation_results FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "System can manage recommendations" ON public.ai_recommendation_results FOR ALL USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view own notifications or broadcast" ON public.admin_notifications 
FOR SELECT USING (is_broadcast = true OR recipient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage notifications" ON public.admin_notifications FOR ALL USING (public.has_role(auth.uid(), 'admin'));
