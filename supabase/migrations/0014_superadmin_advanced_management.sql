-- ============================================================================
-- MIGRATION 0014: SUPERADMIN EXPANDIDO / CONSOLE DE DESENVOLVEDOR MASTER
-- Anotações internas, logs de auditoria do SuperAdmin, broadcast de avisos
-- e RPCs com agregações reais de uso (pacientes, consultas, equipe, storage)
-- ============================================================================

-- 1. Anotações internas por clínica
CREATE TABLE IF NOT EXISTS public.platform_clinic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_notes_clinic
  ON public.platform_clinic_notes (clinic_id, created_at DESC);

ALTER TABLE public.platform_clinic_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_notes_superadmin" ON public.platform_clinic_notes;
CREATE POLICY "platform_notes_superadmin" ON public.platform_clinic_notes
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

-- 2. Log de ações e alterações executadas pelo SuperAdmin
CREATE TABLE IF NOT EXISTS public.platform_superadmin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_audit_logs
  ON public.platform_superadmin_audit_logs (created_at DESC);

ALTER TABLE public.platform_superadmin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_audit_superadmin" ON public.platform_superadmin_audit_logs;
CREATE POLICY "platform_audit_superadmin" ON public.platform_superadmin_audit_logs
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

-- 3. Mensagens e Avisos Globais / Individuais enviados pelo SuperAdmin
CREATE TABLE IF NOT EXISTS public.platform_broadcast_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE, -- NULL = todas as clínicas
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent', 'maintenance')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_broadcast_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_announcements_superadmin" ON public.platform_broadcast_announcements;
CREATE POLICY "platform_announcements_superadmin" ON public.platform_broadcast_announcements
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "platform_announcements_clinic_read" ON public.platform_broadcast_announcements;
CREATE POLICY "platform_announcements_clinic_read" ON public.platform_broadcast_announcements
  FOR SELECT TO authenticated
  USING (target_clinic_id IS NULL OR public.user_has_permission(target_clinic_id, 'dashboard.view'));

-- 4. Função agregada para estatísticas reais e detalhadas de todas as clínicas
CREATE OR REPLACE FUNCTION public.get_superadmin_clinics_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o desenvolvedor master pode acessar.';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'cnpj', c.cnpj,
      'phone', c.phone,
      'email', c.email,
      'address', c.address,
      'plan_id', COALESCE(c.plan_id, 'pro'),
      'subscription_status', COALESCE(c.subscription_status, 'active'),
      'trial_ends_at', c.trial_ends_at,
      'current_period_end', c.current_period_end,
      'created_at', c.created_at,
      'plan_name', COALESCE(p.name, 'SondaPro Pro'),
      'monthly_price', COALESCE(p.monthly_price, 299.00),
      'owner_name', (
        SELECT prof.full_name
        FROM public.clinic_members cm
        JOIN public.profiles prof ON prof.id = cm.user_id
        WHERE cm.clinic_id = c.id AND cm.role = 'owner'
        LIMIT 1
      ),
      'owner_email', (
        SELECT u.email
        FROM public.clinic_members cm
        JOIN auth.users u ON u.id = cm.user_id
        WHERE cm.clinic_id = c.id AND cm.role = 'owner'
        LIMIT 1
      ),
      'patients_count', (SELECT COUNT(*) FROM public.patients WHERE clinic_id = c.id),
      'appointments_month_count', (
        SELECT COUNT(*) FROM public.appointments 
        WHERE clinic_id = c.id 
          AND starts_at >= date_trunc('month', NOW())
      ),
      'members_count', (SELECT COUNT(*) FROM public.clinic_members WHERE clinic_id = c.id),
      'dentists_count', (SELECT COUNT(*) FROM public.professionals WHERE clinic_id = c.id AND active = true),
      'last_appointment_at', (
        SELECT MAX(starts_at) FROM public.appointments WHERE clinic_id = c.id
      ),
      'exam_files_count', (SELECT COUNT(*) FROM public.patient_exam_files WHERE clinic_id = c.id),
      'exam_storage_bytes', (
        SELECT COALESCE(SUM(file_size_bytes), 0) FROM public.patient_exam_files WHERE clinic_id = c.id
      )
    ) ORDER BY c.created_at DESC
  ) INTO v_result
  FROM public.clinics c
  LEFT JOIN public.saas_plans p ON p.id = c.plan_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- 5. RPC para criar clínica manualmente pelo desenvolvedor
CREATE OR REPLACE FUNCTION public.superadmin_create_clinic(
  _name TEXT,
  _plan_id TEXT,
  _subscription_status TEXT,
  _owner_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_clinic_id UUID;
  v_user_id UUID;
BEGIN
  IF NOT public.is_platform_superadmin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas o desenvolvedor master pode criar clínicas.';
  END IF;

  INSERT INTO public.clinics (name, plan_id, subscription_status)
  VALUES (_name, _plan_id, _subscription_status)
  RETURNING id INTO v_clinic_id;

  -- Se foi informado e-mail de proprietário existente, vincula
  IF _owner_email IS NOT NULL AND _owner_email <> '' THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(_owner_email) LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.clinic_members (clinic_id, user_id, role)
      VALUES (v_clinic_id, v_user_id, 'owner')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Registra log de auditoria
  INSERT INTO public.platform_superadmin_audit_logs (admin_email, action, target_clinic_id, details)
  VALUES (
    auth.jwt()->>'email',
    'create_clinic',
    v_clinic_id,
    jsonb_build_object('name', _name, 'plan_id', _plan_id, 'status', _subscription_status, 'owner_email', _owner_email)
  );

  RETURN jsonb_build_object('success', true, 'clinic_id', v_clinic_id);
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_clinic_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_superadmin_audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_broadcast_announcements TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_superadmin_clinics_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_create_clinic(TEXT, TEXT, TEXT, TEXT) TO authenticated;

