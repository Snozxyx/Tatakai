-- Security improvements: Enhanced RLS and access control

-- Add rate limiting table for tracking API usage
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address inet,
  endpoint text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint, window_start),
  UNIQUE(ip_address, endpoint, window_start)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON public.rate_limits(user_id, endpoint, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON public.rate_limits(ip_address, endpoint, window_start DESC);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only system can read rate limits
CREATE POLICY "System can manage rate limits" ON public.rate_limits
  FOR ALL USING (false); -- Only accessible via service role

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_ip_address inet,
  p_endpoint text,
  p_limit integer DEFAULT 100,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  -- Calculate window start
  v_window_start := date_trunc('second', now() - (p_window_seconds || ' seconds')::interval);
  
  -- Check existing count
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM public.rate_limits
  WHERE (
    (p_user_id IS NOT NULL AND user_id = p_user_id) OR
    (p_ip_address IS NOT NULL AND ip_address = p_ip_address)
  )
  AND endpoint = p_endpoint
  AND window_start >= v_window_start;
  
  -- If limit exceeded, return false
  IF v_count >= p_limit THEN
    RETURN false;
  END IF;
  
  -- Increment or create rate limit record
  INSERT INTO public.rate_limits (user_id, ip_address, endpoint, request_count, window_start)
  VALUES (p_user_id, p_ip_address, p_endpoint, 1, date_trunc('second', now()))
  ON CONFLICT (COALESCE(user_id::text, ''), endpoint, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1;
  
  -- Clean up old records (older than 1 hour)
  DELETE FROM public.rate_limits
  WHERE window_start < now() - interval '1 hour';
  
  RETURN true;
END;
$$;

-- Enhanced access control function
CREATE OR REPLACE FUNCTION check_resource_access(
  p_user_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_action text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_owner boolean := false;
  v_is_admin boolean := false;
  v_is_moderator boolean := false;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_user_id AND is_admin = true
  ) INTO v_is_admin;
  
  -- Check if user is moderator
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'moderator'
  ) INTO v_is_moderator;
  
  -- Admins and moderators have full access
  IF v_is_admin OR v_is_moderator THEN
    RETURN true;
  END IF;
  
  -- Check ownership based on resource type
  CASE p_resource_type
    WHEN 'playlist' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.playlists
        WHERE id = p_resource_id AND user_id = p_user_id
      ) INTO v_is_owner;
      
      -- Also check if user is collaborator
      IF NOT v_is_owner THEN
        SELECT EXISTS (
          SELECT 1 FROM public.playlist_collaborators
          WHERE playlist_id = p_resource_id
          AND user_id = p_user_id
          AND role IN ('editor', 'admin')
        ) INTO v_is_owner;
      END IF;
      
    WHEN 'tier_list' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.tier_lists
        WHERE id = p_resource_id AND user_id = p_user_id
      ) INTO v_is_owner;
      
    WHEN 'comment' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.comments
        WHERE id = p_resource_id AND user_id = p_user_id
      ) INTO v_is_owner;
      
    WHEN 'forum_post' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.forum_posts
        WHERE id = p_resource_id AND user_id = p_user_id
      ) INTO v_is_owner;
      
    ELSE
      RETURN false;
  END CASE;
  
  -- Owner can do anything
  IF v_is_owner THEN
    RETURN true;
  END IF;
  
  -- For read actions, check if resource is public
  IF p_action = 'read' THEN
    CASE p_resource_type
      WHEN 'playlist' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.playlists
          WHERE id = p_resource_id AND is_public = true
        ) INTO v_is_owner;
        
      WHEN 'tier_list' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.tier_lists
          WHERE id = p_resource_id AND is_public = true
        ) INTO v_is_owner;
        
      ELSE
        -- Comments and posts are always readable
        RETURN true;
    END CASE;
  END IF;
  
  RETURN v_is_owner;
END;
$$;

-- Add audit logging for sensitive actions
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  resource_type text,
  resource_id uuid,
  ip_address inet,
  user_agent text,
  success boolean DEFAULT true,
  error_message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_user ON public.security_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_action ON public.security_audit_log(action, created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs" ON public.security_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
  p_user_id uuid,
  p_action text,
  p_resource_type text DEFAULT NULL,
  p_resource_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    ip_address,
    user_agent,
    success,
    error_message,
    metadata
  ) VALUES (
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_ip_address,
    p_user_agent,
    p_success,
    p_error_message,
    p_metadata
  );
END;
$$;
