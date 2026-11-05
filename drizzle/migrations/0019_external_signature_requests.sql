CREATE TABLE IF NOT EXISTS public.document_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  document_type text NOT NULL,
  document_title text NOT NULL,
  document_content text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  signed_signature_id uuid REFERENCES public.patient_electronic_signatures(id) ON DELETE SET NULL,
  signer_name text,
  signer_cpf text,
  signer_phone text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_sig_req_token
  ON public.document_signature_requests (token);

CREATE INDEX IF NOT EXISTS idx_doc_sig_req_clinic_patient
  ON public.document_signature_requests (clinic_id, patient_id);

ALTER TABLE public.document_signature_requests ENABLE ROW LEVEL SECURITY;

