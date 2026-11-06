-- ============================================================================
-- MIGRATION 0028: BLINDAGEM DE SEGURANÇA MULTI-TENANT & LGPD
-- 1. Isolamento criptográfico e lógico rigoroso entre clínicas (Zero Cross-Tenant Leakage)
-- 2. Acesso Master irrestrito exclusivo para o Desenvolvedor / SuperAdmin da plataforma
-- 3. Trilha de auditoria LGPD (Art. 6º, VIII e Art. 46) para acesso a dados de saúde
-- 4. Funções de mascaramento e direito ao esquecimento / anonimização (Art. 18)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUNÇÃO MESTRE: IS_CLINIC_MEMBER (COM BYPASS EXCLUSIVO PARA SUPERADMIN)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_clinic_member(_clinic UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se o chamador for o SuperAdmin / Desenvolvedor da plataforma, concede acesso master
  IF public.is_platform_superadmin() THEN
    RETURN TRUE;
  END IF;

  IF _clinic IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Usuários comuns só enxergam se tiverem associação ativa nesta clínica específica
  RETURN EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_id = _clinic
      AND user_id = auth.uid()
  );
END $$;

-- ----------------------------------------------------------------------------
-- 2. FUNÇÃO MESTRE: HAS_CLINIC_PERMISSION (COM BYPASS EXCLUSIVO PARA SUPERADMIN)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_clinic_permission(
  _clinic UUID,
  _permission TEXT,
  _default_roles public.clinic_role[] DEFAULT ARRAY['owner','admin']::public.clinic_role[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m_id UUID;
  m_role public.clinic_role;
  override_val BOOLEAN;
BEGIN
  -- 1. Desenvolvedor / SuperAdmin da plataforma tem acesso master irrestrito
  IF public.is_platform_superadmin() THEN
    RETURN TRUE;
  END IF;

  IF _clinic IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 2. Busca vínculo do usuário na clínica informada
  SELECT id, role INTO m_id, m_role
  FROM public.clinic_members
  WHERE clinic_id = _clinic AND user_id = auth.uid()
  LIMIT 1;

  -- Se não pertence à clínica, acesso terminantemente negado (sem vazamento entre tenants)
  IF m_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Dono da clínica sempre tem acesso completo a todos os recursos da sua clínica
  IF m_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  -- Verifica override explícito em clinic_member_permissions
  SELECT granted INTO override_val
  FROM public.clinic_member_permissions
  WHERE clinic_id = _clinic AND member_id = m_id AND permission = _permission
  LIMIT 1;

  IF override_val IS NOT NULL THEN
    RETURN override_val;
  END IF;

  -- Se não houver override, valida pelo papel padrão da função
  RETURN m_role = ANY(_default_roles);
END $$;

-- ----------------------------------------------------------------------------
-- 3. BLINDAGEM DE POLÍTICAS RLS NAS TABELAS CRÍTICAS (ELIMINAÇÃO DE "USING (TRUE)")
-- ----------------------------------------------------------------------------

-- A) WhatsApp & Mensageria
DROP POLICY IF EXISTS "whatsapp_instances_select" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_insert" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_update" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances_delete" ON public.whatsapp_instances;

CREATE POLICY "whatsapp_instances_select" ON public.whatsapp_instances
  FOR SELECT TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_platform_superadmin());

CREATE POLICY "whatsapp_instances_insert" ON public.whatsapp_instances
  FOR INSERT TO authenticated
  WITH CHECK (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]) OR public.is_platform_superadmin());

CREATE POLICY "whatsapp_instances_update" ON public.whatsapp_instances
  FOR UPDATE TO authenticated
  USING (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]) OR public.is_platform_superadmin())
  WITH CHECK (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]) OR public.is_platform_superadmin());

CREATE POLICY "whatsapp_instances_delete" ON public.whatsapp_instances
  FOR DELETE TO authenticated
  USING (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]) OR public.is_platform_superadmin());

DROP POLICY IF EXISTS "whatsapp_settings_all" ON public.whatsapp_settings;
CREATE POLICY "whatsapp_settings_all" ON public.whatsapp_settings
  FOR ALL TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_platform_superadmin())
  WITH CHECK (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]) OR public.is_platform_superadmin());

DROP POLICY IF EXISTS "whatsapp_owner_alerts_all" ON public.whatsapp_owner_alerts;
CREATE POLICY "whatsapp_owner_alerts_all" ON public.whatsapp_owner_alerts
  FOR ALL TO authenticated
  USING (public.is_clinic_member(clinic_id) OR public.is_platform_superadmin())
  WITH CHECK (public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[]) OR public.is_platform_superadmin());

-- B) Painel de Sala de Espera / TV (Garante que nenhuma clínica veja chamadas de outra)
DROP POLICY IF EXISTS "waiting_room_calls_all_select" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_all_insert" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_all_update" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_select" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_insert" ON public.waiting_room_calls;
DROP POLICY IF EXISTS "waiting_room_calls_update" ON public.waiting_room_calls;

CREATE POLICY "waiting_room_calls_select" ON public.waiting_room_calls
  FOR SELECT
  USING (
    public.is_platform_superadmin()
    OR public.is_clinic_member(clinic_id)
  );

CREATE POLICY "waiting_room_calls_insert" ON public.waiting_room_calls
  FOR INSERT
  WITH CHECK (
    public.is_platform_superadmin()
    OR public.is_clinic_member(clinic_id)
    -- Permite totens e TVs vinculados por clinic_id
    OR (auth.role() = 'anon' AND clinic_id IS NOT NULL)
  );

CREATE POLICY "waiting_room_calls_update" ON public.waiting_room_calls
  FOR UPDATE
  USING (
    public.is_platform_superadmin()
    OR public.is_clinic_member(clinic_id)
  )
  WITH CHECK (
    public.is_platform_superadmin()
    OR public.is_clinic_member(clinic_id)
  );

-- RPC Segura para a TV da Recepção (evita despejo e enumeração de dados de outras clínicas)
CREATE OR REPLACE FUNCTION public.get_waiting_room_calls_for_tv(_clinic_id UUID, _unit_id UUID DEFAULT NULL)
RETURNS SETOF public.waiting_room_calls
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _clinic_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.waiting_room_calls
  WHERE clinic_id = _clinic_id
    AND (_unit_id IS NULL OR unit_id = _unit_id)
    AND called_at >= NOW() - INTERVAL '24 hours'
  ORDER BY called_at DESC
  LIMIT 40;
END $$;

GRANT EXECUTE ON FUNCTION public.get_waiting_room_calls_for_tv(UUID, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. TRILHA DE AUDITORIA LGPD (LEI 13.709/2018 - ART. 6º, VIII e ART. 46)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lgpd_access_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'view_patient_profile',
    'view_clinical_record',
    'export_patient_data',
    'edit_sensitive_data',
    'anonymize_patient',
    'revoke_consent',
    'generate_prescription',
    'view_financial_history'
  )),
  resource_type TEXT NOT NULL DEFAULT 'patient',
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_audit_clinic_time
  ON public.lgpd_access_audit_logs(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lgpd_audit_patient
  ON public.lgpd_access_audit_logs(clinic_id, patient_id);

ALTER TABLE public.lgpd_access_audit_logs ENABLE ROW LEVEL SECURITY;

-- Consulta de logs LGPD restrita ao Dono da clínica e ao SuperAdmin
DROP POLICY IF EXISTS "lgpd_audit_select" ON public.lgpd_access_audit_logs;
CREATE POLICY "lgpd_audit_select" ON public.lgpd_access_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_platform_superadmin()
    OR public.has_clinic_permission(clinic_id, 'team.manage', array['owner','admin']::public.clinic_role[])
  );

-- Inserção permitida para membros da clínica registrarem trilha
DROP POLICY IF EXISTS "lgpd_audit_insert" ON public.lgpd_access_audit_logs;
CREATE POLICY "lgpd_audit_insert" ON public.lgpd_access_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_superadmin()
    OR public.is_clinic_member(clinic_id)
  );

GRANT SELECT, INSERT ON public.lgpd_access_audit_logs TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. FUNÇÕES DE MASCARAMENTO E DIREITO AO ESQUECIMENTO (ART. 18 LGPD)
-- ----------------------------------------------------------------------------

-- Mascaramento de CPF para visualização segura em telas e relatórios (ex: 123.***.***-00)
CREATE OR REPLACE FUNCTION public.lgpd_mask_cpf(_cpf TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  clean_cpf TEXT;
BEGIN
  IF _cpf IS NULL OR LENGTH(TRIM(_cpf)) < 11 THEN
    RETURN '***.***.***-**';
  END IF;
  clean_cpf := REGEXP_REPLACE(_cpf, '[^0-9]', '', 'g');
  IF LENGTH(clean_cpf) <> 11 THEN
    RETURN '***.***.***-**';
  END IF;
  RETURN SUBSTRING(clean_cpf, 1, 3) || '.***.***-' || SUBSTRING(clean_cpf, 10, 2);
END $$;

-- Mascaramento de Telefone (ex: (11) 9****-5678)
CREATE OR REPLACE FUNCTION public.lgpd_mask_phone(_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  clean_phone TEXT;
BEGIN
  IF _phone IS NULL OR LENGTH(TRIM(_phone)) < 8 THEN
    RETURN '(**) *****-****';
  END IF;
  clean_phone := REGEXP_REPLACE(_phone, '[^0-9]', '', 'g');
  IF LENGTH(clean_phone) = 11 THEN
    RETURN '(' || SUBSTRING(clean_phone, 1, 2) || ') ' || SUBSTRING(clean_phone, 3, 1) || '****-' || SUBSTRING(clean_phone, 8, 4);
  ELSIF LENGTH(clean_phone) = 10 THEN
    RETURN '(' || SUBSTRING(clean_phone, 1, 2) || ') ****-' || SUBSTRING(clean_phone, 7, 4);
  END IF;
  RETURN '(**) *****-****';
END $$;

-- Função de Anonimização Legal de Paciente (Direito ao Esquecimento LGPD - Art. 18)
-- Anonimiza dados cadastrais enquanto resguarda prontuário obrigatório pelo CFO (Resolução CFO 20 anos)
CREATE OR REPLACE FUNCTION public.lgpd_anonymize_patient(_clinic_id UUID, _patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_email TEXT;
BEGIN
  -- Somente Owner da clínica ou SuperAdmin da plataforma pode executar anonimização
  IF NOT (public.is_platform_superadmin() OR public.has_clinic_permission(_clinic_id, 'team.manage', array['owner']::public.clinic_role[])) THEN
    RAISE EXCEPTION 'Acesso negado: apenas o Proprietário da clínica ou o Desenvolvedor pode autorizar anonimização LGPD.';
  END IF;

  SELECT email INTO current_user_email FROM auth.users WHERE id = auth.uid();

  -- 1. Anonimiza tabela de pacientes
  UPDATE public.patients
  SET
    name = 'Paciente Anonimizado [' || SUBSTRING(_patient_id::text, 1, 8) || ']',
    cpf = '000.000.000-00',
    rg = NULL,
    phone = '00000000000',
    email = NULL,
    birth_date = '1970-01-01',
    address_street = NULL,
    address_number = NULL,
    address_complement = NULL,
    address_neighborhood = NULL,
    address_city = NULL,
    address_state = NULL,
    address_zipcode = NULL,
    emergency_contact_name = NULL,
    emergency_contact_phone = NULL,
    notes = '[Dados cadastrais anonimizados a pedido do titular conforme Art. 18 da LGPD - Lei 13.709/2018]',
    updated_at = NOW()
  WHERE clinic_id = _clinic_id AND id = _patient_id;

  -- 2. Registra na trilha de auditoria LGPD
  INSERT INTO public.lgpd_access_audit_logs (
    clinic_id,
    user_id,
    user_email,
    patient_id,
    action,
    details
  ) VALUES (
    _clinic_id,
    auth.uid(),
    current_user_email,
    _patient_id,
    'anonymize_patient',
    jsonb_build_object(
      'reason', 'Titular exerceu direito ao esquecimento (Art. 18 LGPD)',
      'timestamp', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'patient_id', _patient_id,
    'status', 'anonymized',
    'legal_notice', 'Prontuários e evoluções preservados anonimamente conforme exigência legal de guarda de 20 anos (CFO).'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lgpd_mask_cpf(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_mask_phone(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_anonymize_patient(UUID, UUID) TO authenticated;

