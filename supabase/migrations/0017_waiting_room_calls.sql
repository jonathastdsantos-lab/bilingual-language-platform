-- ============================================================================
-- MIGRATION 0017: PAINEL DE CHAMADA EM SALA DE ESPERA (TV / TOTEM)
-- Registro de chamadas de pacientes, consultório e som na recepção
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

CREATE INDEX IF NOT EXISTS idx_waiting_room_calls_clinic_time
  ON public.waiting_room_calls (clinic_id, called_at DESC);

CREATE INDEX IF NOT EXISTS idx_waiting_room_calls_status
  ON public.waiting_room_calls (clinic_id, status);

ALTER TABLE public.waiting_room_calls ENABLE ROW LEVEL SECURITY;

-- Permite leitura autenticada ou anon (para tela da TV na recepção com clinic_id)
DROP POLICY IF EXISTS "waiting_room_calls_select" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_select" ON public.waiting_room_calls
  FOR SELECT
  USING (
    public.user_has_permission(clinic_id, 'appointments.read')
    OR public.is_platform_superadmin()
    OR auth.role() = 'anon'
  );

-- Permite chamada por membros com permissão appointments.write
DROP POLICY IF EXISTS "waiting_room_calls_insert" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_insert" ON public.waiting_room_calls
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "waiting_room_calls_update" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_update" ON public.waiting_room_calls
  FOR UPDATE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  )
  WITH CHECK (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  );

DROP POLICY IF EXISTS "waiting_room_calls_delete" ON public.waiting_room_calls;
CREATE POLICY "waiting_room_calls_delete" ON public.waiting_room_calls
  FOR DELETE TO authenticated
  USING (
    public.user_has_permission(clinic_id, 'appointments.write')
    OR public.is_platform_superadmin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waiting_room_calls TO authenticated;
GRANT SELECT ON public.waiting_room_calls TO anon;
