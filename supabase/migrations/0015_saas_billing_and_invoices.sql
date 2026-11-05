-- ============================================================================
-- MIGRATION 0015: FATURAMENTO DIRETO CARTÃO / PIX PARA ASSINATURA SAAS
-- Gestão de faturas, geração de PIX copia-e-cola e renovação automática de planos
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

CREATE INDEX IF NOT EXISTS idx_saas_invoices_clinic
  ON public.saas_invoices (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_invoices_status
  ON public.saas_invoices (status, due_date ASC);

ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

-- Proprietários e administradores da clínica podem visualizar e pagar faturas
DROP POLICY IF EXISTS "saas_invoices_clinic_select" ON public.saas_invoices;
CREATE POLICY "saas_invoices_clinic_select" ON public.saas_invoices
  FOR SELECT TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "saas_invoices_clinic_insert" ON public.saas_invoices;
CREATE POLICY "saas_invoices_clinic_insert" ON public.saas_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "saas_invoices_clinic_update" ON public.saas_invoices;
CREATE POLICY "saas_invoices_clinic_update" ON public.saas_invoices
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  )
  WITH CHECK (
    public.user_has_permission(clinic_id, 'settings.manage')
    OR public.is_platform_superadmin()
  );

-- Função para liquidar fatura SaaS e atualizar o período do plano na clínica
CREATE OR REPLACE FUNCTION public.pay_saas_invoice(
  _invoice_id UUID,
  _payment_method TEXT,
  _card_last4 TEXT DEFAULT NULL,
  _card_brand TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_inv RECORD;
  v_interval INTERVAL;
BEGIN
  SELECT id, clinic_id, plan_id, billing_cycle, amount, status
  INTO v_inv
  FROM public.saas_invoices
  WHERE id = _invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Fatura não encontrada.');
  END IF;

  IF v_inv.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Esta fatura já foi paga anteriormente.');
  END IF;

  IF v_inv.billing_cycle = 'yearly' THEN
    v_interval := INTERVAL '1 year';
  ELSE
    v_interval := INTERVAL '30 days';
  END IF;

  -- 1. Atualiza fatura para paga
  UPDATE public.saas_invoices
  SET status = 'paid',
      paid_at = NOW(),
      payment_method = _payment_method,
      card_last4 = _card_last4,
      card_brand = _card_brand,
      updated_at = NOW()
  WHERE id = _invoice_id;

  -- 2. Atualiza a clínica para ativa e estende a validade
  UPDATE public.clinics
  SET plan_id = v_inv.plan_id,
      subscription_status = 'active',
      current_period_end = NOW() + v_interval
  WHERE id = v_inv.clinic_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Fatura liquidada com sucesso! Seu plano foi ativado/renovado.',
    'plan_id', v_inv.plan_id,
    'new_status', 'active'
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE ON public.saas_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_saas_invoice(UUID, TEXT, TEXT, TEXT) TO authenticated;

