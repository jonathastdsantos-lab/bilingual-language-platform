-- ============================================================================
-- MIGRATION 0018: WEBHOOKS REAIS DE GATEWAY DE PAGAMENTO (ASAAS / MERCADO PAGO)
-- Registro de eventos, idempotência, conciliação e credenciais de gateways
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

-- Configurações e credenciais de gateways da plataforma SondaPro
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

-- Insere configuração padrão se não existir
INSERT INTO public.platform_gateway_settings (id, asaas_enabled, mercadopago_enabled)
VALUES ('default', TRUE, TRUE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_gateway_settings ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança
-- Eventos: Leitura pelo SuperAdmin. Inserção permitida para gravação de webhook
DROP POLICY IF EXISTS "webhook_events_select" ON public.payment_webhook_events;
CREATE POLICY "webhook_events_select" ON public.payment_webhook_events
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS "webhook_events_insert_all" ON public.payment_webhook_events;
CREATE POLICY "webhook_events_insert_all" ON public.payment_webhook_events
  FOR INSERT
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS "webhook_events_update" ON public.payment_webhook_events;
CREATE POLICY "webhook_events_update" ON public.payment_webhook_events
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (TRUE);

-- Configurações de gateways: Somente SuperAdmin
DROP POLICY IF EXISTS "gateway_settings_select" ON public.platform_gateway_settings;
CREATE POLICY "gateway_settings_select" ON public.platform_gateway_settings
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS "gateway_settings_update" ON public.platform_gateway_settings;
CREATE POLICY "gateway_settings_update" ON public.platform_gateway_settings
  FOR UPDATE TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

GRANT SELECT, INSERT, UPDATE ON public.payment_webhook_events TO authenticated, anon;
GRANT SELECT, UPDATE ON public.platform_gateway_settings TO authenticated;

