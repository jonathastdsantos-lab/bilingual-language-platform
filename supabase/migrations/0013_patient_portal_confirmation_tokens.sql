-- ============================================================================
-- MIGRATION 0013: PORTAL DO PACIENTE / CONFIRMAÇÃO DE CONSULTA PÚBLICA (TOKEN SEGURO)
-- Permite ao paciente confirmar presença ou solicitar remarcação via link único
-- do WhatsApp sem necessidade de criar conta ou fazer login.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointment_confirmation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  confirmed_at TIMESTAMPTZ,
  patient_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appt_tokens_lookup
  ON public.appointment_confirmation_tokens (token);

CREATE INDEX IF NOT EXISTS idx_appt_tokens_appointment
  ON public.appointment_confirmation_tokens (appointment_id);

ALTER TABLE public.appointment_confirmation_tokens ENABLE ROW LEVEL SECURITY;

-- 1. Usuários autenticados da clínica podem consultar e emitir tokens
DROP POLICY IF EXISTS "appt_tokens_clinic_select" ON public.appointment_confirmation_tokens;
CREATE POLICY "appt_tokens_clinic_select" ON public.appointment_confirmation_tokens
  FOR SELECT TO authenticated
  USING (public.user_has_permission(clinic_id, 'appointments.read'));

DROP POLICY IF EXISTS "appt_tokens_clinic_write" ON public.appointment_confirmation_tokens;
CREATE POLICY "appt_tokens_clinic_write" ON public.appointment_confirmation_tokens
  FOR ALL TO authenticated
  USING (public.user_has_permission(clinic_id, 'appointments.write'))
  WITH CHECK (public.user_has_permission(clinic_id, 'appointments.write'));

-- 2. ACESSO PÚBLICO (ANON) VIA FUNÇÃO SECURITY DEFINER
-- Não expõe a tabela inteira para SELECT público irrestrito; usa funções seguras.

-- Função para consultar dados do agendamento pelo token público
CREATE OR REPLACE FUNCTION public.get_public_appointment_by_token(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  result JSONB;
BEGIN
  SELECT 
    t.id AS token_id,
    t.token,
    t.status AS token_status,
    t.expires_at,
    a.id AS appointment_id,
    a.starts_at,
    a.ends_at,
    a.status AS appointment_status,
    a.procedure,
    p.full_name AS patient_name,
    c.name AS clinic_name,
    c.phone AS clinic_phone,
    u.name AS unit_name,
    u.address AS unit_address,
    pr.name AS professional_name
  INTO rec
  FROM public.appointment_confirmation_tokens t
  JOIN public.appointments a ON a.id = t.appointment_id
  JOIN public.clinics c ON c.id = t.clinic_id
  JOIN public.patients p ON p.id = a.patient_id
  LEFT JOIN public.clinic_units u ON u.id = a.unit_id
  LEFT JOIN public.professionals pr ON pr.id = a.professional_id
  WHERE t.token = _token
    AND t.expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Token de confirmação inválido ou expirado.');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'token', rec.token,
    'token_status', rec.token_status,
    'appointment_id', rec.appointment_id,
    'starts_at', rec.starts_at,
    'ends_at', rec.ends_at,
    'appointment_status', rec.appointment_status,
    'procedure', rec.procedure,
    'patient_name', rec.patient_name,
    'clinic_name', rec.clinic_name,
    'clinic_phone', rec.clinic_phone,
    'unit_name', rec.unit_name,
    'unit_address', rec.unit_address,
    'professional_name', rec.professional_name
  );
END;
$$;

-- Função para o paciente confirmar ou cancelar a consulta em 1 clique
CREATE OR REPLACE FUNCTION public.respond_public_appointment_confirmation(
  _token TEXT,
  _action TEXT, -- 'confirm' ou 'cancel'
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_id UUID;
  v_appt_id UUID;
  v_clinic_id UUID;
  v_token_status TEXT;
  v_expires_at TIMESTAMPTZ;
BEGIN
  SELECT id, appointment_id, clinic_id, status, expires_at
  INTO v_token_id, v_appt_id, v_clinic_id, v_token_status, v_expires_at
  FROM public.appointment_confirmation_tokens
  WHERE token = _token;

  IF NOT FOUND OR v_expires_at <= NOW() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Link de confirmação inválido ou expirado.');
  END IF;

  IF _action = 'confirm' THEN
    -- Atualiza token
    UPDATE public.appointment_confirmation_tokens
    SET status = 'confirmed',
        confirmed_at = NOW(),
        patient_notes = _notes
    WHERE id = v_token_id;

    -- Atualiza agendamento na agenda
    UPDATE public.appointments
    SET status = 'confirmed'
    WHERE id = v_appt_id;

    RETURN jsonb_build_object('success', true, 'status', 'confirmed', 'message', 'Presença confirmada com sucesso!');

  ELSIF _action = 'cancel' THEN
    UPDATE public.appointment_confirmation_tokens
    SET status = 'cancelled',
        confirmed_at = NOW(),
        patient_notes = _notes
    WHERE id = v_token_id;

    UPDATE public.appointments
    SET status = 'cancelled',
        notes = COALESCE(notes, '') || E'\n[Cancelado pelo paciente via link WhatsApp: ' || COALESCE(_notes, 'Sem justificativa') || ']'
    WHERE id = v_appt_id;

    RETURN jsonb_build_object('success', true, 'status', 'cancelled', 'message', 'Cancelamento registrado. Entraremos em contato para reagendar.');

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Ação inválida.');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_appointment_by_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_public_appointment_confirmation(TEXT, TEXT, TEXT) TO anon, authenticated;

