-- =============================================================================
-- SondaPro — Migration 0006: Relatórios Gerenciais (DRE Clínico) e Central de
-- Comunicação / Confirmação via WhatsApp Multi-Tenant
-- =============================================================================

-- 1. Atualização da função has_clinic_permission para incluir reports.view e whatsapp.manage
CREATE OR REPLACE FUNCTION public.has_clinic_permission(
  _user_id UUID,
  _clinic_id UUID,
  _permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.clinic_role;
  v_member_id UUID;
  v_override BOOLEAN;
BEGIN
  IF _user_id IS NULL OR _clinic_id IS NULL OR _permission IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id, role
    INTO v_member_id, v_role
    FROM public.clinic_members
   WHERE user_id = _user_id
     AND clinic_id = _clinic_id
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  SELECT granted
    INTO v_override
    FROM public.clinic_member_permissions
   WHERE clinic_id = _clinic_id
     AND member_id = v_member_id
     AND permission = _permission
   LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  CASE _permission
    WHEN 'dashboard.view' THEN
      RETURN TRUE;
    WHEN 'financial.view' THEN
      RETURN v_role IN ('admin', 'dentist', 'finance');
    WHEN 'financial.write' THEN
      RETURN v_role IN ('admin', 'finance', 'receptionist');
    WHEN 'patients.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist', 'assistant', 'finance');
    WHEN 'patients.write' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist');
    WHEN 'records.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'assistant');
    WHEN 'records.write' THEN
      RETURN v_role IN ('admin', 'dentist');
    WHEN 'appointments.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist', 'assistant', 'finance');
    WHEN 'appointments.write' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist');
    WHEN 'stock.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'assistant', 'stock', 'receptionist');
    WHEN 'stock.write' THEN
      RETURN v_role IN ('admin', 'stock', 'assistant');
    WHEN 'reports.view' THEN
      RETURN v_role IN ('admin', 'finance', 'dentist');
    WHEN 'whatsapp.manage' THEN
      RETURN v_role IN ('admin', 'receptionist', 'dentist', 'assistant');
    WHEN 'team.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'settings.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'units.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'audit.view' THEN
      RETURN v_role IN ('admin');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

-- 2. Tabela de Templates de Mensagens WhatsApp por Clínica (whatsapp_templates)
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  category TEXT NOT NULL CHECK (category IN ('confirmation', 'reminder', 'post_op', 'recall', 'financial')),
  body_template TEXT NOT NULL CHECK (char_length(trim(body_template)) >= 5),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_clinic
  ON public.whatsapp_templates(clinic_id, category);

-- 3. Tabela de Histórico de Disparos e Confirmações WhatsApp (whatsapp_dispatch_logs)
CREATE TABLE IF NOT EXISTS public.whatsapp_dispatch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  template_category TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  rendered_message TEXT NOT NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_dispatch_logs_clinic_created
  ON public.whatsapp_dispatch_logs(clinic_id, created_at DESC);

-- 4. Permissões e Habilitação de Row Level Security (RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT SELECT, INSERT ON public.whatsapp_dispatch_logs TO authenticated;
GRANT ALL ON public.whatsapp_templates, public.whatsapp_dispatch_logs TO service_role;

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_dispatch_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_templates_select_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_select_policy"
  ON public.whatsapp_templates
  FOR SELECT
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_templates_insert_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_insert_policy"
  ON public.whatsapp_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_templates_update_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_update_policy"
  ON public.whatsapp_templates
  FOR UPDATE
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_templates_delete_policy" ON public.whatsapp_templates;
CREATE POLICY "whatsapp_templates_delete_policy"
  ON public.whatsapp_templates
  FOR DELETE
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_dispatch_logs_select_policy" ON public.whatsapp_dispatch_logs;
CREATE POLICY "whatsapp_dispatch_logs_select_policy"
  ON public.whatsapp_dispatch_logs
  FOR SELECT
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

DROP POLICY IF EXISTS "whatsapp_dispatch_logs_insert_policy" ON public.whatsapp_dispatch_logs;
CREATE POLICY "whatsapp_dispatch_logs_insert_policy"
  ON public.whatsapp_dispatch_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'whatsapp.manage'));

-- 5. Triggers de Auditoria Automática
DROP TRIGGER IF EXISTS trg_audit_whatsapp_templates ON public.whatsapp_templates;
CREATE TRIGGER trg_audit_whatsapp_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS trg_audit_whatsapp_dispatch_logs ON public.whatsapp_dispatch_logs;
CREATE TRIGGER trg_audit_whatsapp_dispatch_logs
  AFTER INSERT ON public.whatsapp_dispatch_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

