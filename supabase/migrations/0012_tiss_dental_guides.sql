-- ============================================================================
-- MIGRATION 0012: GUIAS TISS / FATURAMENTO DE CONVÊNIOS ODONTOLÓGICOS (GTO)
-- Padrão ANS (Agência Nacional de Saúde Suplementar)
-- Rastreamento de guias, procedimentos TUSS, dente/face, autorizações e glosas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiss_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  insurance_id UUID REFERENCES public.dental_insurances(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  guide_number TEXT NOT NULL,
  auth_code TEXT,
  guide_type TEXT NOT NULL DEFAULT 'treatment' CHECK (guide_type IN ('treatment', 'initial_exam', 'urgency')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'authorized', 'billed', 'paid', 'glosed', 'cancelled')
  ),
  card_number TEXT NOT NULL,
  card_expiration DATE,
  cns_number TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billed_date DATE,
  paid_date DATE,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  glosed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (glosed_amount >= 0),
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tiss_guide_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE CASCADE,
  tuss_code TEXT NOT NULL,
  description TEXT NOT NULL,
  tooth_number INT,
  tooth_surface TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  glosed BOOLEAN NOT NULL DEFAULT FALSE,
  glosa_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiss_guides_clinic_status
  ON public.tiss_guides (clinic_id, status, issue_date DESC);

CREATE INDEX IF NOT EXISTS idx_tiss_guides_patient
  ON public.tiss_guides (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_tiss_guide_items_guide
  ON public.tiss_guide_items (guide_id);

ALTER TABLE public.tiss_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiss_guide_items ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para tiss_guides
DROP POLICY IF EXISTS "tiss_guides_select" ON public.tiss_guides;
CREATE POLICY "tiss_guides_select" ON public.tiss_guides
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.view'));

DROP POLICY IF EXISTS "tiss_guides_insert" ON public.tiss_guides;
CREATE POLICY "tiss_guides_insert" ON public.tiss_guides
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guides_update" ON public.tiss_guides;
CREATE POLICY "tiss_guides_update" ON public.tiss_guides
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guides_delete" ON public.tiss_guides;
CREATE POLICY "tiss_guides_delete" ON public.tiss_guides
  FOR DELETE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'));

-- Políticas de RLS para tiss_guide_items
DROP POLICY IF EXISTS "tiss_guide_items_select" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_select" ON public.tiss_guide_items
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.view'));

DROP POLICY IF EXISTS "tiss_guide_items_insert" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_insert" ON public.tiss_guide_items
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guide_items_update" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_update" ON public.tiss_guide_items
  FOR UPDATE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'financial.write'));

DROP POLICY IF EXISTS "tiss_guide_items_delete" ON public.tiss_guide_items;
CREATE POLICY "tiss_guide_items_delete" ON public.tiss_guide_items
  FOR DELETE TO authenticated
  USING (public.user_has_permission(clinic_id, 'financial.write'));

-- Auditoria
DROP TRIGGER IF EXISTS trg_audit_tiss_guides ON public.tiss_guides;
CREATE TRIGGER trg_audit_tiss_guides
  AFTER INSERT OR UPDATE OR DELETE ON public.tiss_guides
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_guides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_guide_items TO authenticated;

