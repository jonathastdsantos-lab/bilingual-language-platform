-- ============================================================================
-- MIGRATION 0026: WHATSAPP QR CODE, ENVIO AUTOMÁTICO NA AGENDA,
-- ALERTAS PARA O DONO & ASSISTENTE DO DONO
-- ============================================================================

-- 1. Instâncias de Conexão WhatsApp Direta (QR Code)
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'evolution' CHECK (provider IN ('evolution', 'zapi', 'baileys', 'generic')),
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connecting', 'qrcode', 'connected')),
  qrcode_base64 TEXT,
  connected_phone TEXT,
  profile_name TEXT,
  battery_level INTEGER,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_whatsapp_instances_clinic UNIQUE (clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_clinic ON public.whatsapp_instances (clinic_id);

-- 2. Configurações Globais de WhatsApp (Modo de Envio, Alertas para o Dono e Assistente)
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  send_mode TEXT NOT NULL DEFAULT 'automatic' CHECK (send_mode IN ('automatic', 'manual_web')),
  auto_send_on_booking BOOLEAN NOT NULL DEFAULT true,
  auto_send_on_cancel BOOLEAN NOT NULL DEFAULT true,
  owner_phone TEXT,
  owner_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
  alert_on_new_booking BOOLEAN NOT NULL DEFAULT true,
  alert_on_patient_confirm BOOLEAN NOT NULL DEFAULT true,
  alert_on_cancellation BOOLEAN NOT NULL DEFAULT true,
  alert_daily_summary BOOLEAN NOT NULL DEFAULT true,
  daily_summary_time TEXT NOT NULL DEFAULT '19:00',
  assistant_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Histórico de Alertas Disparados para o Dono
CREATE TABLE IF NOT EXISTS public.whatsapp_owner_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('new_booking', 'confirmed', 'cancelled', 'daily_summary', 'test')),
  recipient_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'pending', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_owner_alerts_clinic_date ON public.whatsapp_owner_alerts (clinic_id, created_at DESC);

-- Habilita RLS em todas as tabelas
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_owner_alerts ENABLE ROW LEVEL SECURITY;

-- Políticas para whatsapp_instances
DROP POLICY IF EXISTS "whatsapp_instances_select" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances_select" ON public.whatsapp_instances
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "whatsapp_instances_insert" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances_insert" ON public.whatsapp_instances
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "whatsapp_instances_update" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances_update" ON public.whatsapp_instances
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "whatsapp_instances_delete" ON public.whatsapp_instances;
CREATE POLICY "whatsapp_instances_delete" ON public.whatsapp_instances
  FOR DELETE TO authenticated
  USING (true);

-- Políticas para whatsapp_settings
DROP POLICY IF EXISTS "whatsapp_settings_all" ON public.whatsapp_settings;
CREATE POLICY "whatsapp_settings_all" ON public.whatsapp_settings
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para whatsapp_owner_alerts
DROP POLICY IF EXISTS "whatsapp_owner_alerts_all" ON public.whatsapp_owner_alerts;
CREATE POLICY "whatsapp_owner_alerts_all" ON public.whatsapp_owner_alerts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_owner_alerts TO authenticated;
GRANT SELECT ON public.whatsapp_instances TO anon;

-- Habilita publicação em tempo real para status de QR Code e alertas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_instances') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;
    END IF;
  END IF;
END $$;

