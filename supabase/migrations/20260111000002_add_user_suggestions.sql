-- User Suggestions System
-- Allows users to submit suggestions and admins to review them

CREATE TABLE IF NOT EXISTS public.user_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL CHECK (category IN ('feature', 'bug', 'improvement', 'content', 'other')),
    priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'rejected', 'implemented')),
    admin_notes text,
    reviewed_by uuid REFERENCES auth.users(id),
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_suggestions_user_id ON public.user_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_suggestions_status ON public.user_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_user_suggestions_category ON public.user_suggestions(category);
CREATE INDEX IF NOT EXISTS idx_user_suggestions_created_at ON public.user_suggestions(created_at DESC);

-- Enable RLS
ALTER TABLE public.user_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own suggestions
DROP POLICY IF EXISTS "Users can view own suggestions" ON public.user_suggestions;
CREATE POLICY "Users can view own suggestions"
ON public.user_suggestions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own suggestions
DROP POLICY IF EXISTS "Users can insert own suggestions" ON public.user_suggestions;
CREATE POLICY "Users can insert own suggestions"
ON public.user_suggestions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own pending suggestions
DROP POLICY IF EXISTS "Users can update own pending suggestions" ON public.user_suggestions;
CREATE POLICY "Users can update own pending suggestions"
ON public.user_suggestions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Admins can view all suggestions
DROP POLICY IF EXISTS "Admins can view all suggestions" ON public.user_suggestions;
CREATE POLICY "Admins can view all suggestions"
ON public.user_suggestions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Admins can update any suggestion
DROP POLICY IF EXISTS "Admins can update any suggestion" ON public.user_suggestions;
CREATE POLICY "Admins can update any suggestion"
ON public.user_suggestions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Admins can delete suggestions
DROP POLICY IF EXISTS "Admins can delete suggestions" ON public.user_suggestions;
CREATE POLICY "Admins can delete suggestions"
ON public.user_suggestions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_admin = true
  )
);

-- Comments
COMMENT ON TABLE public.user_suggestions IS 'User-submitted suggestions for features, improvements, and bug reports';
COMMENT ON COLUMN public.user_suggestions.category IS 'Type of suggestion: feature, bug, improvement, content, or other';
COMMENT ON COLUMN public.user_suggestions.status IS 'Current status: pending, reviewing, approved, rejected, or implemented';
COMMENT ON COLUMN public.user_suggestions.priority IS 'Priority level: low, normal, high, or urgent';
