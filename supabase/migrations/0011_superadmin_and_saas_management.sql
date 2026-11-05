-- ============================================================================
-- MIGRATION 0011: SUPERADMIN / DESENVOLVEDOR DA PLATAFORMA & GESTÃO SAAS
-- Usuário desenvolvedor master (jonathastdsantos@gmail.com)
-- Permite ao SuperAdmin gerenciar planos SaaS, clínicas cadastradas,
-- status de assinatura e métricas globais de crescimento do SondaPro.
-- ============================================================================

-- 1. Tabela de SuperAdmins da Plataforma
CREATE TABLE IF NOT EXISTS public.platform_superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabela de Planos SaaS da Plataforma (Starter, Pro, Corporate)
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  monthly_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  yearly_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  max_professionals INT NOT NULL DEFAULT 1,
  max_units INT NOT NULL DEFAULT 1,
  whatsapp_included BOOLEAN NOT NULL DEFAULT FALSE,
  storage_limit_mb INT NOT NULL DEFAULT 1000,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.saas_plans (id, name, description, monthly_price, yearly_price, max_professionals, max_units, whatsapp_included, storage_limit_mb)
VALUES
  ('starter', 'SondaPro Starter', 'Ideal para consultórios individuais e dentistas autônomos.', 149.00, 1490.00, 1, 1, false, 2000),
  ('pro', 'SondaPro Pro', 'Para clínicas em crescimento com equipe e múltiplos consultórios.', 299.00, 2990.00, 5, 2, true, 10000),
  ('corporate', 'SondaPro Corporate', 'Para redes de clínicas, franquias e policlínicas odontológicas.', 599.00, 5990.00, 999, 10, true, 50000)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price = EXCLUDED.monthly_price,
  yearly_price = EXCLUDED.yearly_price,
  max_professionals = EXCLUDED.max_professionals,
  max_units = EXCLUDED.max_units,
  whatsapp_included = EXCLUDED.whatsapp_included,
  storage_limit_mb = EXCLUDED.storage_limit_mb;

-- 3. Adiciona campos de plano e status de assinatura na tabela clinics
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.saas_plans(id) DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'cancelled')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

-- 4. Função auxiliar SECURITY DEFINER para verificar se o usuário é SuperAdmin da plataforma
CREATE OR REPLACE FUNCTION public.is_platform_superadmin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = user_uuid
      AND lower(u.email) = 'jonathastdsantos@gmail.com'
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_superadmins sa
    WHERE sa.user_id = user_uuid
      AND sa.is_active = TRUE
  );
$$;

-- 5. Trigger para vincular automaticamente o superadmin quando o usuário logar/criar conta
CREATE OR REPLACE FUNCTION public.handle_superadmin_user_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF lower(new.email) = 'jonathastdsantos@gmail.com' THEN
    INSERT INTO public.platform_superadmins (user_id, email, is_active)
    VALUES (new.id, lower(new.email), TRUE)
    ON CONFLICT (email) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      is_active = TRUE;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_superadmin_user_sync ON auth.users;
CREATE TRIGGER trg_superadmin_user_sync
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_superadmin_user_sync();

-- 6. Habilitar RLS nas tabelas
ALTER TABLE public.platform_superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_superadmins_select" ON public.platform_superadmins;
CREATE POLICY "platform_superadmins_select" ON public.platform_superadmins
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS "platform_superadmins_all" ON public.platform_superadmins;
CREATE POLICY "platform_superadmins_all" ON public.platform_superadmins
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "saas_plans_read" ON public.saas_plans;
CREATE POLICY "saas_plans_read" ON public.saas_plans
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "saas_plans_write" ON public.saas_plans;
CREATE POLICY "saas_plans_write" ON public.saas_plans
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

-- Permitir ao SuperAdmin ver todas as clínicas e membros para suporte técnico e faturamento SaaS
DROP POLICY IF EXISTS "superadmin_all_clinics" ON public.clinics;
CREATE POLICY "superadmin_all_clinics" ON public.clinics
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

DROP POLICY IF EXISTS "superadmin_all_members" ON public.clinic_members;
CREATE POLICY "superadmin_all_members" ON public.clinic_members
  FOR ALL TO authenticated
  USING (public.is_platform_superadmin())
  WITH CHECK (public.is_platform_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_superadmins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_plans TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin TO authenticated;

