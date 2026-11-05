-- ============================================================================
-- MIGRATION 0012 (DRIZZLE): PORTAL DO PACIENTE / CONFIRMAÇÃO DE CONSULTA PÚBLICA
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

ALTER TABLE public.appointment_confirmation_tokens ENABLE ROW LEVEL SECURITY;

