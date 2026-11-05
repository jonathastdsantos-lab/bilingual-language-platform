-- ============================================================================
-- DRIZZLE MIGRATION 0015: PRONTUÁRIO ODONTOPEDIÁTRICO ESPECIALIZADO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pediatric_dental_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  evaluator_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  dentition_stage TEXT NOT NULL DEFAULT 'deciduous' CHECK (dentition_stage IN ('deciduous', 'mixed', 'permanent')),
  pacifier_habit JSONB NOT NULL DEFAULT '{"active": false, "frequency": "none", "duration_years": 0}'::jsonb,
  thumb_sucking_habit JSONB NOT NULL DEFAULT '{"active": false, "frequency": "none", "duration_years": 0}'::jsonb,
  bottle_feeding_habit JSONB NOT NULL DEFAULT '{"active": false, "sleep_bottle": false, "sweetened": false}'::jsonb,
  mouth_breathing BOOLEAN NOT NULL DEFAULT FALSE,
  bruxism BOOLEAN NOT NULL DEFAULT FALSE,
  atypical_swallowing BOOLEAN NOT NULL DEFAULT FALSE,
  brushing_frequency_daily INT NOT NULL DEFAULT 2,
  fluoride_ppm INT NOT NULL DEFAULT 1100,
  toothpaste_amount TEXT NOT NULL DEFAULT 'rice_grain' CHECK (toothpaste_amount IN ('rice_grain', 'pea_size', 'standard')),
  floss_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (floss_frequency IN ('never', 'rarely', 'weekly', 'daily')),
  sugar_intake_frequency TEXT NOT NULL DEFAULT 'low' CHECK (sugar_intake_frequency IN ('low', 'moderate', 'high')),
  caries_risk_level TEXT NOT NULL DEFAULT 'low' CHECK (caries_risk_level IN ('low', 'moderate', 'high')),
  clinical_notes TEXT,
  assessment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pediatric_assessments_patient
  ON public.pediatric_dental_assessments (patient_id, assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_pediatric_assessments_clinic
  ON public.pediatric_dental_assessments (clinic_id);

ALTER TABLE public.pediatric_dental_assessments ENABLE ROW LEVEL SECURITY;

