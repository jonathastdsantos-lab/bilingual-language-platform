-- ============================================================================
-- DRIZZLE MIGRATION 0017: WEBHOOKS REAIS DE GATEWAY DE PAGAMENTO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway TEXT NOT NULL CHECK (gateway IN ('asaas', 'mercadopago', 'stripe')),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  external_reference TEXT,
  invoice_id UUID REFERENCES public.saas_invoices(id) ON DELETE SET NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_gateway_status
  ON public.payment_webhook_events (gateway, event_type, processed);

CREATE INDEX IF NOT EXISTS idx_webhook_events_ext_ref
  ON public.payment_webhook_events (external_reference);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created
  ON public.payment_webhook_events (created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_gateway_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  asaas_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  asaas_environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (asaas_environment IN ('sandbox', 'production')),
  asaas_api_key TEXT,
  asaas_webhook_token TEXT,
  mercadopago_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mercadopago_environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (mercadopago_environment IN ('sandbox', 'production')),
  mercadopago_access_token TEXT,
  mercadopago_webhook_secret TEXT,
  stripe_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_gateway_settings ENABLE ROW LEVEL SECURITY;

