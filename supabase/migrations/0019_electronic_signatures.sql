-- ============================================================================
-- SONDAPRO — PARTE 19: ASSINATURA ELETRÔNICA TOUCH DE TERMOS E CONTRATOS (LEI 14.063/2020)
-- Permite coleta de assinaturas digitais na tela/tablet com integridade criptográfica SHA-256
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_electronic_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('tcle', 'contract', 'certificate', 'treatment_plan', 'prescription', 'other')),
  document_title text NOT NULL,
  document_content text NOT NULL,
  document_hash text NOT NULL,
  signer_name text NOT NULL,
  signer_cpf text NOT NULL,
  signer_role text NOT NULL DEFAULT 'patient' CHECK (signer_role IN ('patient', 'legal_guardian', 'representative', 'dentist')),
  signer_email text,
  signer_phone text,
  signature_data_url text NOT NULL,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
  revocation_reason text,
  revoked_at timestamptz,
  signed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signatures_clinic_patient
  ON public.patient_electronic_signatures (clinic_id, patient_id);

CREATE INDEX IF NOT EXISTS idx_signatures_hash
  ON public.patient_electronic_signatures (document_hash);

CREATE INDEX IF NOT EXISTS idx_signatures_signed_at
  ON public.patient_electronic_signatures (clinic_id, signed_at DESC);

-- RLS
ALTER TABLE public.patient_electronic_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signatures_select_policy" ON public.patient_electronic_signatures
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "signatures_insert_policy" ON public.patient_electronic_signatures
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "signatures_update_policy" ON public.patient_electronic_signatures
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT SELECT, INSERT, UPDATE ON public.patient_electronic_signatures TO authenticated;
GRANT SELECT ON public.patient_electronic_signatures TO anon;

