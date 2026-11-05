-- ============================================================================
-- SONDAPRO — PARTE 25: MÓDULO DE ORTODONTIA AVANÇADA
-- Controle de tratamentos ortodônticos, evolução de arcos/fios, elásticos,
-- braquetes recimentados e histórico cronológico de manutenções.
-- ============================================================================

-- 1. Tratamentos ortodônticos por paciente
CREATE TABLE IF NOT EXISTS public.orthodontic_treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE SET NULL,
  diagnosis text NOT NULL,
  appliance_type text NOT NULL DEFAULT 'Metálico Convencional',
  bracket_prescription text NOT NULL DEFAULT 'Roth .022',
  treatment_goal text DEFAULT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  estimated_duration_months int NOT NULL DEFAULT 24,
  monthly_fee numeric(10,2) NOT NULL DEFAULT 150.00,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retention', 'completed', 'interrupted')),
  upper_current_arch text DEFAULT '0.014 NiTi',
  lower_current_arch text DEFAULT '0.014 NiTi',
  notes text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_id)
);

-- 2. Histórico de sessões de manutenção ortodôntica
CREATE TABLE IF NOT EXISTS public.orthodontic_maintenances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id uuid NOT NULL REFERENCES public.orthodontic_treatments(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  maintenance_number int NOT NULL DEFAULT 1,
  maintenance_date date NOT NULL DEFAULT CURRENT_DATE,
  upper_archwire text DEFAULT NULL,
  lower_archwire text DEFAULT NULL,
  elastics_used text DEFAULT NULL,
  brackets_replaced text DEFAULT NULL,
  procedures_performed text NOT NULL,
  patient_hygiene_score text NOT NULL DEFAULT 'good' CHECK (patient_hygiene_score IN ('excellent', 'good', 'regular', 'poor')),
  next_step_plan text DEFAULT NULL,
  next_appointment_date date DEFAULT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ortho_treatments_clinic ON public.orthodontic_treatments(clinic_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_ortho_maintenances_treatment ON public.orthodontic_maintenances(treatment_id, maintenance_date);

-- RLS
ALTER TABLE public.orthodontic_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orthodontic_maintenances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orthodontic_treatments_policy" ON public.orthodontic_treatments
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "orthodontic_maintenances_policy" ON public.orthodontic_maintenances
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT ALL ON public.orthodontic_treatments TO authenticated;
GRANT ALL ON public.orthodontic_maintenances TO authenticated;

