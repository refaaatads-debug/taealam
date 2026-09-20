-- Durable idempotency keys for provider callbacks and wallet credits.
-- The partial indexes allow legacy rows with NULL provider references.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_stripe_session_unique
  ON public.payment_records(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_session_unique
  ON public.invoices(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_stripe_session_unique
  ON public.wallet_transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;