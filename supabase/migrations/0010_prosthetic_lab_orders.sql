-- ============================================================================
-- MIGRATION 0010: CONTROLE DE LABORATÓRIO DE PRÓTESE (ORDENS DE SERVIÇO PROTÉTICAS)
-- Rastreamento de etapas laboratoriais, prazos de entrega, escala Vita e custo
-- laboratorial integrado ao Contas a Pagar (Multi-Tenant com RLS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.prosthetic_lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  laboratory_name TEXT NOT NULL,
  prosthesis_type TEXT NOT NULL,
  tooth_numbers TEXT,
  vita_shade TEXT,
  stage TEXT NOT NULL DEFAULT 'sent' CHECK (
    stage IN (
      'sent',
      'infrastructure_try_in',
      'teeth_try_in',
      'glaze_finish',
      'delivered_to_clinic',
      'installed_in_patient',
      'returned_adjustment'
    )
  ),
  sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  delivered_date DATE,
  lab_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (lab_cost >= 0),
  financial_entry_generated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prosthetic_lab_orders_clinic_patient
  ON public.prosthetic_lab_orders (clinic_id, patient_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_prosthetic_lab_orders_clinic_stage
  ON public.prosthetic_lab_orders (clinic_id, stage, due_date ASC);

ALTER TABLE public.prosthetic_lab_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prosthetic_lab_orders_select" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_select" ON public.prosthetic_lab_orders
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'records.read'));

DROP POLICY IF EXISTS "prosthetic_lab_orders_insert" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_insert" ON public.prosthetic_lab_orders
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(clinic_id, 'records.write'));

DROP POLICY IF EXISTS "prosthetic_lab_orders_update" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_update" ON public.prosthetic_lab_orders
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(clinic_id, 'records.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'records.write'));

DROP POLICY IF EXISTS "prosthetic_lab_orders_delete" ON public.prosthetic_lab_orders;
CREATE POLICY "prosthetic_lab_orders_delete" ON public.prosthetic_lab_orders
  FOR DELETE TO authenticated
  USING (public.user_has_permission(clinic_id, 'records.write'));

DROP TRIGGER IF EXISTS trg_audit_prosthetic_lab_orders ON public.prosthetic_lab_orders;
CREATE TRIGGER trg_audit_prosthetic_lab_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.prosthetic_lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prosthetic_lab_orders TO authenticated;

