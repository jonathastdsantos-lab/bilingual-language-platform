-- ============================================================================
-- SONDAPRO — PARTE 21: CERTIFICADO DIGITAL ICP-BRASIL & ASSINATURA QUALIFICADA
-- Conformidade com MP 2.200-2/2001, Lei 14.063/2020 e Portaria SVS/MS 344/1998
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.professional_digital_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  certificate_type text NOT NULL CHECK (certificate_type IN ('a1_file', 'cloud_birdid', 'cloud_safeid', 'cloud_vidaas', 'cloud_neoid')),
  issuer text NOT NULL,
  subject_name text NOT NULL,
  subject_cpf text NOT NULL,
  cro_number text,
  cro_state text,
  serial_number text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
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
  document_type text NOT NULL CHECK (document_type IN ('prescription_simple', 'prescription_controlled', 'certificate', 'tcle', 'other')),
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

CREATE INDEX IF NOT EXISTS idx_qual_sig_clinic_patient
  ON public.qualified_document_signatures (clinic_id, patient_id);

-- RLS
ALTER TABLE public.professional_digital_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualified_document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prof_cert_select_policy" ON public.professional_digital_certificates
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "prof_cert_insert_policy" ON public.professional_digital_certificates
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "prof_cert_update_policy" ON public.professional_digital_certificates
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "qual_sig_select_policy" ON public.qualified_document_signatures
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "qual_sig_insert_policy" ON public.qualified_document_signatures
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT SELECT, INSERT, UPDATE ON public.professional_digital_certificates TO authenticated;
GRANT SELECT, INSERT ON public.qualified_document_signatures TO authenticated;
GRANT SELECT ON public.qualified_document_signatures TO anon;

-- ============================================================================
-- RPC: VALIDAÇÃO PÚBLICA DE ASSINATURA QUALIFICADA ICP-BRASIL (FARMÁCIA / PACIENTE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_qualified_signature_validation(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT 
    s.id,
    s.validation_code,
    s.document_type,
    s.document_title,
    s.document_content,
    s.document_hash,
    s.cryptographic_signature,
    s.signer_name,
    s.signer_cpf,
    s.signer_cro,
    s.timestamp_authority,
    s.signed_at,
    c.name AS clinic_name,
    c.phone AS clinic_phone,
    p.full_name AS patient_name,
    p.cpf AS patient_cpf
  INTO rec
  FROM public.qualified_document_signatures s
  JOIN public.clinics c ON c.id = s.clinic_id
  JOIN public.patients p ON p.id = s.patient_id
  WHERE UPPER(s.validation_code) = UPPER(_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Código de validação de assinatura não encontrado.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'validation_code', rec.validation_code,
    'document_type', rec.document_type,
    'document_title', rec.document_title,
    'document_content', rec.document_content,
    'document_hash', rec.document_hash,
    'signer_name', rec.signer_name,
    'signer_cpf', rec.signer_cpf,
    'signer_cro', rec.signer_cro,
    'timestamp_authority', rec.timestamp_authority,
    'signed_at', rec.signed_at,
    'clinic_name', rec.clinic_name,
    'clinic_phone', rec.clinic_phone,
    'patient_name', rec.patient_name,
    'patient_cpf', rec.patient_cpf
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_qualified_signature_validation(text) TO anon, authenticated;

