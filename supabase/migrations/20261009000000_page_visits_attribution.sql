-- Page-visit attribution: UTM + precomputed traffic channel.
-- All columns nullable so historical rows keep working; new inserts fill them
-- from useAnalytics.trackPageVisit (channel is also derived client-side as a
-- fallback for rows written before this migration).

ALTER TABLE public.page_visits
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS referrer_host text,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS page_title text;

-- Channel values: 'Direct' | 'Organic Search' | 'Social' | 'Referral' | 'Internal' | 'Paid'.
CREATE INDEX IF NOT EXISTS idx_page_visits_created_channel
  ON public.page_visits (created_at DESC, channel);
CREATE INDEX IF NOT EXISTS idx_page_visits_referrer_host
  ON public.page_visits (referrer_host);
