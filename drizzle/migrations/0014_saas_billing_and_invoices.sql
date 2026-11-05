-- ============================================================================
-- MIGRATION 0014 (DRIZZLE): FATURAMENTO DIRETO CARTÃO / PIX PARA ASSINATURA SAAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saas_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.saas_plans(id),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  payment_method TEXT NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix', 'credit_card', 'bank_slip')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  pix_code TEXT,
  pix_qr_code_url TEXT,
  gateway_payment_id TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.saas_invoices TO authenticated;
