-- The recommendations UI writes a 'skip' feedback value, but the original
-- recommendation_feedback CHECK only allowed ('like','dislike','already_seen'),
-- so every skip insert failed silently. Widen the constraint to include it.
ALTER TABLE public.recommendation_feedback
  DROP CONSTRAINT IF EXISTS recommendation_feedback_feedback_check;

ALTER TABLE public.recommendation_feedback
  ADD CONSTRAINT recommendation_feedback_feedback_check
  CHECK (feedback IN ('like', 'dislike', 'already_seen', 'skip'));
