-- =============================================================================
-- SondaPro — Migration 0009: Anamnese Digital Estruturada, Classificação ASA
-- e Alertas de Risco Cirúrgico Multi-Tenant
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patient_anamnesis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  asa_classification TEXT NOT NULL DEFAULT 'ASA I' CHECK (
    asa_classification IN ('ASA I', 'ASA II', 'ASA III', 'ASA IV')
  ),
  has_hypertension BOOLEAN NOT NULL DEFAULT FALSE,
  has_diabetes BOOLEAN NOT NULL DEFAULT FALSE,
  has_heart_disease BOOLEAN NOT NULL DEFAULT FALSE,
  uses_anticoagulants BOOLEAN NOT NULL DEFAULT FALSE,
  uses_bisphosphonates BOOLEAN NOT NULL DEFAULT FALSE,
  has_bleeding_disorder BOOLEAN NOT NULL DEFAULT FALSE,
  is_pregnant_or_lactating BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_local_anesthetic BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_penicillin BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_latex BOOLEAN NOT NULL DEFAULT FALSE,
  allergy_nsaids BOOLEAN NOT NULL DEFAULT FALSE,
  other_allergies TEXT,
  current_medications TEXT,
  has_bruxism BOOLEAN NOT NULL DEFAULT FALSE,
  is_smoker BOOLEAN NOT NULL DEFAULT FALSE,
  blood_pressure_systolic SMALLINT CHECK (
    blood_pressure_systolic IS NULL OR (blood_pressure_systolic BETWEEN 60 AND 280)
  ),
  blood_pressure_diastolic SMALLINT CHECK (
    blood_pressure_diastolic IS NULL OR (blood_pressure_diastolic BETWEEN 30 AND 180)
  ),
  chief_complaint TEXT,
  clinical_observations TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_patient_anamnesis_clinic_patient
  ON public.patient_anamnesis(clinic_id, patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_anamnesis TO authenticated;
GRANT ALL ON public.patient_anamnesis TO service_role;

ALTER TABLE public.patient_anamnesis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_anamnesis_select_policy" ON public.patient_anamnesis;
CREATE POLICY "patient_anamnesis_select_policy"
  ON public.patient_anamnesis
  FOR SELECT
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.read'));

DROP POLICY IF EXISTS "patient_anamnesis_write_policy" ON public.patient_anamnesis;
CREATE POLICY "patient_anamnesis_write_policy"
  ON public.patient_anamnesis
  FOR ALL
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'));

DROP TRIGGER IF EXISTS trg_audit_patient_anamnesis ON public.patient_anamnesis;
CREATE TRIGGER trg_audit_patient_anamnesis
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_anamnesis
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

