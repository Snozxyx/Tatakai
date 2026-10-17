-- TatakaiAPI only. No client policies and no Edge Functions.
CREATE TABLE IF NOT EXISTS public.tv_pairing_requests (
  id uuid PRIMARY KEY,
  pin_hash text NOT NULL UNIQUE,
  poll_hash text NOT NULL,
  public_key jsonb NOT NULL,
  phrase text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approving', 'approved', 'consumed', 'cancelled')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tv_pairing_expiry ON public.tv_pairing_requests(expires_at);
ALTER TABLE public.tv_pairing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tv_pairing_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tv_pairing_requests TO service_role;

-- Atomic lookup attempt counter, callable only by the API's service role.
CREATE OR REPLACE FUNCTION public.tv_pairing_lookup(p_pin_hash text)
RETURNS SETOF public.tv_pairing_requests LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.tv_pairing_requests SET attempts = attempts + 1
  WHERE pin_hash = p_pin_hash AND expires_at > now() AND status = 'pending' AND attempts < 10
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.tv_pairing_lookup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tv_pairing_lookup(text) TO service_role;
