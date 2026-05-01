CREATE TABLE IF NOT EXISTS public.domain_ssl_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  https_enabled boolean NOT NULL DEFAULT false,
  status_code integer,
  cert_valid boolean,
  cert_issuer text,
  cert_subject text,
  cert_valid_from timestamptz,
  cert_valid_to timestamptz,
  days_until_expiry integer,
  protocol text,
  response_time_ms integer,
  error_message text,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_domain_ssl_checks_domain ON public.domain_ssl_checks(domain);
CREATE INDEX IF NOT EXISTS idx_domain_ssl_checks_checked_at ON public.domain_ssl_checks(checked_at DESC);

ALTER TABLE public.domain_ssl_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ssl checks"
ON public.domain_ssl_checks FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert ssl checks"
ON public.domain_ssl_checks FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete ssl checks"
ON public.domain_ssl_checks FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));