-- ============================================================================
-- MIGRATION 0013 (DRIZZLE): SUPERADMIN EXPANDIDO / CONSOLE DE DESENVOLVEDOR
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_clinic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_superadmin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_broadcast_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'maintenance')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_clinic_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_superadmin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_broadcast_announcements ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_clinic_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_superadmin_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_broadcast_announcements TO authenticated;

