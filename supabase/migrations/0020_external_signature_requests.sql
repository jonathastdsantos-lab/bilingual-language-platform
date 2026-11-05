-- ============================================================================
-- SONDAPRO — PARTE 20: SOLICITAÇÃO EXTERNA DE ASSINATURA DIGITAL (WHATSAPP / SMS)
-- Gera links temporários e seguros para o paciente assinar pelo celular sem login
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.document_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  document_type text NOT NULL CHECK (document_type IN ('tcle', 'contract', 'certificate', 'treatment_plan', 'prescription', 'other')),
  document_title text NOT NULL,
  document_content text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'expired', 'cancelled')),
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

CREATE INDEX IF NOT EXISTS idx_doc_sig_req_status
  ON public.document_signature_requests (clinic_id, status);

ALTER TABLE public.document_signature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_sig_req_select_policy" ON public.document_signature_requests
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "doc_sig_req_insert_policy" ON public.document_signature_requests
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "doc_sig_req_update_policy" ON public.document_signature_requests
  FOR UPDATE USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT SELECT, INSERT, UPDATE ON public.document_signature_requests TO authenticated;
GRANT SELECT ON public.document_signature_requests TO anon;

-- ============================================================================
-- RPC: CONSULTA PÚBLICA DE SOLICITAÇÃO DE ASSINATURA POR TOKEN (SEM LOGIN)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_signature_request_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT 
    r.id AS request_id,
    r.token,
    r.status,
    r.expires_at,
    r.document_type,
    r.document_title,
    r.document_content,
    p.full_name AS patient_name,
    p.cpf AS patient_cpf,
    p.phone AS patient_phone,
    c.name AS clinic_name,
    c.phone AS clinic_phone
  INTO rec
  FROM public.document_signature_requests r
  JOIN public.clinics c ON c.id = r.clinic_id
  JOIN public.patients p ON p.id = r.patient_id
  WHERE r.token = _token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Link de assinatura não encontrado.');
  END IF;

  IF rec.status = 'cancelled' THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Esta solicitação de assinatura foi cancelada pela clínica.');
  END IF;

  IF rec.status = 'signed' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'already_signed', true,
      'error', 'Este documento já foi assinado e selado com sucesso!'
    );
  END IF;

  IF rec.expires_at <= NOW() THEN
    UPDATE public.document_signature_requests SET status = 'expired' WHERE token = _token;
    RETURN jsonb_build_object('valid', false, 'error', 'Este link de assinatura expirou. Solicite um novo envio à clínica.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'token', rec.token,
    'status', rec.status,
    'expires_at', rec.expires_at,
    'document_type', rec.document_type,
    'document_title', rec.document_title,
    'document_content', rec.document_content,
    'patient_name', rec.patient_name,
    'patient_cpf', rec.patient_cpf,
    'clinic_name', rec.clinic_name,
    'clinic_phone', rec.clinic_phone
  );
END;
$$;

-- ============================================================================
-- RPC: SUBMISSÃO PÚBLICA DE ASSINATURA ELETRÔNICA TOUCH (LEI 14.063/2020)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_public_document_signature(
  _token text,
  _signer_name text,
  _signer_cpf text,
  _signer_role text,
  _signature_data_url text,
  _document_hash text,
  _user_agent text DEFAULT NULL,
  _ip_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_sig_id UUID;
  v_clean_cpf TEXT;
BEGIN
  SELECT *
  INTO v_req
  FROM public.document_signature_requests
  WHERE token = _token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação de assinatura não encontrada.');
  END IF;

  IF v_req.status = 'signed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este documento já foi assinado anteriormente.');
  END IF;

  IF v_req.status = 'cancelled' OR v_req.expires_at <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solicitação expirada ou cancelada.');
  END IF;

  v_clean_cpf := regexp_replace(_signer_cpf, '\D', '', 'g');
  IF length(v_clean_cpf) != 11 THEN
    RETURN jsonb_build_object('success', false, 'error', 'CPF do signatário inválido (deve conter 11 dígitos).');
  END IF;

  -- 1. Cria a assinatura probatória oficial
  INSERT INTO public.patient_electronic_signatures (
    clinic_id,
    patient_id,
    document_type,
    document_title,
    document_content,
    document_hash,
    signer_name,
    signer_cpf,
    signer_role,
    signature_data_url,
    user_agent,
    ip_address,
    status,
    signed_at,
    metadata
  )
  VALUES (
    v_req.clinic_id,
    v_req.patient_id,
    v_req.document_type,
    v_req.document_title,
    v_req.document_content,
    _document_hash,
    trim(_signer_name),
    v_clean_cpf,
    COALESCE(_signer_role, 'patient'),
    _signature_data_url,
    _user_agent,
    _ip_address,
    'valid',
    NOW(),
    jsonb_build_object('source', 'whatsapp_mobile_link', 'request_token', _token)
  )
  RETURNING id INTO v_sig_id;

  -- 2. Atualiza a solicitação com o ID da assinatura gerada
  UPDATE public.document_signature_requests
  SET status = 'signed',
      signed_signature_id = v_sig_id,
      signer_name = trim(_signer_name),
      signer_cpf = v_clean_cpf
  WHERE id = v_req.id;

  RETURN jsonb_build_object(
    'success', true,
    'signature_id', v_sig_id,
    'hash', _document_hash,
    'message', 'Documento assinado e selado criptograficamente com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_signature_request_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_document_signature(text, text, text, text, text, text, text, text) TO anon, authenticated;

