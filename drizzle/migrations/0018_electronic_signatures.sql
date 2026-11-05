CREATE TABLE IF NOT EXISTS public.patient_electronic_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_title text NOT NULL,
  document_content text NOT NULL,
  document_hash text NOT NULL,
  signer_name text NOT NULL,
  signer_cpf text NOT NULL,
  signer_role text NOT NULL DEFAULT 'patient',
  signer_email text,
  signer_phone text,
  signature_data_url text NOT NULL,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'valid',
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

ALTER TABLE public.patient_electronic_signatures ENABLE ROW LEVEL SECURITY;

