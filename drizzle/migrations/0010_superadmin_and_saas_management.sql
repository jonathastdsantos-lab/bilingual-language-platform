-- ============================================================================
-- MIGRATION 0010 (DRIZZLE): SUPERADMIN / DESENVOLVEDOR DA PLATAFORMA & SAAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.saas_plans(id) DEFAULT 'pro',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');

ALTER TABLE public.platform_superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_superadmins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saas_plans TO authenticated;

