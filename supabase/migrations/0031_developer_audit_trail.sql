-- =============================================================================
-- MIGRATION 0031: REGISTRO DE AUDITORIA DO DESENVOLVEDOR (SUPERADMIN)
-- Rastreamento detalhado de alterações de acesso, planos e assinaturas
-- Quem fez, quando fez, o que mudou (antes x depois) e clínica/usuário afetado
-- =============================================================================

ALTER TABLE public.platform_superadmin_audit_logs
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS admin_name TEXT,
  ADD COLUMN IF NOT EXISTS target_clinic_name TEXT,
  ADD COLUMN IF NOT EXISTS target_user_email TEXT,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_category
  ON public.platform_superadmin_audit_logs (category);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_admin_email
  ON public.platform_superadmin_audit_logs (admin_email);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs_target_clinic
  ON public.platform_superadmin_audit_logs (target_clinic_id);
