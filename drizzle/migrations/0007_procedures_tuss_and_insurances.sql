-- =============================================================================
-- SondaPro — Migration 0007 (Drizzle): Catálogo de Procedimentos (Tabela TUSS /
-- Honorários da Clínica) e Convênios Odontológicos (ANS) Multi-Tenant
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dental_insurances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  ans_code TEXT,
  cnpj TEXT,
  reimbursement_days INTEGER NOT NULL DEFAULT 30 CHECK (reimbursement_days BETWEEN 0 AND 180),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dental_insurances_clinic
  ON public.dental_insurances(clinic_id, name);

CREATE TABLE IF NOT EXISTS public.procedure_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  insurance_id UUID REFERENCES public.dental_insurances(id) ON DELETE SET NULL,
  tuss_code TEXT,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 200),
  specialty TEXT NOT NULL DEFAULT 'Clínica Geral',
  base_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  estimated_material_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (estimated_material_cost >= 0),
  default_duration_minutes SMALLINT NOT NULL DEFAULT 60 CHECK (default_duration_minutes BETWEEN 10 AND 480),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procedure_catalog_clinic_name
  ON public.procedure_catalog(clinic_id, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dental_insurances, public.procedure_catalog TO authenticated;
GRANT ALL ON public.dental_insurances, public.procedure_catalog TO service_role;

ALTER TABLE public.dental_insurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedure_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dental_insurances_select_policy" ON public.dental_insurances;
CREATE POLICY "dental_insurances_select_policy"
  ON public.dental_insurances
  FOR SELECT
  TO authenticated
  USING (public.is_clinic_member(clinic_id));

DROP POLICY IF EXISTS "dental_insurances_write_policy" ON public.dental_insurances;
CREATE POLICY "dental_insurances_write_policy"
  ON public.dental_insurances
  FOR ALL
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'));

DROP POLICY IF EXISTS "procedure_catalog_select_policy" ON public.procedure_catalog;
CREATE POLICY "procedure_catalog_select_policy"
  ON public.procedure_catalog
  FOR SELECT
  TO authenticated
  USING (public.is_clinic_member(clinic_id));

DROP POLICY IF EXISTS "procedure_catalog_write_policy" ON public.procedure_catalog;
CREATE POLICY "procedure_catalog_write_policy"
  ON public.procedure_catalog
  FOR ALL
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'settings.manage'));

DROP TRIGGER IF EXISTS trg_audit_dental_insurances ON public.dental_insurances;
CREATE TRIGGER trg_audit_dental_insurances
  AFTER INSERT OR UPDATE OR DELETE ON public.dental_insurances
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_procedure_catalog ON public.procedure_catalog;
CREATE TRIGGER trg_audit_procedure_catalog
  AFTER INSERT OR UPDATE OR DELETE ON public.procedure_catalog
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

