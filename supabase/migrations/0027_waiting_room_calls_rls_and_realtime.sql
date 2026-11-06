-- ============================================================================
-- MIGRATION 0027: WAITING ROOM CALLS RLS & REALTIME PERMISSIONS
-- Permite sincronização instantânea de chamadas e monitoramento entre múltiplos navegadores
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waiting_room_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name TEXT NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'priority', 'urgent')),
  status TEXT NOT NULL DEFAULT 'called' CHECK (status IN ('called', 'in_attendance', 'completed', 'cancelled')),
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.waiting_room_calls ENABLE ROW LEVEL SECURITY;

-- Permite SELECT irrestrito para leitura pública da TV na recepção e painel
DROP POLICY IF EXISTS "waiting_room_calls_select" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_all_select" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_all_select" ON public.waiting_room_calls
  FOR SELECT
  USING (true);

-- Permite INSERT tanto para authenticated quanto anon (evita bloqueio em totens e tablets)
DROP POLICY IF EXISTS "waiting_room_calls_insert" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_all_insert" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_all_insert" ON public.waiting_room_calls
  FOR INSERT
  WITH CHECK (true);

-- Permite UPDATE para atualização de status (atendimento iniciado / finalizado)
DROP POLICY IF EXISTS "waiting_room_calls_update" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_all_update" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_all_update" ON public.waiting_room_calls
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Concede privilégios de acesso
GRANT ALL ON public.waiting_room_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.waiting_room_calls TO anon;

-- Habilita publicação no canal em tempo real do Supabase
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'waiting_room_calls'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.waiting_room_calls;
    END IF;
  END IF;
END $$;
