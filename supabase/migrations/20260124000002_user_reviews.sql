-- Add user reviews table
CREATE TABLE IF NOT EXISTS public.user_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    rating integer CHECK (rating >= 1 AND rating <= 5),
    feedback text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reviews" ON public.user_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view reviews" ON public.user_reviews FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
