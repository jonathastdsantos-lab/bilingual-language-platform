-- ============================================================================
-- SONDAPRO — PARTE 24: LEMBRETES AUTOMÁTICOS DE WHATSAPP (24H & 2H)
-- Disparo programado de lembretes antes das consultas para redução de faltas
-- ============================================================================

-- 1. Configurações de lembretes da clínica
CREATE TABLE IF NOT EXISTS public.whatsapp_reminder_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  enabled_24h boolean NOT NULL DEFAULT TRUE,
  enabled_2h boolean NOT NULL DEFAULT TRUE,
  template_24h text NOT NULL DEFAULT 'Olá, {paciente}! Lembramos da sua consulta amanhã ({data}) às {hora} na {clinica} com Dr(a). {profissional}. Para confirmar presença ou reagendar, acesse: {link_confirmacao}',
  template_2h text NOT NULL DEFAULT 'Olá, {paciente}! Passando para lembrar que sua consulta na {clinica} com Dr(a). {profissional} será hoje às {hora}. Estamos aguardando você!',
  auto_dispatch_active boolean NOT NULL DEFAULT FALSE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Fila e registro de lembretes por consulta
CREATE TABLE IF NOT EXISTS public.whatsapp_appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  reminder_type text NOT NULL CHECK (reminder_type IN ('24h', '2h')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz DEFAULT NULL,
  recipient_phone text DEFAULT NULL,
  message_text text DEFAULT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_reminders_clinic_status ON public.whatsapp_appointment_reminders(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON public.whatsapp_appointment_reminders(scheduled_for);

-- RLS
ALTER TABLE public.whatsapp_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_reminder_settings_policy" ON public.whatsapp_reminder_settings
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'receptionist', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

CREATE POLICY "whatsapp_appointment_reminders_policy" ON public.whatsapp_appointment_reminders
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM public.clinic_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'receptionist', 'dentist')
    )
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT ALL ON public.whatsapp_reminder_settings TO authenticated;
GRANT ALL ON public.whatsapp_appointment_reminders TO authenticated;

-- ============================================================================
-- RPC: BUSCAR PRÓXIMAS CONSULTAS E STATUS DOS LEMBRETES 24H E 2H
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_upcoming_appointment_reminders(_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res JSONB := '[]'::jsonb;
  rec RECORD;
  v_r24 RECORD;
  v_r2 RECORD;
  v_token TEXT;
BEGIN
  FOR rec IN (
    SELECT 
      a.id AS appt_id,
      a.starts_at,
      a.status AS appt_status,
      COALESCE(a.procedure, 'Consulta Odontológica') AS procedure_name,
      p.id AS patient_id,
      COALESCE(p.full_name, 'Paciente não informado') AS patient_name,
      COALESCE(p.whatsapp, p.phone, '') AS patient_phone,
      COALESCE(pr.name, 'Cirurgião-Dentista') AS prof_name
    FROM public.appointments a
    JOIN public.patients p ON p.id = a.patient_id
    LEFT JOIN public.professionals pr ON pr.id = a.professional_id
    WHERE a.clinic_id = _clinic_id
      AND a.status NOT IN ('cancelled', 'no_show', 'completed')
      AND a.starts_at >= now()
      AND a.starts_at <= now() + interval '48 hours'
    ORDER BY a.starts_at ASC
  ) LOOP
    -- Busca token de confirmação se houver
    SELECT token INTO v_token
    FROM public.appointment_confirmation_tokens
    WHERE appointment_id = rec.appt_id
    LIMIT 1;

    -- Busca status do lembrete 24h
    SELECT id, status, sent_at INTO v_r24
    FROM public.whatsapp_appointment_reminders
    WHERE appointment_id = rec.appt_id AND reminder_type = '24h';

    -- Busca status do lembrete 2h
    SELECT id, status, sent_at INTO v_r2
    FROM public.whatsapp_appointment_reminders
    WHERE appointment_id = rec.appt_id AND reminder_type = '2h';

    v_res := v_res || jsonb_build_object(
      'appointment_id', rec.appt_id,
      'starts_at', rec.starts_at,
      'appointment_status', rec.appt_status,
      'procedure_name', rec.procedure_name,
      'patient_id', rec.patient_id,
      'patient_name', rec.patient_name,
      'patient_phone', rec.patient_phone,
      'professional_name', rec.prof_name,
      'confirmation_token', v_token,
      'reminder_24h', jsonb_build_object(
        'id', v_r24.id,
        'status', COALESCE(v_r24.status, 'pending'),
        'sent_at', v_r24.sent_at
      ),
      'reminder_2h', jsonb_build_object(
        'id', v_r2.id,
        'status', COALESCE(v_r2.status, 'pending'),
        'sent_at', v_r2.sent_at
      )
    );
  END LOOP;

  RETURN v_res;
END;
$$;

-- ============================================================================
-- RPC: REGISTRAR ENVIO DO LEMBRETE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_appointment_reminder_sent(
  _clinic_id uuid,
  _appointment_id uuid,
  _patient_id uuid,
  _reminder_type text,
  _phone text,
  _message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.whatsapp_appointment_reminders (
    clinic_id,
    appointment_id,
    patient_id,
    reminder_type,
    status,
    scheduled_for,
    sent_at,
    recipient_phone,
    message_text
  )
  VALUES (
    _clinic_id,
    _appointment_id,
    _patient_id,
    _reminder_type,
    'sent',
    now(),
    now(),
    _phone,
    _message
  )
  ON CONFLICT (appointment_id, reminder_type) DO UPDATE
  SET status = 'sent',
      sent_at = now(),
      recipient_phone = EXCLUDED.recipient_phone,
      message_text = EXCLUDED.message_text
  RETURNING id INTO v_id;

  -- Registra no histórico geral de disparos de WhatsApp
  INSERT INTO public.whatsapp_dispatch_logs (
    clinic_id,
    patient_id,
    appointment_id,
    recipient_phone,
    message_body,
    channel,
    status,
    sent_at,
    created_by
  )
  VALUES (
    _clinic_id,
    _patient_id,
    _appointment_id,
    _phone,
    _message,
    'whatsapp_web',
    'sent',
    now(),
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'reminder_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_upcoming_appointment_reminders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_appointment_reminder_sent(uuid, uuid, uuid, text, text, text) TO authenticated;

