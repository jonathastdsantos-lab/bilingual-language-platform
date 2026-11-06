-- =============================================================================
-- MIGRATION 0029: FIX USER_HAS_PERMISSION E PRE-FLIGHT RBAC SECURITY
-- Garante que a função public.user_has_permission exista para todas as políticas RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.platform_superadmins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

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

CREATE OR REPLACE FUNCTION public.user_has_permission(_clinic_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_platform_superadmin() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.clinic_members cm
    WHERE cm.clinic_id = _clinic_id
      AND cm.user_id = auth.uid()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_superadmin(UUID) TO authenticated, anon, service_role;

