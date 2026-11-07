-- =============================================================================
-- MIGRATION 0030: TELEODONTOLOGIA INTEGRADA (RESOLUÇÃO CFO 226/2020)
-- Regulamentação de Teleorientação, Telemonitoramento e Teleinterconsulta
-- Termo de Consentimento Livre e Esclarecido (TCLE) e Sala Virtual
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.teleodontology_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dentist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  interconsulta_specialist_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  modality TEXT NOT NULL CHECK (modality IN ('teleorientacao', 'telemonitoramento', 'teleinterconsulta')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'waiting_room', 'in_progress', 'completed', 'cancelled', 'no_show')),
  room_token TEXT NOT NULL UNIQUE,
  room_url TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  tcle_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  tcle_accepted_at TIMESTAMPTZ,
  tcle_ip TEXT,
  tcle_signature_hash TEXT,
  clinical_notes TEXT,
  prescriptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  patient_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  interconsulta_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teleodontology_sessions_clinic ON public.teleodontology_sessions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_teleodontology_sessions_patient ON public.teleodontology_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_teleodontology_sessions_token ON public.teleodontology_sessions(room_token);
CREATE INDEX IF NOT EXISTS idx_teleodontology_sessions_status ON public.teleodontology_sessions(status);

ALTER TABLE public.teleodontology_sessions ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para membros autenticados da clínica
DROP POLICY IF EXISTS "teleodontology_sessions_auth_select" ON public.teleodontology_sessions;
CREATE POLICY "teleodontology_sessions_auth_select" ON public.teleodontology_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_superadmin() OR
    EXISTS (SELECT 1 FROM public.clinic_members cm WHERE cm.clinic_id = teleodontology_sessions.clinic_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "teleodontology_sessions_auth_insert" ON public.teleodontology_sessions;
CREATE POLICY "teleodontology_sessions_auth_insert" ON public.teleodontology_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_superadmin() OR
    EXISTS (SELECT 1 FROM public.clinic_members cm WHERE cm.clinic_id = teleodontology_sessions.clinic_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "teleodontology_sessions_auth_update" ON public.teleodontology_sessions;
CREATE POLICY "teleodontology_sessions_auth_update" ON public.teleodontology_sessions
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_superadmin() OR
    EXISTS (SELECT 1 FROM public.clinic_members cm WHERE cm.clinic_id = teleodontology_sessions.clinic_id AND cm.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_platform_superadmin() OR
    EXISTS (SELECT 1 FROM public.clinic_members cm WHERE cm.clinic_id = teleodontology_sessions.clinic_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "teleodontology_sessions_auth_delete" ON public.teleodontology_sessions;
CREATE POLICY "teleodontology_sessions_auth_delete" ON public.teleodontology_sessions
  FOR DELETE TO authenticated
  USING (
    public.is_platform_superadmin() OR
    EXISTS (SELECT 1 FROM public.clinic_members cm WHERE cm.clinic_id = teleodontology_sessions.clinic_id AND cm.user_id = auth.uid())
  );

-- Políticas para acesso público/anônimo do paciente via room_token
DROP POLICY IF EXISTS "teleodontology_sessions_anon_select" ON public.teleodontology_sessions;
CREATE POLICY "teleodontology_sessions_anon_select" ON public.teleodontology_sessions
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "teleodontology_sessions_anon_update" ON public.teleodontology_sessions;
CREATE POLICY "teleodontology_sessions_anon_update" ON public.teleodontology_sessions
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teleodontology_sessions TO authenticated;
GRANT SELECT, UPDATE ON public.teleodontology_sessions TO anon;
GRANT ALL ON public.teleodontology_sessions TO service_role;

-- Publicação em Realtime para a sala de espera virtual
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'teleodontology_sessions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.teleodontology_sessions;
    END IF;
  END IF;
END $$;

