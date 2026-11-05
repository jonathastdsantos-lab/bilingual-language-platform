CREATE TABLE IF NOT EXISTS public.professional_digital_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  certificate_type text NOT NULL,
  issuer text NOT NULL,
  subject_name text NOT NULL,
  subject_cpf text NOT NULL,
  cro_number text,
  cro_state text,
  serial_number text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  certificate_public_pem text,
  cloud_account_email text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prof_cert_clinic_prof
  ON public.professional_digital_certificates (clinic_id, professional_id);

CREATE TABLE IF NOT EXISTS public.qualified_document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  certificate_id uuid REFERENCES public.professional_digital_certificates(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  document_title text NOT NULL,
  document_content text NOT NULL,
  document_hash text NOT NULL,
  cryptographic_signature text NOT NULL,
  validation_code text NOT NULL UNIQUE,
  validation_url text NOT NULL,
  signer_name text NOT NULL,
  signer_cpf text NOT NULL,
  signer_cro text NOT NULL,
  authority_chain text[] DEFAULT ARRAY[]::text[],
  timestamp_authority text DEFAULT 'ACT ICP-Brasil',
  signed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qual_sig_code
  ON public.qualified_document_signatures (validation_code);

ALTER TABLE public.professional_digital_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualified_document_signatures ENABLE ROW LEVEL SECURITY;

