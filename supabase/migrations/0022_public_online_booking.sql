-- ============================================================================
-- SONDAPRO — PARTE 22: AGENDAMENTO ONLINE PÚBLICO PELO PACIENTE
-- Permite que pacientes agendem consultas pelo link da clínica na web/WhatsApp
-- ============================================================================

-- Adiciona slug único para a clínica (ex: 'clinica-sorriso-saopaulo')
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Configurações de agendamento online da clínica
CREATE TABLE IF NOT EXISTS public.clinic_booking_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  online_booking_enabled boolean NOT NULL DEFAULT TRUE,
  auto_confirm boolean NOT NULL DEFAULT FALSE,
  slot_duration_minutes int NOT NULL DEFAULT 30,
  start_hour text NOT NULL DEFAULT '08:00',
  end_hour text NOT NULL DEFAULT '18:00',
  operating_days int[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  available_procedures text[] NOT NULL DEFAULT ARRAY[
    'Avaliação Odontológica Geral',
    'Limpeza / Profilaxia Dental',
    'Urgência Odontológica / Dor',
    'Avaliação para Aparelho / Ortodontia',
    'Avaliação de Implantes / Prótese',
    'Clareamento Dental'
  ],
  instructions text DEFAULT 'Por favor, chegue com 10 minutos de antecedência munido de documento com foto.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_booking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "booking_settings_select_policy" ON public.clinic_booking_settings
  FOR SELECT USING (TRUE);

CREATE POLICY "booking_settings_write_policy" ON public.clinic_booking_settings
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_members WHERE user_id = auth.uid())
    OR auth.jwt() ->> 'email' = 'jonathastdsantos@gmail.com'
  );

GRANT SELECT ON public.clinic_booking_settings TO anon, authenticated;
GRANT ALL ON public.clinic_booking_settings TO authenticated;

-- ============================================================================
-- RPC: DADOS PÚBLICOS DA CLÍNICA PARA A PÁGINA DE AGENDAMENTO
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_clinic_booking_data(_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic RECORD;
  v_units JSONB;
  v_pros JSONB;
  v_settings RECORD;
BEGIN
  -- Busca clínica por slug ou id
  SELECT c.id, c.name, c.slug
  INTO v_clinic
  FROM public.clinics c
  WHERE c.slug = _identifier
     OR c.id::text = _identifier
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Clínica não encontrada.');
  END IF;

  -- Configurações
  SELECT *
  INTO v_settings
  FROM public.clinic_booking_settings
  WHERE clinic_id = v_clinic.id;

  -- Se não existir settings, assume default habilitado
  IF NOT FOUND THEN
    INSERT INTO public.clinic_booking_settings (clinic_id)
    VALUES (v_clinic.id)
    ON CONFLICT (clinic_id) DO NOTHING;

    SELECT *
    INTO v_settings
    FROM public.clinic_booking_settings
    WHERE clinic_id = v_clinic.id;
  END IF;

  IF NOT v_settings.online_booking_enabled THEN
    RETURN jsonb_build_object('valid', false, 'error', 'O agendamento online desta clínica está temporariamente suspenso.');
  END IF;

  -- Unidades ativas da clínica
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'name', u.name,
    'address', u.address,
    'phone', u.phone
  )), '[]'::jsonb)
  INTO v_units
  FROM public.clinic_units u
  WHERE u.clinic_id = v_clinic.id
    AND u.is_active = TRUE;

  -- Dentistas ativos da clínica
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'cro', p.cro,
    'specialty', p.specialty
  )), '[]'::jsonb)
  INTO v_pros
  FROM public.professionals p
  WHERE p.clinic_id = v_clinic.id
    AND p.is_active = TRUE;

  RETURN jsonb_build_object(
    'valid', true,
    'clinic_id', v_clinic.id,
    'clinic_name', v_clinic.name,
    'clinic_slug', v_clinic.slug,
    'units', v_units,
    'professionals', v_pros,
    'available_procedures', v_settings.available_procedures,
    'slot_duration_minutes', v_settings.slot_duration_minutes,
    'start_hour', v_settings.start_hour,
    'end_hour', v_settings.end_hour,
    'operating_days', v_settings.operating_days,
    'instructions', v_settings.instructions
  );
END;
$$;

-- ============================================================================
-- RPC: HORÁRIOS DISPONÍVEIS PARA A DATA ESCOLHIDA
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_public_available_booking_slots(
  _clinic_id uuid,
  _professional_id uuid,
  _date text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slots JSONB := '[]'::jsonb;
  v_start_time TIME := '08:00';
  v_end_time TIME := '18:00';
  v_curr_time TIME;
  v_starts_at TIMESTAMPTZ;
  v_ends_at TIMESTAMPTZ;
  v_occupied BOOLEAN;
  v_dur INT := 30;
BEGIN
  -- Lê horários configurados na clínica
  SELECT 
    v.start_hour::time, 
    v.end_hour::time, 
    v.slot_duration_minutes
  INTO v_start_time, v_end_time, v_dur
  FROM public.clinic_booking_settings v
  WHERE v.clinic_id = _clinic_id;

  IF NOT FOUND THEN
    v_start_time := '08:00';
    v_end_time := '18:00';
    v_dur := 30;
  END IF;

  v_curr_time := v_start_time;

  WHILE v_curr_time + (v_dur || ' minutes')::interval <= v_end_time LOOP
    v_starts_at := (_date || ' ' || v_curr_time)::timestamptz;
    v_ends_at := v_starts_at + (v_dur || ' minutes')::interval;

    -- Não exibe horários que já passaram se a data for hoje
    IF v_starts_at > NOW() THEN
      -- Checa se já existe consulta no horário para esse dentista
      SELECT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.clinic_id = _clinic_id
          AND (_professional_id IS NULL OR a.professional_id = _professional_id)
          AND a.status NOT IN ('cancelled', 'no_show')
          AND tstzrange(a.starts_at, a.ends_at) && tstzrange(v_starts_at, v_ends_at)
      ) INTO v_occupied;

      IF NOT v_occupied THEN
        v_slots := v_slots || to_jsonb(to_char(v_curr_time, 'HH24:MI'));
      END IF;
    END IF;

    v_curr_time := v_curr_time + (v_dur || ' minutes')::interval;
  END LOOP;

  RETURN v_slots;
END;
$$;

-- ============================================================================
-- RPC: CRIAÇÃO PÚBLICA DO AGENDAMENTO (PACIENTE + CONSULTA + TOKEN)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.submit_public_appointment_booking(
  _clinic_id uuid,
  _unit_id uuid,
  _professional_id uuid,
  _procedure text,
  _starts_at timestamptz,
  _patient_name text,
  _patient_cpf text,
  _patient_phone text,
  _patient_email text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_appt_id UUID;
  v_ends_at TIMESTAMPTZ;
  v_token_id UUID;
  v_token TEXT;
  v_dur INT := 30;
  v_clean_cpf TEXT;
  v_prof_id UUID := _professional_id;
  v_room_id UUID;
  v_auto_confirm BOOLEAN := FALSE;
  v_status public.appointment_status := 'scheduled';
BEGIN
  -- Duração do slot
  SELECT slot_duration_minutes, auto_confirm
  INTO v_dur, v_auto_confirm
  FROM public.clinic_booking_settings
  WHERE clinic_id = _clinic_id;

  IF NOT FOUND THEN
    v_dur := 30;
  END IF;

  IF v_auto_confirm THEN
    v_status := 'confirmed';
  END IF;

  v_ends_at := _starts_at + (COALESCE(v_dur, 30) || ' minutes')::interval;

  -- Se profissional não foi informado, seleciona o primeiro ativo da clínica
  IF v_prof_id IS NULL THEN
    SELECT id INTO v_prof_id
    FROM public.professionals
    WHERE clinic_id = _clinic_id AND is_active = TRUE
    LIMIT 1;
  END IF;

  -- Sala padrão (primeira da clínica)
  SELECT id INTO v_room_id
  FROM public.rooms
  WHERE clinic_id = _clinic_id
  LIMIT 1;

  v_clean_cpf := regexp_replace(COALESCE(_patient_cpf, ''), '\D', '', 'g');
  IF length(v_clean_cpf) = 0 THEN
    v_clean_cpf := NULL;
  END IF;

  -- 1. Busca ou cria paciente
  IF v_clean_cpf IS NOT NULL THEN
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE clinic_id = _clinic_id AND cpf = v_clean_cpf
    LIMIT 1;
  END IF;

  IF v_patient_id IS NULL THEN
    INSERT INTO public.patients (
      clinic_id,
      full_name,
      cpf,
      phone,
      whatsapp,
      email
    )
    VALUES (
      _clinic_id,
      trim(_patient_name),
      v_clean_cpf,
      _patient_phone,
      _patient_phone,
      _patient_email
    )
    RETURNING id INTO v_patient_id;
  ELSE
    -- Atualiza telefone/email se informado
    UPDATE public.patients
    SET phone = COALESCE(_patient_phone, phone),
        whatsapp = COALESCE(_patient_phone, whatsapp),
        email = COALESCE(_patient_email, email)
    WHERE id = v_patient_id;
  END IF;

  -- 2. Insere consulta
  INSERT INTO public.appointments (
    clinic_id,
    unit_id,
    patient_id,
    professional_id,
    room_id,
    starts_at,
    ends_at,
    status,
    procedure,
    notes
  )
  VALUES (
    _clinic_id,
    _unit_id,
    v_patient_id,
    v_prof_id,
    v_room_id,
    _starts_at,
    v_ends_at,
    v_status,
    COALESCE(_procedure, 'Avaliação Odontológica'),
    _notes
  )
  RETURNING id INTO v_appt_id;

  -- 3. Cria token público de confirmação
  v_token := 'appt_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.appointment_confirmation_tokens (
    clinic_id,
    appointment_id,
    token,
    status,
    expires_at
  )
  VALUES (
    _clinic_id,
    v_appt_id,
    v_token,
    'pending',
    _starts_at + interval '2 hours'
  )
  RETURNING id INTO v_token_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', v_appt_id,
    'token', v_token,
    'status', v_status,
    'starts_at', _starts_at,
    'ends_at', v_ends_at,
    'message', 'Agendamento realizado com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_clinic_booking_data(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_available_booking_slots(uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_appointment_booking(uuid, uuid, uuid, text, timestamptz, text, text, text, text, text) TO anon, authenticated;

